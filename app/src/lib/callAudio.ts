// Call quality on bad networks (1:1 and group calls):
// - tuneAudioSdp: Opus in-band FEC on, and RED (RFC 2198, every packet also carries the previous
//   one) preferred when both sides support it, so lost packets do not cut the voice;
// - prioritizeAudio: the voice gets the bandwidth first, video degrades before it;
// - QualityMeter: packet loss / round trip from getStats, for the "weak connection" notice and
//   the automatic camera stop of video calls.
// The mobile app does the same (mobile/lib/state/call_audio.dart).

/** Rewrites the audio sections of a local SDP (offer or answer) before it is applied. */
export function tuneAudioSdp(sdp: string): string {
  const eol = sdp.includes("\r\n") ? "\r\n" : "\n";
  const lines = sdp.split(eol);
  const out: string[] = [];
  let section: string[] = [];
  const flush = () => {
    out.push(...(section[0]?.startsWith("m=audio") ? tuneAudioSection(section) : section));
    section = [];
  };
  for (const line of lines) {
    if (line.startsWith("m=")) flush();
    section.push(line);
  }
  flush();
  return out.join(eol);
}

function payloadType(section: string[], codec: RegExp): string | null {
  for (const l of section) {
    const m = /^a=rtpmap:(\d+) ([^/]+)\//.exec(l);
    if (m && codec.test(m[2])) return m[1];
  }
  return null;
}

function tuneAudioSection(section: string[]): string[] {
  const opus = payloadType(section, /^opus$/i);
  if (!opus) return section;
  const lines = [...section];
  // Opus in-band forward error correction.
  const fmtp = lines.findIndex((l) => l.startsWith(`a=fmtp:${opus} `));
  if (fmtp >= 0) {
    const params = lines[fmtp].slice(`a=fmtp:${opus} `.length).split(";").filter((p) => p && !/^useinbandfec=/i.test(p.trim()));
    lines[fmtp] = `a=fmtp:${opus} ${[...params, "useinbandfec=1"].join(";")}`;
  } else {
    const rtpmap = lines.findIndex((l) => l.startsWith(`a=rtpmap:${opus} `));
    lines.splice(rtpmap + 1, 0, `a=fmtp:${opus} minptime=10;useinbandfec=1`);
  }
  // RED first in the codec list: the other side then sends redundant audio to us.
  const red = payloadType(lines, /^red$/i);
  if (red) {
    const parts = lines[0].split(" ");
    const pts = parts.slice(3).filter((p) => p !== red);
    lines[0] = [...parts.slice(0, 3), red, ...pts].join(" ");
    if (!lines.some((l) => l.startsWith(`a=fmtp:${red} `))) {
      const at = lines.findIndex((l) => l.startsWith(`a=rtpmap:${red} `));
      lines.splice(at + 1, 0, `a=fmtp:${red} ${opus}/${opus}`);
    }
  }
  return lines;
}

/** A local description with tuned audio (use it for setLocalDescription and the signal). */
export function tuned(d: RTCSessionDescriptionInit): RTCSessionDescriptionInit {
  return { type: d.type, sdp: d.sdp ? tuneAudioSdp(d.sdp) : d.sdp };
}

/** Voice first: audio senders get high priority, video low (it degrades first). */
export async function prioritizeAudio(pc: RTCPeerConnection): Promise<void> {
  for (const sender of pc.getSenders()) {
    const kind = sender.track?.kind;
    if (!kind) continue;
    try {
      const p = sender.getParameters();
      if (!p.encodings?.length) continue;
      const priority: RTCPriorityType = kind === "audio" ? "high" : "low";
      for (const e of p.encodings) {
        e.priority = priority;
        e.networkPriority = priority;
      }
      await sender.setParameters(p);
    } catch (e) {
      console.debug("call priority", e);
    }
  }
}

export type QualityLevel = "good" | "poor" | "bad";

export interface Quality {
  level: QualityLevel;
  /** Whose connection looks weak: ours (what we send is lost), the peer's, or unknown. */
  who: "me" | "peer" | null;
  /** Estimated bandwidth we can send with (bits/s), when known. */
  outBitrate: number | null;
}

/** Turns successive getStats() samples into a smoothed quality reading. */
export class QualityMeter {
  private lost = 0;
  private received = 0;
  private pending: QualityLevel = "good";
  private pendingCount = 0;
  private level: QualityLevel = "good";

  async sample(pc: RTCPeerConnection): Promise<Quality> {
    const stats = await pc.getStats();
    let lost = 0;
    let received = 0;
    let outLoss = 0;
    let rtt: number | null = null;
    let outBitrate: number | null = null;
    let pairId: string | null = null;
    stats.forEach((r) => {
      if (r.type === "transport" && r.selectedCandidatePairId) pairId = r.selectedCandidatePairId;
    });
    stats.forEach((r) => {
      if (r.type === "inbound-rtp" && r.kind === "audio") {
        lost += r.packetsLost ?? 0;
        received += r.packetsReceived ?? 0;
      } else if (r.type === "remote-inbound-rtp" && r.kind === "audio") {
        outLoss = Math.max(outLoss, r.fractionLost ?? 0);
        if (typeof r.roundTripTime === "number") rtt = r.roundTripTime;
      } else if (r.type === "candidate-pair" && (r.id === pairId || (!pairId && r.nominated && r.state === "succeeded"))) {
        if (typeof r.currentRoundTripTime === "number") rtt = r.currentRoundTripTime;
        if (typeof r.availableOutgoingBitrate === "number") outBitrate = r.availableOutgoingBitrate;
      }
    });
    const dLost = Math.max(0, lost - this.lost);
    const dRecv = Math.max(0, received - this.received);
    this.lost = lost;
    this.received = received;
    const inLoss = dLost + dRecv > 0 ? dLost / (dLost + dRecv) : 0;
    const raw = classify(Math.max(inLoss, outLoss), rtt);
    // Two samples in a row before the shown level changes (no flicker).
    if (raw === this.pending) this.pendingCount++;
    else {
      this.pending = raw;
      this.pendingCount = 1;
    }
    if (this.pendingCount >= 2) this.level = raw;
    let who: Quality["who"] = null;
    if (outLoss > 0.03 && outLoss >= inLoss * 1.5) who = "me";
    else if (inLoss > 0.03) who = "peer";
    return { level: this.level, who, outBitrate };
  }
}

export function classify(loss: number, rtt: number | null): QualityLevel {
  const r = rtt ?? 0;
  if (loss > 0.1 || r > 0.7) return "bad";
  if (loss > 0.03 || r > 0.4) return "poor";
  return "good";
}

/** Below this sending bandwidth a video call stops our camera, so the voice stays clear. */
export const VIDEO_MIN_BITRATE = 120_000;

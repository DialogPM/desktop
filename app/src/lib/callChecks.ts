// Checks on remote call signals before they reach WebRTC. Mirrors
// crates/chat-core/src/engine/call_checks.rs (the core already drops what fails these; this is
// the second line of defense): at most one audio and one video section over UDP/TLS/RTP/SAVPF,
// no data channels, a single SHA-256 DTLS fingerprint, a=setup present, ≤16 KB; ICE candidates
// capped and reduced to the fields WebRTC needs.

export const MAX_SDP_BYTES = 16 * 1024;
const MAX_SDP_LINE = 2048;
const MAX_SDP_CANDIDATES = 50;
/** Remote ICE candidates accepted per call. */
export const MAX_REMOTE_ICE = 50;
const MAX_CANDIDATE_BYTES = 512;
const MAX_SDP_MID = 32;
const MAX_UFRAG = 256;
const MAX_M_LINES = 2;
const PROTO = "UDP/TLS/RTP/SAVPF";
const ICE_OPTIONS = new Set(["trickle", "renomination", "ice2"]);
const SETUP = new Set(["actpass", "active", "passive"]);

interface Section {
  fingerprints: string[];
  setup: boolean;
}

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

function sha256Fingerprint(v: string): string | null {
  const i = v.indexOf(" ");
  if (i < 0 || v.slice(0, i).toLowerCase() !== "sha-256") return null;
  const value = v.slice(i + 1).trim();
  const bytes = value.split(":");
  if (bytes.length !== 32 || !bytes.every((b) => /^[0-9a-fA-F]{2}$/.test(b))) return null;
  return value.toUpperCase();
}

/** Whether a remote session description is one our clients would produce. */
export function validSdp(sdp: string): boolean {
  if (!sdp || byteLength(sdp) > MAX_SDP_BYTES) return false;
  const session: Section = { fingerprints: [], setup: false };
  const media: Section[] = [];
  let audio = 0;
  let video = 0;
  let candidates = 0;
  let first = true;
  for (const raw of sdp.split("\n")) {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    if (!line) continue;
    if (line.length > MAX_SDP_LINE || !/^[a-z]=/.test(line) || line.includes("\r")) return false;
    if (first) {
      if (line !== "v=0") return false;
      first = false;
      continue;
    }
    const type = line[0];
    const value = line.slice(2);
    if (type === "m") {
      const parts = value.split(" ");
      const port = Number(parts[1]);
      if (parts.length < 4 || !/^\d+$/.test(parts[1]) || port > 65535 || parts[2] !== PROTO) return false;
      if (parts[0] === "audio") audio++;
      else if (parts[0] === "video") video++;
      else return false;
      if (audio > 1 || video > 1) return false;
      media.push({ fingerprints: [], setup: false });
      continue;
    }
    if (type !== "a") continue;
    const colon = value.indexOf(":");
    const attr = colon < 0 ? value : value.slice(0, colon);
    const arg = colon < 0 ? "" : value.slice(colon + 1);
    const section = media[media.length - 1] ?? session;
    switch (attr) {
      case "fingerprint": {
        const fp = sha256Fingerprint(arg);
        if (!fp) return false;
        section.fingerprints.push(fp);
        break;
      }
      case "setup":
        if (!SETUP.has(arg)) return false;
        section.setup = true;
        break;
      case "ice-options":
        if (!arg.split(" ").every((t) => !t || ICE_OPTIONS.has(t))) return false;
        break;
      case "candidate":
        if (++candidates > MAX_SDP_CANDIDATES) return false;
        break;
      case "sctp-port":
      case "sctpmap":
        return false;
    }
  }
  if (first || media.length === 0 || media.length > MAX_M_LINES || session.fingerprints.length > 1) return false;
  let fingerprint: string | undefined = session.fingerprints[0];
  for (const m of media) {
    if (m.fingerprints.length > 1 || (!m.setup && !session.setup)) return false;
    const fp = m.fingerprints[0];
    if (fp === undefined && fingerprint === undefined) return false;
    if (fp !== undefined) {
      if (fingerprint !== undefined && fp !== fingerprint) return false;
      fingerprint = fp;
    }
  }
  return true;
}

/** One remote ICE candidate reduced to the RTCIceCandidateInit fields, or null if malformed. */
export function cleanCandidate(c: unknown): RTCIceCandidateInit | null {
  if (!c || typeof c !== "object") return null;
  const o = c as Record<string, unknown>;
  const candidate = o.candidate;
  if (
    typeof candidate !== "string" ||
    !candidate.startsWith("candidate:") ||
    byteLength(candidate) >= MAX_CANDIDATE_BYTES ||
    /[\r\n]/.test(candidate)
  ) {
    return null;
  }
  const out: RTCIceCandidateInit = { candidate };
  if (o.sdpMid != null) {
    if (typeof o.sdpMid !== "string" || o.sdpMid.length > MAX_SDP_MID || /[\r\n]/.test(o.sdpMid)) return null;
    out.sdpMid = o.sdpMid;
  }
  if (o.sdpMLineIndex != null) {
    const i = o.sdpMLineIndex;
    if (typeof i !== "number" || !Number.isInteger(i) || i < 0 || i >= MAX_M_LINES) return null;
    out.sdpMLineIndex = i;
  }
  if (o.usernameFragment != null) {
    if (typeof o.usernameFragment !== "string" || o.usernameFragment.length > MAX_UFRAG) return null;
    out.usernameFragment = o.usernameFragment;
  }
  return out;
}

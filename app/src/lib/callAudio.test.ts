import { describe, expect, it } from "vitest";
import { classify, tuneAudioSdp } from "./callAudio";

const CHROME = [
  "v=0",
  "o=- 1 2 IN IP4 127.0.0.1",
  "s=-",
  "t=0 0",
  "m=audio 9 UDP/TLS/RTP/SAVPF 111 63 9 0 8 13 110 126",
  "c=IN IP4 0.0.0.0",
  "a=rtpmap:111 opus/48000/2",
  "a=rtcp-fb:111 transport-cc",
  "a=fmtp:111 minptime=10;useinbandfec=0",
  "a=rtpmap:63 red/48000/2",
  "a=fmtp:63 111/111",
  "a=rtpmap:9 G722/8000",
  "m=video 9 UDP/TLS/RTP/SAVPF 96 97",
  "a=rtpmap:96 VP8/90000",
  "a=rtpmap:97 red/90000",
  "",
].join("\r\n");

describe("tuneAudioSdp", () => {
  it("prefers RED and turns on Opus FEC in audio only", () => {
    const out = tuneAudioSdp(CHROME);
    expect(out).toContain("m=audio 9 UDP/TLS/RTP/SAVPF 63 111 9 0 8 13 110 126\r\n");
    expect(out).toContain("a=fmtp:111 minptime=10;useinbandfec=1\r\n");
    expect(out).toContain("m=video 9 UDP/TLS/RTP/SAVPF 96 97\r\n");
    expect(out.endsWith("\r\n")).toBe(true);
  });

  it("adds what is missing and leaves SDPs without Opus alone", () => {
    const sdp = "v=0\nm=audio 9 RTP/SAVPF 111 63\na=rtpmap:111 opus/48000/2\na=rtpmap:63 red/48000/2\n";
    const out = tuneAudioSdp(sdp);
    expect(out).toContain("m=audio 9 RTP/SAVPF 63 111\n");
    expect(out).toContain("a=rtpmap:111 opus/48000/2\na=fmtp:111 minptime=10;useinbandfec=1\n");
    expect(out).toContain("a=rtpmap:63 red/48000/2\na=fmtp:63 111/111\n");
    const noOpus = "v=0\nm=audio 9 RTP/SAVPF 0\na=rtpmap:0 PCMU/8000\n";
    expect(tuneAudioSdp(noOpus)).toBe(noOpus);
    expect(tuneAudioSdp(tuneAudioSdp(CHROME))).toBe(tuneAudioSdp(CHROME));
  });
});

describe("classify", () => {
  it("grades loss and round trip", () => {
    expect(classify(0.01, 0.1)).toBe("good");
    expect(classify(0.05, 0.1)).toBe("poor");
    expect(classify(0.2, 0.1)).toBe("bad");
    expect(classify(0, 0.5)).toBe("poor");
    expect(classify(0, null)).toBe("good");
  });
});

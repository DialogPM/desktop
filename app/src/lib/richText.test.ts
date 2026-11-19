import { describe, expect, it } from "vitest";

import { parseBlocks, parseRich, plainText } from "./richText";

describe("rich text formatting", () => {
  it("formats marks, markdown bold and links", () => {
    expect(parseRich("hi *bold* and _it_ ~gone~")).toEqual([
      { t: "text", text: "hi " },
      { t: "bold", children: [{ t: "text", text: "bold" }] },
      { t: "text", text: " and " },
      { t: "italic", children: [{ t: "text", text: "it" }] },
      { t: "text", text: " " },
      { t: "strike", children: [{ t: "text", text: "gone" }] },
    ]);
    expect(parseRich("**strong** text")[0]).toEqual({ t: "bold", children: [{ t: "text", text: "strong" }] });
    const link = parseRich("see [docs](https://example.org/x) now");
    expect(link[1]).toMatchObject({ t: "link", text: "docs", href: "https://example.org/x" });
    // Marks before a markdown link are still formatted.
    expect(parseRich("*a* [b](https://example.org)")[0]).toEqual({ t: "bold", children: [{ t: "text", text: "a" }] });
  });

  it("nests and keeps plain text intact", () => {
    expect(plainText("*bold _in_ here* and `co*de`")).toBe("bold in here and co*de");
    expect(parseRich("a * b * c")).toEqual([{ t: "text", text: "a * b * c" }]);
    expect(plainText("snake_case_name stays")).toBe("snake_case_name stays");
  });

  it("survives a message with thousands of spans (no stack growth)", () => {
    const text = "*a* ".repeat(16_000);
    const segs = parseRich(text);
    expect(segs.length).toBeGreaterThan(500);
    expect(plainText(text).length).toBeLessThan(text.length);
    expect(parseBlocks(text)).toHaveLength(1);
  });

  it("bounds the work for unclosed markers", () => {
    for (const text of [" *a".repeat(21_845), " **a".repeat(16_384), " _a".repeat(21_845)]) {
      const t0 = performance.now();
      plainText(text);
      parseBlocks(text);
      expect(performance.now() - t0).toBeLessThan(2000);
    }
  });

  it("shows the text unformatted if the parser throws", () => {
    // A string whose `matchAll` is sabotaged stands in for any unexpected parser failure.
    const text = Object.assign(new String("*x*"), { matchAll: () => { throw new Error("boom"); } }) as unknown as string;
    expect(parseBlocks(text)).toEqual([{ t: "para", segs: [{ t: "text", text }] }]);
  });
});

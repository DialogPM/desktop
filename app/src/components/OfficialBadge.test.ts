import { describe, expect, it } from "vitest";
import { officialLabel } from "../lib/official";
import { OfficialBadge } from "./OfficialBadge";

describe("official badge", () => {
  it("has no label for missing, null, empty or blank values", () => {
    for (const v of [undefined, null, "", "   ", "\n\t"]) expect(officialLabel(v)).toBeNull();
    // Not a string at all (a malformed answer from the core).
    expect(officialLabel(42 as unknown as string)).toBeNull();
  });

  it("cleans and shortens the label", () => {
    expect(officialLabel("  Dialog \n Support ")).toBe("Dialog Support");
    const long = officialLabel("x".repeat(200))!;
    expect(long.length).toBe(48);
    expect(long.endsWith("…")).toBe(true);
  });

  it("renders nothing without a label", () => {
    for (const label of [undefined, null, "", "  "]) {
      expect(OfficialBadge({ label })).toBeNull();
    }
  });

  it("renders the mark with the cleaned label", () => {
    const el = OfficialBadge({ label: " Dialog Support ", size: 16 });
    expect(el).not.toBeNull();
    expect(el!.props).toEqual({ label: "Dialog Support", size: 16 });
  });
});

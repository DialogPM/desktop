import { describe, expect, it } from "vitest";
import { downloadPercent } from "./updateProgress";

describe("downloadPercent", () => {
  it("is unknown without a total", () => {
    expect(downloadPercent(10, null)).toBeNull();
    expect(downloadPercent(10, 0)).toBeNull();
  });
  it("rounds down and stays within 0..100", () => {
    expect(downloadPercent(0, 200)).toBe(0);
    expect(downloadPercent(199, 200)).toBe(99);
    expect(downloadPercent(200, 200)).toBe(100);
    expect(downloadPercent(300, 200)).toBe(100);
  });
});

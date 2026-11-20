import { describe, expect, it } from "vitest";
import { isOlder, parseVersion } from "./version";

describe("version", () => {
  it("parses plain versions only", () => {
    expect(parseVersion("0.1.2")).toEqual([0, 1, 2]);
    for (const bad of ["", "1.0", "1.0.0.0", "v1.0.0", "1.0.x", "1.0.12345", " 1.0.0", null, undefined]) {
      expect(parseVersion(bad)).toBeNull();
    }
  });

  it("compares numerically, part by part", () => {
    expect(isOlder("0.1.2", "0.1.3")).toBe(true);
    expect(isOlder("0.1.9", "0.1.10")).toBe(true);
    expect(isOlder("0.99.99", "1.0.0")).toBe(true);
    expect(isOlder("1.0.1", "1.0.1")).toBe(false);
    expect(isOlder("1.0.2", "1.0.1")).toBe(false);
  });

  it("never reports an update for something that is not a version", () => {
    expect(isOlder("0.1.2", "latest")).toBe(false);
    expect(isOlder("0.1.2", null)).toBe(false);
    expect(isOlder("dev", "9.9.9")).toBe(false);
  });
});

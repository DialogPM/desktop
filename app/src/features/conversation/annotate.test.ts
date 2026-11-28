import { describe, expect, it } from "vitest";
import { aspectRect, cropToSource, dragCrop, fontFor, outputSize, rotateShape, strokeFor, textHit, translateShape, type Rect, type Shape } from "./annotate";

describe("image editor", () => {
  it("keeps the original's resolution, whatever the screen shows", () => {
    expect(outputSize(4032, 3024, 0, null)).toEqual([4032, 3024]);
    expect(outputSize(4032, 3024, 90, null)).toEqual([3024, 4032]);
    expect(outputSize(4032, 3024, 270, { x: 10, y: 20, w: 1000, h: 500 })).toEqual([500, 1000]);
  });

  it("maps a crop frame drawn on the turned image back onto the original", () => {
    const whole: Rect = { x: 0, y: 0, w: 400, h: 300 };
    const frame: Rect = { x: 10, y: 20, w: 100, h: 50 };
    expect(cropToSource(frame, 0, whole)).toEqual({ x: 10, y: 20, w: 100, h: 50 });
    // Turned clockwise the image is 300 × 400: its left edge is the original's bottom edge.
    expect(cropToSource(frame, 90, whole)).toEqual({ x: 20, y: 190, w: 50, h: 100 });
    expect(cropToSource(frame, 180, whole)).toEqual({ x: 290, y: 230, w: 100, h: 50 });
    expect(cropToSource(frame, 270, whole)).toEqual({ x: 330, y: 10, w: 50, h: 100 });
    // A second crop is relative to the first one.
    expect(cropToSource(frame, 0, { x: 100, y: 100, w: 200, h: 150 })).toEqual({ x: 110, y: 120, w: 100, h: 50 });
    // Never outside the image.
    expect(cropToSource({ x: -5, y: -5, w: 1000, h: 1000 }, 0, whole)).toEqual(whole);
  });

  it("a point keeps its place on the picture across crop and rotation", () => {
    // A mark on original pixel (150, 120); crop to x 100.., y 100.. then turn clockwise.
    const mark: Shape = { kind: "pen", color: "#fff", width: 2, points: [[150, 120]] };
    const cropped = translateShape(mark, -100, -100) as Extract<Shape, { kind: "pen" }>;
    expect(cropped.points[0]).toEqual([50, 20]);
    const turned = rotateShape(cropped, 1, 200, 150) as Extract<Shape, { kind: "pen" }>;
    expect(turned.points[0]).toEqual([130, 50]);
    // Back onto the original through the same mapping the export uses.
    const src = cropToSource({ x: 130, y: 50, w: 1, h: 1 }, 90, { x: 100, y: 100, w: 200, h: 150 });
    expect([src.x, src.y + src.h]).toEqual([150, 120]);
  });

  it("drags the crop frame inside the image", () => {
    const start: Rect = { x: 100, y: 100, w: 200, h: 100 };
    expect(dragCrop(start, "se", 50, 20, 400, 300, null)).toEqual({ x: 100, y: 100, w: 250, h: 120 });
    expect(dragCrop(start, "nw", -500, -500, 400, 300, null)).toEqual({ x: 0, y: 0, w: 300, h: 200 });
    // Never smaller than the minimum, the opposite corner stays put.
    expect(dragCrop(start, "nw", 500, 500, 400, 300, null, 16)).toEqual({ x: 284, y: 184, w: 16, h: 16 });
    expect(dragCrop(start, "move", 1000, -1000, 400, 300, null)).toEqual({ x: 200, y: 0, w: 200, h: 100 });
    // Fixed ratio: the height follows the width and both stay inside.
    const sq = dragCrop(start, "se", 1000, 0, 400, 300, 1);
    expect(sq).toEqual({ x: 100, y: 100, w: 200, h: 200 });
  });

  it("offers the largest frame of a ratio", () => {
    expect(aspectRect(400, 300, null)).toEqual({ x: 0, y: 0, w: 400, h: 300 });
    expect(aspectRect(400, 300, 1)).toEqual({ x: 50, y: 0, w: 300, h: 300 });
    expect(aspectRect(400, 300, 16 / 9)).toEqual({ x: 0, y: 37.5, w: 400, h: 225 });
  });

  it("finds a text under the pointer, turned or not", () => {
    const text: Extract<Shape, { kind: "text" }> = { kind: "text", color: "#fff", size: 40, x: 100, y: 100, text: "hello" };
    expect(textHit(text, 150, 120, 120)).toBe(true);
    expect(textHit(text, 300, 120, 120)).toBe(false);
    expect(textHit(text, 150, 200, 120)).toBe(false);
    // After a clockwise quarter turn the text runs downwards from its anchor.
    const turned = { ...text, angle: 90 };
    expect(textHit(turned, 80, 160, 120)).toBe(true);
    expect(textHit(turned, 160, 110, 120)).toBe(false);
  });

  it("scales pen and text sizes with the image", () => {
    expect(strokeFor(4000)).toBe(20);
    expect(strokeFor(4000, 0.5)).toBe(10);
    expect(strokeFor(100, 0.5)).toBe(2);
    expect(fontFor(4000, 2.4)).toBe(211);
  });
});

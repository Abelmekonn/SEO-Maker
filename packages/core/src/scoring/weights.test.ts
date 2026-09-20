import { describe, expect, it } from "vitest";
import { redistribute } from "./weights";

type Dim = "a" | "b" | "c" | "d";
const weights: Record<Dim, number> = { a: 40, b: 30, c: 20, d: 10 };

function sumWeights(applied: Record<Dim, number>) {
  return Object.values(applied).reduce((sum, value) => sum + value, 0);
}

describe("redistribute", () => {
  it("keeps the original weights when every dimension is measured", () => {
    const result = redistribute(weights, { a: 1, b: 1, c: 1, d: 1 });
    expect(result.score).toBe(100);
    expect(result.notMeasured).toEqual([]);
    expect(result.weights).toEqual(weights);
  });

  it("scores proportionally when every dimension is measured", () => {
    const result = redistribute(weights, { a: 1, b: 0, c: 0.5, d: 0 });
    expect(result.score).toBe(50); // 40 + 0 + 10 + 0
  });

  it("spreads a dropped weight across the measured dimensions", () => {
    const result = redistribute(weights, { a: 1, b: 1, c: 1, d: null });
    expect(result.notMeasured).toEqual(["d"]);
    expect(sumWeights(result.weights)).toBeCloseTo(100, 10);
    expect(result.weights.d).toBe(0);
    // 40/30/20 renormalized over 90 -> 44.4 / 33.3 / 22.2
    expect(result.weights.a).toBeCloseTo(44.444, 3);
    expect(result.score).toBe(100);
  });

  it("never treats an unmeasured dimension as a zero", () => {
    const withNull = redistribute(weights, { a: 1, b: 1, c: 1, d: null });
    const withZero = redistribute(weights, { a: 1, b: 1, c: 1, d: 0 });
    expect(withNull.score).toBe(100);
    expect(withZero.score).toBe(90);
    expect(withNull.score).toBeGreaterThan(withZero.score!);
  });

  it("returns a null score when nothing could be measured", () => {
    const result = redistribute(weights, { a: null, b: null, c: null, d: null });
    expect(result.score).toBeNull();
    expect(result.notMeasured).toEqual(["a", "b", "c", "d"]);
    expect(sumWeights(result.weights)).toBe(0);
  });

  it("reports parts that sum back to the score", () => {
    const result = redistribute(weights, { a: 0.8, b: 0.5, c: null, d: 1 });
    const total = Object.values<{ points: number }>(result.parts).reduce(
      (sum, part) => sum + part.points,
      0,
    );
    expect(Math.round(total)).toBe(result.score);
  });

  it("gives a single measured dimension the full weight", () => {
    const result = redistribute(weights, { a: null, b: 0.5, c: null, d: null });
    expect(result.weights.b).toBe(100);
    expect(result.score).toBe(50);
  });
});

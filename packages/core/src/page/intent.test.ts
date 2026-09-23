import { describe, expect, it } from "vitest";
import { inferSearchIntent } from "./intent";

describe("inferSearchIntent", () => {
  it("reads informational intent from teaching wording", () => {
    const result = inferSearchIntent({ pageType: "article", title: "How to accept payments online" });
    expect(result.intent).toBe("informational");
    expect(result.confidence).toBeGreaterThan(0.75);
  });

  it("treats pricing pages as commercial", () => {
    expect(inferSearchIntent({ pageType: "pricing", title: "Pricing & fees | Stripe" }).intent).toBe("commercial");
  });

  it("prefers explicit wording over the page type, with lower confidence", () => {
    const result = inferSearchIntent({ pageType: "product", title: "Start your free trial" });
    expect(result.intent).toBe("transactional");
    expect(result.confidence).toBeLessThan(0.6);
    expect(result.evidence.join(" ")).toMatch(/uncertain/);
  });

  it("returns null rather than guessing when nothing is decisive", () => {
    const result = inferSearchIntent({ pageType: "other", title: "Stripe Sessions 2021" });
    expect(result.intent).toBeNull();
    expect(result.confidence).toBe(0);
  });
});

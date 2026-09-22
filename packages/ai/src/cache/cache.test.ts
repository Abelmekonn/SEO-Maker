import { describe, expect, it } from "vitest";
import { buildInputHash } from "./index";

const base = {
  feature: "title" as const,
  mode: "quick" as const,
  model: "m1",
  evidence: { title: "Old title", wordCount: 120 },
  knowledgeVersion: "2.1+2026-09-22",
};

describe("buildInputHash", () => {
  it("is stable for the same input", () => {
    expect(buildInputHash(base)).toBe(buildInputHash(base));
  });

  it("ignores key order in the evidence object", () => {
    const reordered = { ...base, evidence: { wordCount: 120, title: "Old title" } };
    expect(buildInputHash(reordered)).toBe(buildInputHash(base));
  });

  it("changes when the evidence changes", () => {
    const changed = { ...base, evidence: { title: "New title", wordCount: 120 } };
    expect(buildInputHash(changed)).not.toBe(buildInputHash(base));
  });

  it("changes when the knowledge version changes", () => {
    // A re-ingested corpus must invalidate every cached answer: the grounding
    // that produced them is no longer the grounding on disk.
    const changed = { ...base, knowledgeVersion: "2.2+2026-12-01" };
    expect(buildInputHash(changed)).not.toBe(buildInputHash(base));
  });

  it("changes when the prompt version changes", () => {
    const changed = { ...base, promptVersion: "9.9.9" };
    expect(buildInputHash(changed)).not.toBe(buildInputHash(base));
  });

  it("changes when the model changes", () => {
    expect(buildInputHash({ ...base, model: "m2" })).not.toBe(buildInputHash(base));
  });

  it("changes when the mode changes", () => {
    expect(buildInputHash({ ...base, mode: "deep" })).not.toBe(buildInputHash(base));
  });

  it("separates a quick run from a deep run carrying business context", () => {
    const withBusiness = { ...base, businessContext: { industry: "dentistry" } };
    expect(buildInputHash(withBusiness)).not.toBe(buildInputHash(base));
  });

  it("treats absent and null business context as the same", () => {
    expect(buildInputHash({ ...base, businessContext: null })).toBe(buildInputHash(base));
  });
});

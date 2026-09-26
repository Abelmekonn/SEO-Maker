import { planAllowsAi, planLimits } from "@seo-maker/core/plan";
import { describe, expect, it } from "vitest";

/**
 * Plan capability rules.
 *
 * Reads the shared plan table (@seo-maker/core/plan) that the web app and
 * the workers both enforce. Kept as a test so the intent is pinned: Free
 * experiences Page AI on its homepage under a quota; site and competitor AI
 * need a paid plan. A regression that quietly hands competitor AI to Free,
 * or lifts Free's quota, fails here.
 */

describe("plan capabilities", () => {
  it("gives free the crawl and the findings", () => {
    // The deterministic pass is never gated.
    expect(planLimits.free.maxProjects).toBeGreaterThan(0);
    expect(planLimits.free.maxPages).toBeGreaterThan(0);
  });

  it("gives free homepage Page AI under a daily and weekly quota", () => {
    expect(planAllowsAi(planLimits.free, "page")).toBe(true);
    expect(planLimits.free.aiHomepageOnly).toBe(true);
    expect(planLimits.free.aiDailyLimit).toBe(2);
    expect(planLimits.free.aiWeeklyLimit).toBe(10);
  });

  it("withholds competitor and site AI from free", () => {
    expect(planAllowsAi(planLimits.free, "competitor")).toBe(false);
    expect(planAllowsAi(planLimits.free, "site")).toBe(false);
  });

  it("grants every AI capability and deep mode on every paid plan", () => {
    for (const plan of [planLimits.pro, planLimits.agency]) {
      expect(planAllowsAi(plan, "page")).toBe(true);
      expect(planAllowsAi(plan, "site")).toBe(true);
      expect(planAllowsAi(plan, "competitor")).toBe(true);
      expect(plan.deepMode).toBe(true);
    }
  });

  it("gives free Deep Analysis", () => {
    expect(planLimits.free.deepMode).toBe(true);
  });
});

/** Mirrors the downgrade in POST /api/projects. */
function resolveMode(requested: "quick" | "deep", deepAllowed: boolean) {
  return deepAllowed ? requested : "quick";
}

describe("analysis mode resolution", () => {
  it("downgrades a deep request to quick on a plan without deep", () => {
    expect(resolveMode("deep", false)).toBe("quick");
  });

  it("honours deep on a plan that has it", () => {
    expect(resolveMode("deep", true)).toBe("deep");
  });

  it("leaves quick alone on every plan", () => {
    expect(resolveMode("quick", false)).toBe("quick");
    expect(resolveMode("quick", true)).toBe("quick");
  });
});

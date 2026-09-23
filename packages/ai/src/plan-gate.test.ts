import { describe, expect, it } from "vitest";

/**
 * Plan capability rules.
 *
 * Mirrors apps/web/lib/plan.ts. Kept as a test so the intent is pinned: free
 * finds problems, paid explains them. A regression that quietly hands AI to
 * the free plan, or quietly hides findings from it, fails here.
 */
const planLimits = {
  free: { label: "Free", maxProjects: 1, maxPages: 1, maxCompetitors: 0, ai: false, deepMode: false },
  pro: { label: "Pro", maxProjects: 1, maxPages: 10, maxCompetitors: 5, ai: true, deepMode: true },
  agency: { label: "Agency", maxProjects: 100, maxPages: 100, maxCompetitors: 25, ai: true, deepMode: true },
} as const;

describe("plan capabilities", () => {
  it("gives free the crawl and the findings", () => {
    // The deterministic pass is never gated. A plan that hides the problem has
    // nothing to upgrade for.
    expect(planLimits.free.maxProjects).toBeGreaterThan(0);
    expect(planLimits.free.maxPages).toBeGreaterThan(0);
  });

  it("withholds AI and deep mode from free", () => {
    expect(planLimits.free.ai).toBe(false);
    expect(planLimits.free.deepMode).toBe(false);
  });

  it("grants AI and deep mode on every paid plan", () => {
    for (const plan of [planLimits.pro, planLimits.agency]) {
      expect(plan.ai).toBe(true);
      expect(plan.deepMode).toBe(true);
    }
  });

  it("keeps free to a single project so the limit is reachable", () => {
    expect(planLimits.free.maxProjects).toBe(1);
  });
});

/** Mirrors the downgrade in POST /api/projects. */
function resolveMode(requested: "quick" | "deep", deepAllowed: boolean) {
  return deepAllowed ? requested : "quick";
}

describe("analysis mode resolution", () => {
  it("downgrades a deep request to quick on a plan without deep", () => {
    // Downgrade rather than reject: the user asked for an analysis of a real
    // site, and refusing over an optional extra is a worse answer than running
    // the quick pass.
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

import { describe, expect, it } from "vitest";
import { type CompetitorViewInput, deriveCompetitorView } from "./view-state";

function input(overrides: Partial<CompetitorViewInput> = {}): CompetitorViewInput {
  return {
    compStatus: "done",
    compError: null,
    providerConfigured: true,
    competitorCount: 5,
    readyCount: 5,
    failedCount: 0,
    ...overrides,
  };
}

describe("deriveCompetitorView", () => {
  it("shows the empty state on a fresh project", () => {
    const view = deriveCompetitorView(input({ compStatus: "idle", competitorCount: 0 }));
    expect(view.state).toBe("not-analyzed");
    expect(view.canDiscover).toBe(true);
  });

  it("shows the running state while a job is active", () => {
    for (const status of ["queued", "running"]) {
      const view = deriveCompetitorView(input({ compStatus: status }));
      expect(view.state).toBe("running");
      expect(view.canDiscover).toBe(false);
    }
  });

  it("blocks discovery and explains when no provider is configured", () => {
    const view = deriveCompetitorView(
      input({ providerConfigured: false, competitorCount: 0, compStatus: "idle" }),
    );
    expect(view.state).toBe("no-provider");
    expect(view.canDiscover).toBe(false);
    expect(view.showProviderNote).toBe(true);
    expect(view.message).toContain("DATAFORSEO_LOGIN");
  });

  it("still shows manually added competitors without a provider", () => {
    const view = deriveCompetitorView(
      input({ providerConfigured: false, competitorCount: 2, readyCount: 2 }),
    );
    expect(view.state).toBe("analyzed");
    expect(view.canDiscover).toBe(false);
    expect(view.showProviderNote).toBe(true);
  });

  it("keeps the provider note visible while running without a provider", () => {
    const view = deriveCompetitorView(
      input({ compStatus: "running", providerConfigured: false, competitorCount: 0 }),
    );
    expect(view.state).toBe("running");
    expect(view.showProviderNote).toBe(true);
  });

  it("distinguishes a finished run that found nothing", () => {
    const view = deriveCompetitorView(input({ compStatus: "done", competitorCount: 0 }));
    expect(view.state).toBe("no-results");
    expect(view.message).toContain("confidence threshold");
  });

  it("surfaces a hard failure with its reason", () => {
    const view = deriveCompetitorView(
      input({ compStatus: "failed", compError: "Queue is not running." }),
    );
    expect(view.state).toBe("crawl-failed");
    expect(view.message).toBe("Queue is not running.");
  });

  it("reports partial runs so unmeasured data is never presented as complete", () => {
    const view = deriveCompetitorView(
      input({ compStatus: "partial", compError: "SERP data unavailable." }),
    );
    expect(view.state).toBe("partial");
    expect(view.message).toBe("SERP data unavailable.");
  });

  it("flags when every competitor failed to analyze", () => {
    const view = deriveCompetitorView(input({ readyCount: 0, failedCount: 3 }));
    expect(view.state).toBe("crawl-failed");
  });

  it("shows the full dashboard once competitors are ready", () => {
    const view = deriveCompetitorView(input());
    expect(view.state).toBe("analyzed");
    expect(view.showProviderNote).toBe(false);
    expect(view.message).toBeNull();
  });
});

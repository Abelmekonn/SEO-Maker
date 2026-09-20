/**
 * One pure function decides what the Competitors page shows.
 *
 * Keeping this out of JSX means every state is reachable in a test instead of
 * hiding behind nested ternaries, and it guarantees the "no SERP provider" case
 * can never be papered over with fabricated numbers.
 */
export type CompetitorViewState =
  | "not-analyzed"
  | "running"
  | "no-provider"
  | "no-results"
  | "partial"
  | "crawl-failed"
  | "analyzed";

export const COMPETITOR_ACTIVE = new Set(["queued", "running"]);

export type CompetitorViewInput = {
  compStatus: string;
  compError: string | null;
  providerConfigured: boolean;
  competitorCount: number;
  readyCount: number;
  failedCount: number;
};

export type CompetitorView = {
  state: CompetitorViewState;
  canDiscover: boolean;
  showProviderNote: boolean;
  message: string | null;
};

const PROVIDER_NOTE =
  "Automatic competitor discovery needs a configured search provider. Set DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD to enable it. You can still add competitors manually.";

export function deriveCompetitorView(input: CompetitorViewInput): CompetitorView {
  const active = COMPETITOR_ACTIVE.has(input.compStatus);
  const showProviderNote = !input.providerConfigured;

  if (active) {
    return {
      state: "running",
      canDiscover: false,
      showProviderNote,
      message: null,
    };
  }

  if (input.compStatus === "failed") {
    return {
      state: "crawl-failed",
      canDiscover: input.providerConfigured,
      showProviderNote,
      message: input.compError ?? "Competitor discovery did not finish.",
    };
  }

  // A provider-less project can still be fully useful through manual adds, so
  // only show the bare provider state when there is nothing else to show.
  if (!input.providerConfigured && input.competitorCount === 0) {
    return {
      state: "no-provider",
      canDiscover: false,
      showProviderNote: true,
      message: PROVIDER_NOTE,
    };
  }

  if (input.competitorCount === 0) {
    return input.compStatus === "idle"
      ? { state: "not-analyzed", canDiscover: true, showProviderNote, message: null }
      : {
          state: "no-results",
          canDiscover: true,
          showProviderNote,
          message: "No domain met the confidence threshold in the searches we analyzed.",
        };
  }

  if (input.compStatus === "partial") {
    return {
      state: "partial",
      canDiscover: input.providerConfigured,
      showProviderNote,
      message:
        input.compError ?? "Some steps were skipped, so parts of this analysis are not measured.",
    };
  }

  if (input.readyCount === 0 && input.failedCount > 0) {
    return {
      state: "crawl-failed",
      canDiscover: input.providerConfigured,
      showProviderNote,
      message: "We could not analyze any of the competitors we found.",
    };
  }

  return {
    state: "analyzed",
    canDiscover: input.providerConfigured,
    showProviderNote,
    message: null,
  };
}

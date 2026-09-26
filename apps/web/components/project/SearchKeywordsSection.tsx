import { planAllowsAi } from "@seo-maker/core/plan";
import { CrawlRefresh } from "@/components/project/CrawlRefresh";
import { SearchKeywordsPanel } from "@/components/project/SearchKeywordsPanel";
import { aiConfigured } from "@/lib/ai-access";
import { readBusinessContext } from "@/lib/business-context";
import { getSearchKeywords } from "@/lib/competitors";
import type { PlanLimits } from "@/lib/plan";
import { getAiSiteJobs } from "@/lib/queue";

/** Loads the project's search keywords and renders the panel, polling while they generate. */
export async function SearchKeywordsSection({
  project,
  limits,
  compact = false,
}: {
  project: Parameters<typeof readBusinessContext>[0] & { id: string };
  limits: PlanLimits;
  compact?: boolean;
}) {
  const [state, jobs] = await Promise.all([getSearchKeywords(project.id), getAiSiteJobs(project.id).catch(() => [])]);
  const generating = jobs.some((job) => job.data.task === "search-queries");
  const disabledReason = !planAllowsAi(limits, "site")
    ? `${limits.label} does not include AI search keywords.`
    : !aiConfigured()
      ? "AI is not available right now. Try again later."
      : undefined;

  return (
    <>
      <CrawlRefresh status={generating ? "running" : "idle"} intervalMs={3000} />
      <SearchKeywordsPanel
        projectId={project.id}
        keywords={state.keywords}
        market={state.market}
        context={readBusinessContext(project)}
        missing={state.gaps}
        generating={generating}
        disabledReason={disabledReason}
        compact={compact}
      />
    </>
  );
}

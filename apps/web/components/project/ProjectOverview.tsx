import type { CrawlComparison } from "@seo-maker/core/crawl";
import type { Competitor, Crawl, Page, PerformanceAudit, Project } from "@seo-maker/db";
import { CrawlHealth } from "@/components/project/CrawlHealth";
import { SiteOverview } from "@/components/project/SiteOverview";
import type { PageAiResult } from "@/lib/ai-results";
import type { PlanId } from "@/lib/plan";

export function ProjectOverview({
  project,
  plan,
  planLabel,
  maxPages,
  mobile,
  desktop,
  crawl,
  comparison,
  history,
  competitors,
  homepageAi,
  analysedPages,
  aiEnabled,
}: {
  project: Project & { pages: Page[] };
  plan: PlanId;
  planLabel: string;
  maxPages: number;
  mobile: PerformanceAudit | null;
  desktop: PerformanceAudit | null;
  crawl: Crawl | null;
  comparison: CrawlComparison | null;
  history: Crawl[];
  competitors: Competitor[];
  homepageAi: PageAiResult | null;
  analysedPages: number;
  aiEnabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-6">
      <SiteOverview
        project={project}
        plan={plan}
        planLabel={planLabel}
        maxPages={maxPages}
        mobile={mobile}
        desktop={desktop}
        history={history}
        competitors={competitors}
        homepageAi={homepageAi}
        analysedPages={analysedPages}
        aiEnabled={aiEnabled}
      />
      {/* Site-wide crawl stats go past the homepage, so Free does not get them. */}
      {plan !== "free" ? <CrawlHealth crawl={crawl} comparison={comparison} /> : null}
    </div>
  );
}

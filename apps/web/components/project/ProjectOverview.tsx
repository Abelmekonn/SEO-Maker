import type { CrawlComparison } from "@seo-maker/core/crawl";
import type { Crawl, Page, PerformanceAudit, Project } from "@seo-maker/db";
import { CrawlHealth } from "@/components/project/CrawlHealth";
import { SiteOverview } from "@/components/project/SiteOverview";
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
}: {
  project: Project & { pages: Page[] };
  plan: PlanId;
  planLabel: string;
  maxPages: number;
  mobile: PerformanceAudit | null;
  desktop: PerformanceAudit | null;
  crawl: Crawl | null;
  comparison: CrawlComparison | null;
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
      />
      {/* Site-wide crawl stats go past the homepage, so Free does not get them. */}
      {plan !== "free" ? <CrawlHealth crawl={crawl} comparison={comparison} /> : null}
    </div>
  );
}

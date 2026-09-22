import type { CrawlComparison } from "@seo-maker/core/crawl";
import type { Crawl, Page, PerformanceAudit, Project } from "@seo-maker/db";
import { CrawlHealth } from "@/components/project/CrawlHealth";
import { SiteOverview } from "@/components/project/SiteOverview";
import type { PlanId } from "@/lib/plan";

export function ProjectOverview({
  project,
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
        planLabel={planLabel}
        maxPages={maxPages}
        mobile={mobile}
        desktop={desktop}
      />
      <CrawlHealth crawl={crawl} comparison={comparison} />
    </div>
  );
}

import type { Page, PerformanceAudit, Project } from "@seo-maker/db";
import { SiteOverview } from "@/components/project/SiteOverview";
import type { PlanId } from "@/lib/plan";

export function ProjectOverview({
  project,
  planLabel,
  maxPages,
  mobile,
  desktop,
}: {
  project: Project & { pages: Page[] };
  plan: PlanId;
  planLabel: string;
  maxPages: number;
  mobile: PerformanceAudit | null;
  desktop: PerformanceAudit | null;
}) {
  return (
    <SiteOverview
      project={project}
      planLabel={planLabel}
      maxPages={maxPages}
      mobile={mobile}
      desktop={desktop}
    />
  );
}

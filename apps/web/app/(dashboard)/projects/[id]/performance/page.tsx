import { prisma } from "@seo-maker/db";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/dashboard/shell";
import { CrawlRefresh } from "@/components/project/CrawlRefresh";
import {
  OpportunitiesCard,
  PerformanceStatus,
  StrategyReport,
} from "@/components/project/PerformanceReport";
import { RunPerformanceButton } from "@/components/project/RunPerformanceButton";
import { StatusBadge } from "@/components/project/StatusBadge";
import { PERF_ACTIVE } from "@/lib/performance";
import { getProjectForUser, requireUserId } from "@/lib/projects";
import { findHomepage } from "@/lib/site-url";

export default async function ProjectPerformancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const userId = await requireUserId();
  if (!userId) {
    redirect("/sign-in");
  }

  const { id } = await params;
  const project = await getProjectForUser(id, userId);
  if (!project) {
    notFound();
  }

  const homepage = findHomepage(project.pages, project.rootUrl);
  const audits = homepage
    ? await prisma.performanceAudit.findMany({
        where: { pageId: homepage.id },
        orderBy: { createdAt: "desc" },
      })
    : [];

  const mobile = audits.find((audit) => audit.strategy === "mobile") ?? null;
  const desktop = audits.find((audit) => audit.strategy === "desktop") ?? null;
  const active = PERF_ACTIVE.has(project.perfStatus);
  const hasResults = Boolean(mobile || desktop);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-8">
      <CrawlRefresh status={project.perfStatus} intervalMs={3000} />
      <PageHeader
        title="Performance"
        meta={
          <div className="flex flex-wrap items-center gap-3">
            <p className="font-mono text-sm text-body">{project.name}</p>
            <StatusBadge status={project.status} />
            {project.perfRunAt ? (
              <p className="font-mono text-[12px] text-muted-foreground">
                Last run {project.perfRunAt.toLocaleString()}
              </p>
            ) : null}
          </div>
        }
        description="Lighthouse scores and Core Web Vitals for the homepage, measured by Google PageSpeed Insights."
        actions={
          <RunPerformanceButton
            projectId={project.id}
            active={active}
            hasResults={hasResults}
          />
        }
      />

      <PerformanceStatus status={project.perfStatus} error={project.perfError} />

      <div className="grid gap-6 xl:grid-cols-2">
        <StrategyReport strategy="mobile" audit={mobile} active={active} />
        <StrategyReport strategy="desktop" audit={desktop} active={active} />
      </div>

      <OpportunitiesCard mobile={mobile} desktop={desktop} />
    </div>
  );
}

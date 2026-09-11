import { prisma, readPerfProgress } from "@seo-maker/db";
import { notFound, redirect } from "next/navigation";
import { Gauge } from "lucide-react";
import { CrawlRefresh } from "@/components/project/CrawlRefresh";
import { PerformanceBoard } from "@/components/project/PerformanceBoard";
import { PerformanceStatus } from "@/components/project/PerformanceReport";
import { StatusBadge } from "@/components/project/StatusBadge";
import { isCrawled } from "@/lib/page-audit";
import { defaultPerfPageIds, readPerfPageIds } from "@/lib/perf-scope";
import { getAccountForUser } from "@/lib/plan";
import { latestStrategy, PERF_ACTIVE } from "@/lib/performance";
import { getProjectForUser, requireUserId } from "@/lib/projects";
import { findHomepage, normalizeSiteUrl, pagePath } from "@/lib/site-url";

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

  const account = await getAccountForUser(userId);
  const maxPages = Math.max(project.maxPages, account.limits.maxPages);
  const homepage = findHomepage(project.pages, project.rootUrl);
  const parsed = normalizeSiteUrl(project.rootUrl);
  const hostname = "hostname" in parsed ? parsed.hostname : project.name;

  const [audits, progress] = await Promise.all([
    prisma.performanceAudit.findMany({
      where: { pageId: { in: project.pages.map((page) => page.id) } },
      orderBy: { createdAt: "desc" },
    }),
    readPerfProgress(prisma, project.id),
  ]);

  const suggestedIds = defaultPerfPageIds(project.pages, project.rootUrl, account.plan);
  const lastIds = readPerfPageIds(progress.perfPageIds).filter((pageId) =>
    project.pages.some((page) => page.id === pageId),
  );
  const initialSelected = lastIds.length > 0 ? lastIds : suggestedIds;
  const active = PERF_ACTIVE.has(project.perfStatus);
  const runningPageId =
    active && lastIds.length > 0
      ? (lastIds[Math.min(progress.perfDone, lastIds.length - 1)] ?? null)
      : null;
  const hasResults = audits.length > 0;
  const rows = [...project.pages]
    .sort((a, b) => {
      if (a.id === homepage?.id) return -1;
      if (b.id === homepage?.id) return 1;
      return 0;
    })
    .map((page) => {
    const mobile = latestStrategy(audits, page.id, "mobile");
    const desktop = latestStrategy(audits, page.id, "desktop");
    return {
      id: page.id,
      path: pagePath(page.finalUrl ?? page.url),
      title: page.title?.trim() ?? "",
      crawled: isCrawled(page),
      mobile: mobile?.performance ?? null,
      desktop: desktop?.performance ?? null,
      lcp: mobile?.lcp ?? desktop?.lcp ?? null,
    };
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <CrawlRefresh status={project.perfStatus} intervalMs={3000} />
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-soft text-body ring-1 ring-hairline">
            <Gauge className="size-4" aria-hidden />
          </span>
          <div className="flex min-w-0 flex-col gap-2">
            <h1 className="font-display text-[28px] leading-none tracking-[-0.5px] text-ink">
              Performance
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-mono text-sm text-body">{hostname}</p>
              <StatusBadge status={project.status} />
              <span className="inline-flex rounded-full bg-surface-card px-2.5 py-1 font-mono text-[12px] leading-4 text-ink">
                {account.limits.label}
              </span>
            </div>
            <p className="max-w-2xl text-sm leading-6 text-body">
              {account.plan === "free"
                ? "Lighthouse scores and Core Web Vitals for the homepage."
                : account.plan === "pro"
                  ? `Pick up to ${maxPages} pages. Each URL runs mobile, then desktop.`
                  : `Batch PageSpeed on up to ${maxPages} crawled pages. Suggested starts with the homepage and shallow URLs.`}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-0.5 text-right">
          <p className="font-mono text-[12px] text-muted-foreground">Last run</p>
          <p className="font-mono text-[12px] tabular-nums text-ink">
            {project.perfRunAt ? formatLastRun(project.perfRunAt) : "No run yet"}
          </p>
        </div>
      </header>

      <PerformanceStatus
        status={project.perfStatus}
        error={project.perfError}
        done={progress.perfDone}
        total={progress.perfTotal}
      />

      <PerformanceBoard
        projectId={project.id}
        plan={account.plan}
        maxPages={maxPages}
        homepageId={homepage?.id ?? null}
        rows={rows}
        initialSelected={initialSelected}
        suggestedIds={suggestedIds}
        active={active}
        runningPageId={runningPageId}
        hasResults={hasResults}
      />
    </div>
  );
}

function formatLastRun(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

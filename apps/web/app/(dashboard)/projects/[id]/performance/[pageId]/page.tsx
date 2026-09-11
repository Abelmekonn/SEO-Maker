import { prisma, readPerfProgress } from "@seo-maker/db";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/shell";
import { CrawlRefresh } from "@/components/project/CrawlRefresh";
import {
  OpportunitiesCard,
  PerformanceStatus,
  StrategyReport,
} from "@/components/project/PerformanceReport";
import { StatusBadge } from "@/components/project/StatusBadge";
import { PERF_ACTIVE } from "@/lib/performance";
import { getPageForUser, requireUserId } from "@/lib/projects";
import { pagePath } from "@/lib/site-url";

export default async function ProjectPerformancePageDetail({
  params,
}: {
  params: Promise<{ id: string; pageId: string }>;
}) {
  const userId = await requireUserId();
  if (!userId) {
    redirect("/sign-in");
  }

  const { id, pageId } = await params;
  const page = await getPageForUser(id, pageId, userId);
  if (!page) {
    notFound();
  }

  const [audits, progress] = await Promise.all([
    prisma.performanceAudit.findMany({
      where: { pageId },
      orderBy: { createdAt: "desc" },
    }),
    readPerfProgress(prisma, page.project.id),
  ]);
  const mobile = audits.find((audit) => audit.strategy === "mobile") ?? null;
  const desktop = audits.find((audit) => audit.strategy === "desktop") ?? null;
  const active = PERF_ACTIVE.has(page.project.perfStatus);
  const liveUrl = page.finalUrl ?? page.url;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-8">
      <CrawlRefresh status={page.project.perfStatus} intervalMs={3000} />
      <Link
        href={`/projects/${id}/performance`}
        className="inline-flex min-h-10 w-fit items-center gap-1.5 rounded-md font-mono text-sm text-body hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All performance
      </Link>
      <PageHeader
        title={pagePath(liveUrl)}
        meta={
          <div className="flex flex-wrap items-center gap-3">
            <p className="break-all font-mono text-sm text-body">{liveUrl}</p>
            <StatusBadge status={page.status} />
          </div>
        }
        description={`${page.project.name}. Lighthouse scores and Core Web Vitals for this URL.`}
        actions={
          <Button asChild variant="outline" className="h-11 w-fit">
            <a href={liveUrl} target="_blank" rel="noopener noreferrer">
              Open live page
              <ArrowUpRight aria-hidden />
            </a>
          </Button>
        }
      />
      <PerformanceStatus
        status={page.project.perfStatus}
        error={page.project.perfError}
        done={progress.perfDone}
        total={progress.perfTotal}
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <StrategyReport strategy="mobile" audit={mobile} active={active && !mobile} />
        <StrategyReport strategy="desktop" audit={desktop} active={active && !desktop} />
      </div>
      <OpportunitiesCard mobile={mobile} desktop={desktop} />
    </div>
  );
}

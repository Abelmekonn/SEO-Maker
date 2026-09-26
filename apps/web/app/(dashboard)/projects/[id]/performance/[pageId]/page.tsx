import { prisma, readPerfProgress } from "@seo-maker/db";
import { notFound, redirect } from "next/navigation";
import { CrawlRefresh } from "@/components/project/CrawlRefresh";
import { PerformancePageDetail } from "@/components/project/PerformancePageDetail";
import { premiumGate } from "@/components/project/PremiumRoute";
import { keyOfPage, latestAudits } from "@/lib/page-results";
import { toAuditView } from "@/lib/perf-view";
import { getPageForUser, requireUserId } from "@/lib/projects";
import { pagePath } from "@/lib/site-url";

export default async function ProjectPerformancePageDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; pageId: string }>;
  searchParams: Promise<{ device?: string }>;
}) {
  const userId = await requireUserId();
  if (!userId) {
    redirect("/sign-in");
  }

  const { id, pageId } = await params;
  const query = await searchParams;
  const page = await getPageForUser(id, pageId, userId);
  if (!page) {
    notFound();
  }
  const gate = await premiumGate(page.project.id, "performance");
  if (gate) {
    return gate;
  }

  // By URL, so a run from before the last crawl still shows here.
  const [audits, progress] = await Promise.all([
    latestAudits(page.project.id, [keyOfPage(page)]),
    readPerfProgress(prisma, page.project.id),
  ]);

  const path = pagePath(page.finalUrl ?? page.url);
  const mobile = audits.find((audit) => audit.strategy === "mobile");
  const desktop = audits.find((audit) => audit.strategy === "desktop");

  return (
    <>
      <CrawlRefresh status={page.project.perfStatus} intervalMs={3000} />
      <PerformancePageDetail
        projectId={id}
        pageId={pageId}
        path={path}
        liveUrl={page.finalUrl ?? page.url}
        pageStatus={page.status}
        projectName={page.project.name}
        initialStrategy={query.device === "desktop" ? "desktop" : "mobile"}
        mobile={mobile ? toAuditView(mobile, path, pageId) : null}
        desktop={desktop ? toAuditView(desktop, path, pageId) : null}
        perfStatus={page.project.perfStatus}
        perfError={page.project.perfError}
        perfDone={progress.perfDone}
        perfTotal={progress.perfTotal}
      />
    </>
  );
}

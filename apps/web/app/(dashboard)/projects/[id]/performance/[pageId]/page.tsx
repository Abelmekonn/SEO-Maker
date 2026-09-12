import { prisma, readPerfProgress } from "@seo-maker/db";
import { notFound, redirect } from "next/navigation";
import { CrawlRefresh } from "@/components/project/CrawlRefresh";
import { PerformancePageDetail } from "@/components/project/PerformancePageDetail";
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

  const [audits, progress] = await Promise.all([
    prisma.performanceAudit.findMany({
      where: { pageId },
      orderBy: { createdAt: "desc" },
    }),
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
        mobile={mobile ? toAuditView(mobile, path) : null}
        desktop={desktop ? toAuditView(desktop, path) : null}
        perfStatus={page.project.perfStatus}
        perfError={page.project.perfError}
        perfDone={progress.perfDone}
        perfTotal={progress.perfTotal}
      />
    </>
  );
}

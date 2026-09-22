import { compareCrawls } from "@seo-maker/core/crawl";
import { prisma } from "@seo-maker/db";
import { notFound, redirect } from "next/navigation";
import { ProjectOverview } from "@/components/project/ProjectOverview";
import { getAccountForUser } from "@/lib/plan";
import { getCrawlHistory, getProjectForUser, requireUserId } from "@/lib/projects";
import { findHomepage } from "@/lib/site-url";

export default async function ProjectOverviewPage({
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
  const audits = homepage
    ? await prisma.performanceAudit.findMany({
        where: { pageId: homepage.id },
        orderBy: { createdAt: "desc" },
      })
    : [];

  const history = await getCrawlHistory(project.id);
  const crawl = history.find((entry) => entry.id === project.latestCrawlId) ?? history[0] ?? null;
  const comparison = compareCrawls(history);

  const mobile = audits.find((audit) => audit.strategy === "mobile") ?? null;
  const desktop = audits.find((audit) => audit.strategy === "desktop") ?? null;

  return (
    <ProjectOverview
      project={project}
      plan={account.plan}
      planLabel={account.limits.label}
      maxPages={maxPages}
      mobile={mobile}
      desktop={desktop}
      crawl={crawl}
      comparison={comparison}
    />
  );
}

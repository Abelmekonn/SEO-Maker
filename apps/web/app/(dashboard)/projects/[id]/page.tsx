import { compareCrawls } from "@seo-maker/core/crawl";
import { prisma } from "@seo-maker/db";
import { notFound, redirect } from "next/navigation";
import { ProjectOverview } from "@/components/project/ProjectOverview";
import { aiConfigured, getPageRecommendation } from "@/lib/ai-results";
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
  const premium = account.plan !== "free";
  const maxPages = Math.max(project.maxPages, account.limits.maxPages);
  const homepage = findHomepage(project.pages, project.rootUrl);
  const pageIds = project.pages.map((page) => page.id);

  const [audits, history, competitors, homepageAi, analysed] = await Promise.all([
    homepage
      ? prisma.performanceAudit.findMany({
          where: { pageId: homepage.id },
          orderBy: { createdAt: "desc" },
        })
      : [],
    getCrawlHistory(project.id),
    // AI and competitor panels are premium; Free renders them locked, so there
    // is nothing to load for it.
    premium
      ? prisma.competitor.findMany({
          where: { projectId: project.id, excluded: false },
          orderBy: [{ pinned: "desc" }, { confidence: "desc" }, { createdAt: "desc" }],
          take: 4,
        })
      : [],
    premium && homepage ? getPageRecommendation(homepage.id) : null,
    premium
      ? prisma.aiResult.findMany({
          where: {
            projectId: project.id,
            feature: "page-recommendation",
            status: "ok",
            pageId: { in: pageIds },
          },
          distinct: ["pageId"],
          select: { pageId: true },
        })
      : [],
  ]);

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
      history={history}
      competitors={competitors}
      homepageAi={homepageAi}
      analysedPages={analysed.length}
      aiEnabled={aiConfigured()}
    />
  );
}

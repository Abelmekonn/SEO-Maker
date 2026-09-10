import { prisma } from "@seo-maker/db";
import { notFound, redirect } from "next/navigation";
import { ProjectOverview } from "@/components/project/ProjectOverview";
import { getProjectForUser, requireUserId } from "@/lib/projects";

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

  const homepage = project.pages[0];
  const audits = homepage
    ? await prisma.performanceAudit.findMany({
        where: { pageId: homepage.id },
        orderBy: { createdAt: "desc" },
      })
    : [];

  const mobile = audits.find((audit) => audit.strategy === "mobile") ?? null;
  const desktop = audits.find((audit) => audit.strategy === "desktop") ?? null;

  return <ProjectOverview project={project} mobile={mobile} desktop={desktop} />;
}

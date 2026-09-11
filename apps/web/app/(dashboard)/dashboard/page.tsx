import { currentUser } from "@clerk/nextjs/server";
import { prisma } from "@seo-maker/db";
import { redirect } from "next/navigation";
import { ProjectsHome } from "@/components/dashboard/ProjectsHome";
import { getAccountForUser } from "@/lib/plan";
import { requireUserId } from "@/lib/projects";

export default async function DashboardPage() {
  const userId = await requireUserId();
  if (!userId) {
    redirect("/sign-in");
  }

  const [user, projects, account] = await Promise.all([
    currentUser(),
    prisma.project.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: {
        pages: {
          orderBy: { createdAt: "asc" },
          include: {
            performance: {
              orderBy: { createdAt: "desc" },
            },
          },
        },
      },
    }),
    getAccountForUser(userId),
  ]);

  return (
    <ProjectsHome
      firstName={user?.firstName?.trim() || null}
      planLabel={account.limits.label}
      maxProjects={account.limits.maxProjects}
      maxPages={account.limits.maxPages}
      projects={projects}
    />
  );
}

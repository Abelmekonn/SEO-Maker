import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ProjectsHome } from "@/components/dashboard/ProjectsHome";
import { getAccountForUser } from "@/lib/plan";
import { getRecentCrawlsForUser, listProjectsForUser, requireUserId } from "@/lib/projects";

export default async function DashboardPage() {
  const userId = await requireUserId();
  if (!userId) {
    redirect("/sign-in");
  }

  const [user, projects, crawls, account] = await Promise.all([
    currentUser(),
    listProjectsForUser(userId),
    getRecentCrawlsForUser(userId),
    getAccountForUser(userId),
  ]);

  return (
    <ProjectsHome
      firstName={user?.firstName?.trim() || null}
      plan={account.plan}
      planLabel={account.limits.label}
      maxProjects={account.limits.maxProjects}
      maxPages={account.limits.maxPages}
      canUseDeep={account.limits.deepMode}
      projects={projects}
      crawls={crawls}
    />
  );
}

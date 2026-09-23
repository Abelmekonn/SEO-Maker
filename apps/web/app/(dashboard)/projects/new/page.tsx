import { redirect } from "next/navigation";
import { NewProjectView } from "@/components/dashboard/NewProjectView";
import { getAccountForUser } from "@/lib/plan";
import { listProjectsForUser, requireUserId } from "@/lib/projects";

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string }>;
}) {
  const userId = await requireUserId();
  if (!userId) {
    redirect("/sign-in");
  }

  const { url } = await searchParams;
  const [account, projects] = await Promise.all([
    getAccountForUser(userId),
    listProjectsForUser(userId),
  ]);

  return (
    <NewProjectView
      plan={account.plan}
      limits={account.limits}
      projects={projects.map((project) => ({ id: project.id, name: project.name }))}
      url={url}
    />
  );
}

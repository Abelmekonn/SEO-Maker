import { notFound, redirect } from "next/navigation";
import { CrawlRefresh } from "@/components/project/CrawlRefresh";
import { PagesBoard } from "@/components/project/PagesBoard";
import { RecrawlButton } from "@/components/project/RecrawlButton";
import { StatusBadge } from "@/components/project/StatusBadge";
import { PageHeader } from "@/components/dashboard/shell";
import { getProjectForUser, requireUserId } from "@/lib/projects";

export default async function ProjectPagesPage({
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

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-8">
      <CrawlRefresh status={project.status} />
      <PageHeader
        title="Pages"
        meta={
          <div className="flex flex-wrap items-center gap-3">
            <p className="font-mono text-sm text-body">{project.name}</p>
            <StatusBadge status={project.status} />
          </div>
        }
        description="Thirteen checks on every crawled page, from status code to sitemap."
        actions={<RecrawlButton projectId={project.id} />}
      />
      <PagesBoard pages={project.pages} projectId={project.id} />
    </div>
  );
}

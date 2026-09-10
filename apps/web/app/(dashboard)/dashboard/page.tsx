import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@seo-maker/db";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/project/StatusBadge";
import { UrlIntakeForm } from "@/components/project/UrlIntakeForm";
import { PageHeader, Panel, StatTile } from "@/components/dashboard/shell";
import { requireUserId } from "@/lib/projects";

function formatAddedOn(date: Date) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export default async function DashboardPage() {
  const userId = await requireUserId();
  if (!userId) {
    redirect("/sign-in");
  }

  const projects = await prisma.project.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      pages: {
        select: { id: true, status: true, wordCount: true },
      },
    },
  });

  const analyzed = projects.filter((project) => project.status === "analyzed").length;
  const pages = projects.reduce((count, project) => count + project.pages.length, 0);

  return (
    <Panel>
      {projects.length === 0 ? (
        <>
          <PageHeader
            title="Start with a URL"
            description="The first pass is the homepage. Title, meta, H1, and word count land on the page row."
          />
          <UrlIntakeForm />
        </>
      ) : (
        <>
          <PageHeader
            title="Projects"
            description="Free includes one homepage crawl per project."
            actions={
              <Button asChild className="h-11">
                <Link href="/projects/new">New project</Link>
              </Button>
            }
          />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <StatTile label="Projects" value={projects.length} hint="Free includes one site" />
            <StatTile label="Analyzed" value={analyzed} hint="Homepage crawl finished" />
            <StatTile
              label="Pages"
              value={pages}
              hint="Homepage only on Free"
              className="col-span-2 md:col-span-1"
            />
          </div>
          <ul className="flex flex-col gap-3">
            {projects.map((project) => {
              const homepage = project.pages[0];
              return (
                <li key={project.id}>
                  <Link
                    href={`/projects/${project.id}`}
                      className="flex min-h-11 flex-col gap-3 rounded-lg bg-surface-card px-4 py-4 hover:bg-surface-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="min-w-0">
                      <span className="block font-medium text-ink">{project.name}</span>
                      <span className="block truncate text-sm text-body">
                        {project.rootUrl}
                      </span>
                      <span className="mt-1 block font-mono text-[11px] text-muted-foreground">
                        Added {formatAddedOn(project.createdAt)}
                        {homepage?.wordCount != null
                          ? ` · ${homepage.wordCount} words`
                          : ""}
                      </span>
                    </span>
                    <StatusBadge status={project.status} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Panel>
  );
}

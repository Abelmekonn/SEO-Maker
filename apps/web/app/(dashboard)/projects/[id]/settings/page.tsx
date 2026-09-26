import { notFound, redirect } from "next/navigation";
import { prisma } from "@seo-maker/db";
import { Globe, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/dashboard/shell";
import { BusinessContextForm } from "@/components/project/BusinessContextForm";
import { DeleteProjectButton } from "@/components/project/DeleteProjectButton";
import { contextCompleteness, readBusinessContext } from "@/lib/business-context";
import { getProjectForUser, requireUserId } from "@/lib/projects";
import { normalizeSiteUrl } from "@/lib/site-url";

const dateFmt = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" });

export default async function ProjectSettingsPage({
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

  const context = readBusinessContext(project);
  const completeness = Math.round(contextCompleteness(context) * 100);
  const parsed = normalizeSiteUrl(project.rootUrl);
  const hostname = "hostname" in parsed ? parsed.hostname : project.name;
  const [crawls, aiResults] = await Promise.all([
    prisma.crawl.count({ where: { projectId: project.id } }),
    prisma.aiResult.count({ where: { projectId: project.id, status: "ok" } }),
  ]);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(300px,340px)]">
      <section className="flex flex-col gap-6 rounded-xl bg-surface-soft p-5 ring-1 ring-hairline sm:p-8">
        <PageHeader
          title="Business context"
          description={
            project.analysisMode === "deep"
              ? `AI uses your business context. It is ${completeness}% complete: the more you fill in, the more specific the recommendations can be.`
              : "AI works from the crawl alone for this site. Add context here to make its recommendations specific to your business."
          }
        />
        <BusinessContextForm projectId={project.id} initial={context} />
      </section>

      <aside className="flex flex-col gap-4">
        <section className="flex flex-col gap-4 rounded-xl bg-surface-soft p-5 ring-1 ring-hairline">
          <h2 className="flex items-center gap-2 font-display text-[16px] text-ink">
            <span className="flex size-6 items-center justify-center rounded-full bg-surface-card text-body">
              <Globe className="size-3.5" aria-hidden />
            </span>
            Site
          </h2>
          <dl className="flex flex-col">
            <Fact label="Address" value={project.rootUrl} mono />
            <Fact label="Mode" value={project.analysisMode === "deep" ? "Deep analysis" : "Quick check"} />
            <Fact label="Pages per crawl" value={`${project.maxPages}`} />
            <Fact label="Crawls kept" value={`${crawls}`} />
            <Fact label="AI results" value={`${aiResults}`} />
            <Fact label="Added" value={dateFmt.format(project.createdAt)} />
          </dl>
        </section>

        <section aria-labelledby="danger-title" className="flex flex-col gap-3 rounded-xl bg-surface-soft p-5 ring-1 ring-bad/30">
          <h2 id="danger-title" className="flex items-center gap-2 font-display text-[16px] text-ink">
            <span className="flex size-6 items-center justify-center rounded-full bg-bad/15 text-bad">
              <ShieldAlert className="size-3.5" aria-hidden />
            </span>
            Danger zone
          </h2>
          <p className="text-sm leading-6 text-body">
            Delete {hostname} and everything found for it: crawls, pages, problems, PageSpeed results, AI
            fixes and competitors. This cannot be undone.
          </p>
          <DeleteProjectButton projectId={project.id} siteName={hostname} variant="full" />
        </section>
      </aside>
    </div>
  );
}

function Fact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-hairline py-2.5 first:border-t-0 first:pt-0">
      <dt className="shrink-0 text-sm text-body">{label}</dt>
      <dd className={mono ? "truncate font-mono text-[12px] text-ink" : "text-sm text-ink"} title={value}>
        {value}
      </dd>
    </div>
  );
}

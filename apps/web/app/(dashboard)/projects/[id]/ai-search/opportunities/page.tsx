import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Target } from "lucide-react";
import { CrawlRefresh } from "@/components/project/CrawlRefresh";
import { GeoOpportunitiesBoard } from "@/components/project/geo/GeoOpportunitiesBoard";
import { GeoRunButton } from "@/components/project/geo/GeoRunButton";
import { StatusBadge } from "@/components/project/StatusBadge";
import {
  GEO_ACTIVE,
  getGeoOpportunities,
  getLatestGeoAudit,
  relativeTime,
} from "@/lib/geo";
import { getProjectForUser, requireUserId } from "@/lib/projects";
import { normalizeSiteUrl } from "@/lib/site-url";

export default async function GeoOpportunitiesPage({
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

  const audit = await getLatestGeoAudit(project.id);
  const opportunities = audit ? await getGeoOpportunities(project.id, audit.id) : [];

  const parsed = normalizeSiteUrl(project.rootUrl);
  const hostname = "hostname" in parsed ? parsed.hostname : project.name;
  const analyzedAt = audit?.finishedAt ?? audit?.startedAt ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <CrawlRefresh status={project.geoStatus} intervalMs={3000} />

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-[12px] text-muted-foreground">
            <Link
              href={`/projects/${project.id}`}
              className="rounded-md hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {hostname}
            </Link>
            {" / "}
            <Link
              href={`/projects/${project.id}/ai-search`}
              className="rounded-md hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              AI Search
            </Link>
          </p>

          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Target className="size-5 shrink-0 text-primary" aria-hidden />
            <h1 className="font-display text-[28px] leading-none tracking-[-0.5px] text-ink">
              GEO Opportunities
            </h1>
            {audit ? <StatusBadge status={project.geoStatus} /> : null}
            {analyzedAt ? (
              <span className="text-[12px] text-muted-soft">
                Last analyzed {relativeTime(analyzedAt)}
              </span>
            ) : null}
          </div>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-body">
            What to change, ranked by how much it would move the readiness score against how much
            work it is. Every ranking is arithmetic you can check.
          </p>
        </div>

        <GeoRunButton
          projectId={project.id}
          active={GEO_ACTIVE.has(project.geoStatus)}
          hasResults={audit != null}
          disabled={!project.latestCrawlId}
        />
      </header>

      {!project.latestCrawlId ? (
        <EmptyPanel
          title="Crawl the site first"
          body="Findings come from the pages the crawler captured. Run a crawl from the project overview, then run the analysis."
        />
      ) : !audit ? (
        <EmptyPanel
          title="Not analyzed yet"
          body="Run the AI Search analysis to see what to change. The accessibility findings need no API key."
        />
      ) : (
        <GeoOpportunitiesBoard projectId={project.id} opportunities={opportunities} />
      )}
    </div>
  );
}

function EmptyPanel({ title, body }: { title: string; body: string }) {
  return (
    <section className="rounded-xl bg-surface-soft px-5 py-6 ring-1 ring-hairline">
      <p className="text-[13px] font-medium text-ink">{title}</p>
      <p className="mt-1 max-w-xl text-[12px] leading-5 text-muted-soft">{body}</p>
    </section>
  );
}

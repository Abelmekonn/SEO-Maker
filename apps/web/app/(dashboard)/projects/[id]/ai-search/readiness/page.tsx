import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Gauge } from "lucide-react";
import { CrawlRefresh } from "@/components/project/CrawlRefresh";
import { GeoReadinessBoard } from "@/components/project/geo/GeoReadinessBoard";
import { GeoRunButton } from "@/components/project/geo/GeoRunButton";
import { StatusBadge } from "@/components/project/StatusBadge";
import {
  GEO_ACTIVE,
  dimensionRows,
  getLatestGeoAudit,
  measuredCoverage,
  relativeTime,
} from "@/lib/geo";
import { getProjectForUser, requireUserId } from "@/lib/projects";
import { normalizeSiteUrl } from "@/lib/site-url";

export default async function AiReadinessPage({ params }: { params: Promise<{ id: string }> }) {
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
  const rows = dimensionRows(audit as Record<string, unknown> | null);
  const coverage = measuredCoverage(rows);

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
            <Gauge className="size-5 shrink-0 text-primary" aria-hidden />
            <h1 className="font-display text-[28px] leading-none tracking-[-0.5px] text-ink">
              AI Readiness
            </h1>
            {audit ? <StatusBadge status={project.geoStatus} /> : null}
            {analyzedAt ? (
              <span className="text-[12px] text-muted-soft">
                Last analyzed {relativeTime(analyzedAt)}
              </span>
            ) : null}
          </div>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-body">
            Seven weighted signals measured from this site. A signal that could not be measured is
            dropped and its weight spread across the rest, so it is never counted as a zero.
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
          body="The analysis reads the pages the crawler captured. Run a crawl from the project overview, then come back."
        />
      ) : !audit ? (
        <EmptyPanel
          title="Not analyzed yet"
          body="Run the analysis to score this site across seven signals. The accessibility signal needs no API key."
        />
      ) : (
        <GeoReadinessBoard audit={audit} rows={rows} coverage={coverage} />
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

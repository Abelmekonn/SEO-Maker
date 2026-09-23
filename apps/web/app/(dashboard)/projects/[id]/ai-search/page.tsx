import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { CrawlRefresh } from "@/components/project/CrawlRefresh";
import { GeoCrawlerAccess, type CrawlerMatrix } from "@/components/project/geo/GeoCrawlerAccess";
import { GeoDimensionList, GeoReadinessCard } from "@/components/project/geo/GeoReadiness";
import { GeoRunButton } from "@/components/project/geo/GeoRunButton";
import { GEO_ACTIVE, dimensionRows, getLatestGeoAudit, measuredCoverage } from "@/lib/geo";
import { getProjectForUser, requireUserId } from "@/lib/projects";

export default async function AiSearchOverviewPage({
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
  const rows = dimensionRows(audit as Record<string, unknown> | null);
  const coverage = measuredCoverage(rows);
  const measuredCount = rows.filter((row) => row.value != null).length;
  const active = GEO_ACTIVE.has(project.geoStatus);
  const matrix = (audit?.crawlerMatrix ?? null) as CrawlerMatrix | null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <CrawlRefresh status={project.geoStatus} intervalMs={3000} />

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-[12px] text-muted-foreground">AI Search</p>
          <h1 className="mt-1 font-display text-[28px] leading-none tracking-[-0.5px] text-ink">
            Overview
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-body">
            How clearly this site presents itself to AI-driven search, measured from the pages the
            last crawl captured.
          </p>
        </div>
        <GeoRunButton
          projectId={project.id}
          active={active}
          hasResults={audit != null}
          disabled={!project.latestCrawlId}
        />
      </header>

      {project.geoStatus === "failed" && project.geoError ? (
        <p
          role="alert"
          className="rounded-xl bg-surface-soft px-5 py-4 text-sm leading-6 text-ink ring-1 ring-bad/40"
        >
          {project.geoError}
        </p>
      ) : null}

      {!project.latestCrawlId ? (
        <EmptyState
          title="Crawl the site first"
          body="The analysis reads the pages the crawler captured. Run a crawl from the project overview, then come back."
        />
      ) : active ? (
        <EmptyState
          title="Analysis running"
          body={`Currently ${project.geoPhase ?? "starting"}. This page refreshes on its own.`}
        />
      ) : !audit ? (
        <EmptyState
          title="Not analyzed yet"
          body="Run the analysis to score this site across seven signals. The accessibility checks need no API key."
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
          <div className="flex min-w-0 flex-col gap-4">
            {matrix ? (
              <GeoCrawlerAccess matrix={matrix} />
            ) : (
              <EmptyState
                title="No accessibility result"
                body="The crawler accessibility check did not produce a result for this run."
              />
            )}
          </div>

          <aside className="flex min-w-0 flex-col gap-4">
            <GeoReadinessCard
              score={audit.readinessScore}
              band={audit.readinessBand}
              coverage={coverage}
              measuredCount={measuredCount}
            />

            <section className="flex flex-col gap-4 rounded-xl bg-surface-soft p-5 ring-1 ring-hairline">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[13px] font-semibold text-ink">Signals</h2>
                <Link
                  href={`/projects/${project.id}/ai-search/readiness`}
                  className="shrink-0 rounded-md text-[12px] font-medium text-muted-foreground hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Details
                  <ChevronRight className="ml-0.5 inline size-3" aria-hidden />
                </Link>
              </div>
              <GeoDimensionList rows={rows} />
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl bg-surface-soft px-5 py-6 ring-1 ring-hairline">
      <p className="text-[13px] font-medium text-ink">{title}</p>
      <p className="mt-1 max-w-xl text-[12px] leading-5 text-muted-soft">{body}</p>
    </div>
  );
}

import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { CrawlRefresh } from "@/components/project/CrawlRefresh";
import { GeoDimensionList, GeoReadinessCard } from "@/components/project/geo/GeoReadiness";
import { GeoRunButton } from "@/components/project/geo/GeoRunButton";
import { GEO_ACTIVE, dimensionRows, getLatestGeoAudit, measuredCoverage } from "@/lib/geo";
import { getProjectForUser, requireUserId } from "@/lib/projects";

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
  const measured = rows.filter((row) => row.value != null);
  const unmeasured = rows.filter((row) => row.value == null);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <CrawlRefresh status={project.geoStatus} intervalMs={3000} />

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            href={`/projects/${project.id}/ai-search`}
            className="inline-flex items-center gap-1 rounded-md font-mono text-[12px] text-muted-foreground hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronLeft className="size-3" aria-hidden />
            AI Search
          </Link>
          <h1 className="mt-1 font-display text-[28px] leading-none tracking-[-0.5px] text-ink">
            AI Readiness
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-body">
            Seven signals, weighted. A signal that could not be measured is dropped and its weight
            spread across the rest, so it is never counted as a zero.
          </p>
        </div>
        <GeoRunButton
          projectId={project.id}
          active={GEO_ACTIVE.has(project.geoStatus)}
          hasResults={audit != null}
          disabled={!project.latestCrawlId}
        />
      </header>

      {!audit ? (
        <div className="rounded-xl bg-surface-soft px-5 py-6 ring-1 ring-hairline">
          <p className="text-[13px] font-medium text-ink">Not analyzed yet</p>
          <p className="mt-1 max-w-xl text-[12px] leading-5 text-muted-soft">
            Run the analysis from here or the overview. The accessibility signal needs no API key.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(320px,380px)_minmax(0,1fr)]">
          <GeoReadinessCard
            score={audit.readinessScore}
            band={audit.readinessBand}
            coverage={coverage}
            measuredCount={measured.length}
          />

          <div className="flex min-w-0 flex-col gap-4">
            <section className="flex flex-col gap-4 rounded-xl bg-surface-soft p-5 ring-1 ring-hairline">
              <h2 className="text-[13px] font-semibold text-ink">
                Measured ({measured.length} of {rows.length})
              </h2>
              {measured.length > 0 ? (
                <GeoDimensionList rows={measured} />
              ) : (
                <p className="text-[12px] leading-5 text-muted-soft">
                  Nothing could be measured in this run.
                </p>
              )}
            </section>

            {unmeasured.length > 0 ? (
              <section className="flex flex-col gap-4 rounded-xl bg-surface-soft p-5 ring-1 ring-hairline">
                <h2 className="text-[13px] font-semibold text-ink">Not measured</h2>
                <ul className="flex flex-col gap-2">
                  {unmeasured.map((row) => (
                    <li
                      key={row.id}
                      className="rounded-lg bg-canvas px-3 py-2.5 ring-1 ring-hairline"
                    >
                      <p className="text-[12px] font-medium text-ink">{row.label}</p>
                      <p className="mt-0.5 text-[11px] leading-4 text-muted-soft">
                        {row.reason ?? "No reason was recorded."}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

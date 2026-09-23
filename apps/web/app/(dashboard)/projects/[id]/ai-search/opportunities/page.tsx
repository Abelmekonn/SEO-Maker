import { notFound, redirect } from "next/navigation";
import { GEO_OPPORTUNITY_TYPE_LABELS, type GeoOpportunityType } from "@seo-maker/core/geo";
import { CrawlRefresh } from "@/components/project/CrawlRefresh";
import { AiSearchHeader, NotAvailable } from "@/components/project/geo/AiSearchShell";
import { GeoRunButton } from "@/components/project/geo/GeoRunButton";
import { GEO_ACTIVE, getGeoOpportunities, getLatestGeoAudit } from "@/lib/geo";
import { getProjectForUser, requireUserId } from "@/lib/projects";
import { cn } from "@/lib/utils";

const severityTone: Record<string, string> = {
  critical: "bg-bad/15 text-bad",
  high: "bg-warn/15 text-warn",
  medium: "bg-warn/15 text-warn",
  low: "bg-surface-card text-muted-foreground",
};

const effortLabel: Record<string, string> = {
  low: "Quick fix",
  medium: "Some work",
  high: "Significant work",
};

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

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <CrawlRefresh status={project.geoStatus} intervalMs={3000} />

      <AiSearchHeader
        projectId={project.id}
        title="GEO Opportunities"
        description="Findings from the AI Search analysis, ordered by how much they would move the readiness score against how much work they are."
        action={
          <GeoRunButton
            projectId={project.id}
            active={GEO_ACTIVE.has(project.geoStatus)}
            hasResults={audit != null}
            disabled={!project.latestCrawlId}
          />
        }
      />

      {!audit ? (
        <NotAvailable
          title="Not analyzed yet"
          body="Run the AI Search analysis to see what to change. Accessibility findings need no API key."
        />
      ) : opportunities.length === 0 ? (
        <NotAvailable
          title="No findings"
          body="The analysis found nothing to fix in the signals it could measure. More findings appear as the remaining signals are implemented."
          detail={[
            "Only failures become findings. A check we could not read is a gap in our evidence, not a problem with your site.",
          ]}
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {opportunities.map((row) => {
            const evidence = (row.evidence ?? []) as Array<{
              label: string;
              value: string;
              source: string;
            }>;
            const urls = (row.affectedUrls ?? []) as string[];

            return (
              <li
                key={row.id}
                className="flex flex-col gap-3 rounded-xl bg-surface-soft p-5 ring-1 ring-hairline"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px] font-medium capitalize leading-4",
                          severityTone[row.severity] ?? severityTone.low,
                        )}
                      >
                        {row.severity}
                      </span>
                      <span className="rounded-full bg-surface-card px-2 py-0.5 text-[11px] font-medium leading-4 text-muted-foreground">
                        {GEO_OPPORTUNITY_TYPE_LABELS[row.type as GeoOpportunityType] ?? row.type}
                      </span>
                      <span className="text-[11px] text-muted-soft">
                        {effortLabel[row.estimatedEffort] ?? row.estimatedEffort}
                      </span>
                      {!row.aiUsed ? (
                        <span className="rounded-full bg-surface-card px-2 py-0.5 text-[11px] font-medium leading-4 text-muted-soft">
                          Rule-based
                        </span>
                      ) : null}
                    </div>
                    <h2 className="text-[14px] font-semibold leading-6 text-ink">{row.title}</h2>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="font-mono text-[18px] leading-none tabular-nums text-ink">
                      {Math.round(row.priority)}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-soft">Priority</p>
                  </div>
                </div>

                <p className="text-[13px] leading-6 text-body">{row.explanation}</p>

                <div className="rounded-lg bg-canvas px-4 py-3 ring-1 ring-hairline">
                  <p className="text-[11px] uppercase tracking-wide text-muted-soft">What to do</p>
                  <p className="mt-1 text-[13px] leading-6 text-ink">{row.recommendedAction}</p>
                </div>

                {evidence.length > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    <p className="text-[11px] uppercase tracking-wide text-muted-soft">Evidence</p>
                    <ul className="flex flex-col gap-1">
                      {evidence.map((item) => (
                        <li key={item.label} className="text-[12px] leading-5 text-muted-foreground">
                          <span className="text-muted-soft">{item.label}:</span> {item.value}{" "}
                          <span className="text-muted-soft">({item.source})</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {urls.length > 0 ? (
                  <p className="text-[11px] leading-4 text-muted-soft">
                    Affects {urls.length} analyzed page{urls.length === 1 ? "" : "s"}, including{" "}
                    {urls[0]}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

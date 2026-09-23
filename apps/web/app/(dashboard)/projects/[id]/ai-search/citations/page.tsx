import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Quote } from "lucide-react";
import { CrawlRefresh } from "@/components/project/CrawlRefresh";
import { AiCitationsBoard } from "@/components/project/geo/AiCitationsBoard";
import { GeoRunButton } from "@/components/project/geo/GeoRunButton";
import { StatusBadge } from "@/components/project/StatusBadge";
import {
  GEO_ACTIVE,
  dimensionRows,
  getGeoOpportunities,
  getLatestGeoAudit,
  getTopPages,
  relativeTime,
} from "@/lib/geo";
import { getProjectForUser, requireUserId } from "@/lib/projects";
import { normalizeSiteUrl } from "@/lib/site-url";

export default async function AiCitationsPage({ params }: { params: Promise<{ id: string }> }) {
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
  const [pages, opportunities] = await Promise.all([
    getTopPages(project.id, project.latestCrawlId),
    audit ? getGeoOpportunities(project.id, audit.id) : Promise.resolve([]),
  ]);

  const rows = dimensionRows(audit as Record<string, unknown> | null);
  const citation = rows.find((row) => row.id === "citationReadiness");

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
            <Quote className="size-5 shrink-0 text-primary" aria-hidden />
            <h1 className="font-display text-[28px] leading-none tracking-[-0.5px] text-ink">
              AI Citations
            </h1>
            {audit ? <StatusBadge status={project.geoStatus} /> : null}
            {analyzedAt ? (
              <span className="text-[12px] text-muted-soft">
                Last analyzed {relativeTime(analyzedAt)}
              </span>
            ) : null}
          </div>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-body">
            Where this site is mentioned, cited and referenced in AI-generated answers across
            platforms, and how ready its pages are to be quoted.
          </p>
        </div>

        <GeoRunButton
          projectId={project.id}
          active={GEO_ACTIVE.has(project.geoStatus)}
          hasResults={audit != null}
          disabled={!project.latestCrawlId}
        />
      </header>

      <AiCitationsBoard
        projectId={project.id}
        pages={pages}
        citation={citation}
        opportunities={opportunities}
      />
    </div>
  );
}

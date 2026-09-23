import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { CrawlRefresh } from "@/components/project/CrawlRefresh";
import { AiVisibilityBoard } from "@/components/project/geo/AiVisibilityBoard";
import { GeoRunButton } from "@/components/project/geo/GeoRunButton";
import { StatusBadge } from "@/components/project/StatusBadge";
import {
  GEO_ACTIVE,
  getCompetitorsForAiSearch,
  getGeoOpportunities,
  getLatestGeoAudit,
  relativeTime,
} from "@/lib/geo";
import { getProjectForUser, requireUserId } from "@/lib/projects";
import { normalizeSiteUrl } from "@/lib/site-url";

export default async function AiVisibilityPage({ params }: { params: Promise<{ id: string }> }) {
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
  const [competitors, opportunities] = await Promise.all([
    getCompetitorsForAiSearch(project.id),
    audit ? getGeoOpportunities(project.id, audit.id) : Promise.resolve([]),
  ]);

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
            <Sparkles className="size-5 shrink-0 text-primary" aria-hidden />
            <h1 className="font-display text-[28px] leading-none tracking-[-0.5px] text-ink">
              AI Visibility
            </h1>
            {audit ? <StatusBadge status={project.geoStatus} /> : null}
            {analyzedAt ? (
              <span className="text-[12px] text-muted-soft">
                Last analyzed {relativeTime(analyzedAt)}
              </span>
            ) : null}
          </div>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-body">
            Where this brand appears in AI-generated answers, how it is cited, and how that compares
            with competitors across AI search platforms.
          </p>
        </div>

        <GeoRunButton
          projectId={project.id}
          active={GEO_ACTIVE.has(project.geoStatus)}
          hasResults={audit != null}
          disabled={!project.latestCrawlId}
        />
      </header>

      <AiVisibilityBoard
        projectId={project.id}
        domain={hostname}
        competitors={competitors}
        opportunities={opportunities}
        configured={project.aiVisibilityStatus !== "not_configured"}
      />
    </div>
  );
}

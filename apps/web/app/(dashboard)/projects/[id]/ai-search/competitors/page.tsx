import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { AiSearchHeader, NotAvailable } from "@/components/project/geo/AiSearchShell";
import { getCompetitorsForAiSearch, getLatestGeoAudit } from "@/lib/geo";
import { getProjectForUser, requireUserId } from "@/lib/projects";

/**
 * AI Competitors.
 *
 * The comparison this page is named for does not exist yet: GEO analysis runs
 * against the user's own site only, so no competitor has an AI readiness score.
 *
 * Rather than reusing the SEO score under an AI heading — which would read as a
 * measurement it is not — the page lists the competitors we do know about, says
 * plainly what is missing, and shows the one honest comparison available: our
 * own readiness against nothing.
 */
export default async function AiCompetitorsPage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  if (!userId) {
    redirect("/sign-in");
  }

  const { id } = await params;
  const project = await getProjectForUser(id, userId);
  if (!project) {
    notFound();
  }

  const [competitors, audit] = await Promise.all([
    getCompetitorsForAiSearch(project.id),
    getLatestGeoAudit(project.id),
  ]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <AiSearchHeader
        projectId={project.id}
        title="AI Competitors"
        description="How the sites you compete with present themselves to AI-driven search, next to how you do."
      />

      <NotAvailable
        title="Competitor AI readiness is not measured yet"
        body="The AI Search analysis runs against your own site only. Until it runs against competitors too, there is no readiness score to compare, and showing their SEO score under an AI heading would misrepresent what it measures."
        detail={[
          "Their crawler accessibility, entity clarity and answer coverage, scored the same way as yours.",
          "Which of them answer questions your site does not.",
          "Where they are cited in AI answers and you are not, once visibility tracking is connected.",
        ]}
      />

      <section className="flex flex-col gap-4 rounded-xl bg-surface-soft p-5 ring-1 ring-hairline">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[13px] font-semibold text-ink">Competitors tracked</h2>
          <Link
            href={`/projects/${project.id}/competitors`}
            className="rounded-md text-[12px] font-medium text-muted-foreground hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Manage
          </Link>
        </div>

        {competitors.length === 0 ? (
          <p className="rounded-lg bg-canvas px-4 py-3 text-[12px] leading-5 text-muted-soft ring-1 ring-hairline">
            No competitors yet. Add one on the Competitors page and it will appear here once
            competitor AI analysis ships.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {competitors.map((competitor) => (
              <li
                key={competitor.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-canvas px-4 py-3 ring-1 ring-hairline"
              >
                <div className="min-w-0">
                  <p className="truncate font-mono text-[12px] text-ink">{competitor.domain}</p>
                  <p className="mt-0.5 text-[11px] leading-4 text-muted-soft">
                    SEO {competitor.seoScore ?? "not scored"} ·{" "}
                    {competitor.pageCount} page{competitor.pageCount === 1 ? "" : "s"} crawled
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-surface-card px-2 py-0.5 text-[11px] font-medium leading-4 text-muted-soft">
                  AI readiness not measured
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-xl bg-surface-soft p-5 ring-1 ring-hairline">
        <h2 className="text-[13px] font-semibold text-ink">Your readiness</h2>
        {audit?.readinessScore == null ? (
          <p className="text-[12px] leading-5 text-muted-soft">
            Not measured yet. Run the analysis from the AI Search overview.
          </p>
        ) : (
          <>
            <p className="font-display text-[32px] leading-none text-ink">
              {Math.round(audit.readinessScore)}
              <span className="ml-1 font-mono text-[12px] text-muted-soft">/ 100</span>
            </p>
            <p className="text-[11px] leading-4 text-muted-soft">
              Nothing to compare it against yet. A number on its own is a baseline, not a ranking.
            </p>
          </>
        )}
      </section>
    </div>
  );
}

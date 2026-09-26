import type { ReactNode } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { compareCrawls, isImprovement } from "@seo-maker/core/crawl";
import { checks } from "@seo-maker/core/scoring";
import { premiumGate } from "@/components/project/PremiumRoute";
import { ensureSiteOpportunities, getOpportunities } from "@/lib/opportunities";
import { getOutcomes } from "@/lib/outcomes";
import { pageKeyIndex } from "@/lib/page-results";
import { getCrawlHistory, getProjectForUser, requireUserId } from "@/lib/projects";
import { cn } from "@/lib/utils";

/**
 * Before and after (Phase 4.7).
 *
 * Fix -> re-crawl -> measure, from the crawls themselves: which conditions a
 * later crawl no longer finds, which AI recommendations that settles, and how
 * each site opportunity has moved. Deliberately silent on rankings and
 * traffic: SEO Maker has no ranking data for the site.
 */

const LABEL: Record<string, string> = Object.fromEntries(checks.map((check) => [check.id, check.label]));
const dateTime = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });

const OUTCOME_LABEL = {
  resolved: "Resolved",
  persists: "Still failing",
  "not-rechecked": "Page not re-crawled",
  "awaiting-recrawl": "Waiting for a crawl",
} as const;

export default async function ProjectReportsPage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  if (!userId) {
    redirect("/sign-in");
  }
  const { id } = await params;
  const project = await getProjectForUser(id, userId);
  if (!project) {
    notFound();
  }
  const gate = await premiumGate(project.id, "reports");
  if (gate) {
    return gate;
  }

  const history = await getCrawlHistory(project.id, 10, project.latestCrawlId);
  const completed = history.filter((crawl) => crawl.status === "completed");
  const latest = completed.find((crawl) => crawl.id === project.latestCrawlId) ?? completed[0] ?? null;
  const previous = latest ? (completed.find((crawl) => crawl.startedAt < latest.startedAt) ?? null) : null;

  if (!latest) {
    return (
      <div className="flex flex-col gap-4">
        <Header />
        <Note>Crawl the site first. Reports compare what crawls find.</Note>
      </div>
    );
  }

  await ensureSiteOpportunities(project);
  const [outcomes, opportunities] = await Promise.all([
    getOutcomes(project.id, latest, previous),
    getOpportunities(project, project.pages),
  ]);
  const comparison = compareCrawls(completed);
  const { idByKey } = pageKeyIndex(project.pages);

  const counts = { resolved: 0, persists: 0, "not-rechecked": 0, "awaiting-recrawl": 0 };
  for (const row of outcomes.recommendations) counts[row.outcome] += 1;
  const judged = outcomes.recommendations
    .filter((row) => row.outcome === "resolved" || row.outcome === "persists")
    .sort((a, b) => (a.outcome === b.outcome ? b.recommendedAt.getTime() - a.recommendedAt.getTime() : a.outcome === "resolved" ? -1 : 1));

  const site = opportunities.filter((row) => row.source === "site");
  const moved = site.filter((row) => row.outcome === "resolved" || row.outcome === "improved" || row.outcome === "worse");

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <Header />

      <p className="rounded-xl bg-surface-soft px-4 py-3 text-sm leading-6 text-body ring-1 ring-hairline">
        Latest crawl {dateTime.format(latest.startedAt)}
        {previous ? `, compared with ${dateTime.format(previous.startedAt)}` : ""}. These reports say whether an SEO
        condition is still present. They do not measure rankings or traffic: SEO Maker has no ranking data for this site.
      </p>

      {comparison ? (
        <Section title="Crawl against crawl" hint="Scores are snapshots stored with each crawl.">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {comparison.deltas.map((delta) => {
              const better = isImprovement(delta);
              return (
                <div key={delta.label} className="flex flex-col gap-1 rounded-lg bg-canvas/60 p-3 ring-1 ring-hairline">
                  <p className="font-mono text-[11px] text-muted-foreground">{delta.label}</p>
                  <p className="font-display text-[22px] leading-7 tabular-nums text-ink">{delta.current ?? "-"}</p>
                  <p
                    className={cn(
                      "font-mono text-[12px] tabular-nums",
                      better === true ? "text-good" : better === false ? "text-bad" : "text-muted-foreground",
                    )}
                  >
                    {delta.change == null ? "not comparable" : delta.change === 0 ? "no change" : `${delta.change > 0 ? "+" : ""}${delta.change} from ${delta.previous}`}
                  </p>
                </div>
              );
            })}
          </div>
        </Section>
      ) : null}

      <Section
        title="Issues, before and after"
        hint={
          outcomes.diff
            ? `Over the ${outcomes.diff.comparablePages} pages both crawls fetched.${
                outcomes.diff.pagesOnlyBefore || outcomes.diff.pagesOnlyAfter
                  ? ` ${outcomes.diff.pagesOnlyBefore} pages only in the earlier crawl and ${outcomes.diff.pagesOnlyAfter} only in the latest are not compared.`
                  : ""
              }`
            : undefined
        }
      >
        {outcomes.diff ? (
          outcomes.diff.byCheck.length === 0 ? (
            <Note>No failing checks in either crawl.</Note>
          ) : (
            <table className="w-full border-collapse text-left text-sm">
              <thead className="font-mono text-[12px] text-muted-foreground">
                <tr>
                  <th scope="col" className="py-2 font-medium">Check</th>
                  <th scope="col" className="py-2 text-right font-medium">Fixed</th>
                  <th scope="col" className="py-2 text-right font-medium">New</th>
                  <th scope="col" className="py-2 text-right font-medium">Still failing</th>
                </tr>
              </thead>
              <tbody>
                {outcomes.diff.byCheck.map((row) => (
                  <tr key={row.checkId} className="border-t border-hairline">
                    <td className="py-2 text-ink">{LABEL[row.checkId] ?? row.checkId}</td>
                    <td className={cn("py-2 text-right font-mono tabular-nums", row.fixed ? "text-good" : "text-muted-foreground")}>{row.fixed}</td>
                    <td className={cn("py-2 text-right font-mono tabular-nums", row.introduced ? "text-bad" : "text-muted-foreground")}>{row.introduced}</td>
                    <td className="py-2 text-right font-mono tabular-nums text-body">{row.persisting}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : (
          <Note>This is the first complete crawl. Crawl again after making changes, and this shows what they fixed.</Note>
        )}
      </Section>

      <Section title="AI recommendations, checked against the latest crawl" hint="The newest recommendation per page and check.">
        {outcomes.recommendations.length === 0 ? (
          <Note>
            No AI recommendations yet. Analyse pages in the{" "}
            <Link href={`/projects/${project.id}/suggestions`} className="text-ink underline underline-offset-2">
              AI workspace
            </Link>
            , make the changes, then crawl again.
          </Note>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {(Object.keys(counts) as Array<keyof typeof counts>).map((key) => (
                <div key={key} className="flex flex-col gap-1 rounded-lg bg-canvas/60 p-3 ring-1 ring-hairline">
                  <p className="font-mono text-[11px] text-muted-foreground">{OUTCOME_LABEL[key]}</p>
                  <p className={cn("font-display text-[22px] leading-7 tabular-nums", key === "resolved" && counts[key] ? "text-good" : "text-ink")}>
                    {counts[key]}
                  </p>
                </div>
              ))}
            </div>
            {judged.length > 0 ? (
              <ul className="flex flex-col">
                {judged.slice(0, 40).map((row) => {
                  const pageId = idByKey.get(row.pageKey);
                  const path = `/${row.pageKey.split("/").slice(1).join("/")}`;
                  return (
                    <li key={`${row.pageKey}-${row.checkId}`} className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline py-2 first:border-t-0">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className={cn("shrink-0 rounded-full px-2 py-0.5 font-mono text-[11px]", row.outcome === "resolved" ? "bg-good/10 text-good" : "bg-warn/10 text-warn")}>
                          {OUTCOME_LABEL[row.outcome]}
                        </span>
                        <span className="text-sm text-ink">{LABEL[row.checkId] ?? row.checkId}</span>
                        {pageId ? (
                          <Link href={`/projects/${project.id}/pages/${pageId}`} className="truncate font-mono text-[12px] text-body hover:text-ink">
                            {path}
                          </Link>
                        ) : (
                          <span className="truncate font-mono text-[12px] text-muted-foreground">{path}</span>
                        )}
                      </span>
                      <span className="font-mono text-[11px] text-muted-foreground">recommended {dateTime.format(row.recommendedAt)}</span>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </>
        )}
      </Section>

      <Section title="Site opportunities since first found" hint="Pages or entries affected when first found, and now.">
        {moved.length === 0 ? (
          <Note>
            No site opportunity has moved yet.{" "}
            <Link href={`/projects/${project.id}/opportunities`} className="text-ink underline underline-offset-2">
              See what to do
            </Link>
            , then crawl again.
          </Note>
        ) : (
          <ul className="flex flex-col">
            {moved.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline py-2 first:border-t-0">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 font-mono text-[11px]",
                      row.outcome === "worse" ? "bg-bad/10 text-bad" : "bg-good/10 text-good",
                    )}
                  >
                    {row.outcome}
                  </span>
                  <span className="truncate text-sm text-ink">{row.title}</span>
                </span>
                <span className="font-mono text-[12px] tabular-nums text-body">
                  {row.baselineCount ?? "-"} → {row.affectedCount}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Header() {
  return (
    <header className="flex flex-col gap-2">
      <p className="font-mono text-[12px] text-primary">Reports</p>
      <h1 className="font-display text-[30px] leading-none tracking-[-0.8px] text-ink">Before and after</h1>
      <p className="max-w-2xl text-sm leading-6 text-body">
        What changed between crawls, measured from the crawls themselves: fix something, crawl again, and see whether the
        condition is gone.
      </p>
    </header>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-3 rounded-xl bg-surface-soft p-5 ring-1 ring-hairline">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-[18px] leading-6 tracking-[-0.3px] text-ink">{title}</h2>
        {hint ? <p className="text-xs leading-5 text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-6 text-body">{children}</p>;
}

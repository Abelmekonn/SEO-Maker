"use client";

import type { CompetitorFindings } from "@seo-maker/core/competitors";
import type { SeoDimensionId, StoredConfidence } from "@seo-maker/core/scoring";
import { ArrowLeft, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { CompetitorConfidenceCard } from "@/components/project/CompetitorConfidenceCard";
import { CompetitorSeoBreakdown } from "@/components/project/CompetitorSeoBreakdown";
import { CompetitorStatusBadge } from "@/components/project/CompetitorStatusBadge";
import { cn } from "@/lib/utils";

export type CompetitorPageRow = {
  id: string;
  url: string;
  title: string | null;
  h1: string | null;
  wordCount: number | null;
  internalLinks: number | null;
  schemaCount: number | null;
  statusCode: number | null;
  seoScore: number | null;
  /** Why this page was selected for the crawl. */
  selectionReason: string | null;
};

export type CompetitorQueryRow = {
  query: string;
  position: number;
  url: string;
  selfPosition: number | null;
};

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "rankings", label: "Rankings" },
  { id: "pages", label: "Pages" },
  { id: "content", label: "Content" },
  { id: "gaps", label: "Gaps & insights" },
  { id: "compare", label: "Compare" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function CompetitorDetail({
  projectId,
  competitorId,
  domain,
  name,
  status,
  statusError,
  initialTab,
  confidence,
  confidenceBand,
  confidenceBreakdown,
  findings,
  searchNote,
  seoScore,
  dimensions,
  notMeasured,
  selfSeoScore,
  selfDimensions,
  selfNotMeasured,
  pages,
  queries,
  summary,
  gapsPanel,
  lastAnalyzedAt,
}: {
  projectId: string;
  competitorId: string;
  domain: string;
  name: string | null;
  status: string;
  statusError: string | null;
  initialTab: TabId;
  confidence: number | null;
  confidenceBand: string | null;
  confidenceBreakdown: StoredConfidence | null;
  /** Observed evidence and the opportunities it suggests, kept apart. */
  findings: CompetitorFindings;
  /** Why there are no search results to show, when there are none. */
  searchNote: string | null;
  seoScore: number | null;
  dimensions: Partial<Record<SeoDimensionId, number | null>>;
  notMeasured: SeoDimensionId[];
  selfSeoScore: number | null;
  selfDimensions: Partial<Record<SeoDimensionId, number | null>>;
  selfNotMeasured: SeoDimensionId[];
  pages: CompetitorPageRow[];
  queries: CompetitorQueryRow[];
  summary: string | null;
  /** The comparison and its interpretation, rendered on the server (Phase 4.1). */
  gapsPanel?: ReactNode;
  lastAnalyzedAt: string | null;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<TabId>(initialTab);

  function selectTab(next: TabId) {
    setTab(next);
    router.replace(`/projects/${projectId}/competitors/${competitorId}?tab=${next}`, {
      scroll: false,
    });
  }

  const wordCounts = pages.map((p) => p.wordCount).filter((v): v is number => v != null);
  const avgWords = wordCounts.length
    ? Math.round(wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length)
    : null;
  const schemaKnown = pages.filter((p) => p.schemaCount != null);
  const schemaCoverage = schemaKnown.length
    ? Math.round(
        (schemaKnown.filter((p) => (p.schemaCount ?? 0) >= 1).length / schemaKnown.length) * 100,
      )
    : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <Link
        href={`/projects/${projectId}/competitors`}
        className="inline-flex min-h-10 w-fit items-center gap-1.5 rounded-md font-mono text-sm text-body hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All competitors
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-card ring-1 ring-hairline">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`}
              alt=""
              width={20}
              height={20}
              className="size-5"
            />
          </span>
          <div className="flex min-w-0 flex-col gap-2">
            <h1 className="font-display text-[28px] leading-none tracking-[-0.5px] text-ink">
              {domain}
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              {name ? <p className="text-sm text-body">{name}</p> : null}
              <CompetitorStatusBadge status={status} title={statusError ?? undefined} />
              {lastAnalyzedAt ? (
                <span className="font-mono text-[12px] text-muted-foreground">
                  Analyzed {lastAnalyzedAt}
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <a
          href={`https://${domain}`}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex h-11 items-center gap-1.5 rounded-md px-3 font-mono text-sm text-body ring-1 ring-hairline hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Open site
          <ExternalLink className="size-4" aria-hidden />
        </a>
      </header>

      {statusError ? (
        <p role="alert" className="rounded-lg bg-surface-soft px-5 py-4 text-sm text-bad ring-1 ring-bad/40">
          {statusError}
        </p>
      ) : null}

      <div role="tablist" aria-label="Competitor detail" className="flex flex-wrap items-center gap-1 border-b border-hairline">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => selectTab(item.id)}
            className={cn(
              "-mb-px inline-flex h-11 items-center rounded-t-md border-b-2 px-3 font-mono text-[12px]",
              tab === item.id
                ? "border-primary text-ink"
                : "border-transparent text-muted-foreground hover:text-ink",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <div className="flex flex-col gap-4">
          <CompetitorConfidenceCard
            score={confidence}
            band={confidenceBand}
            breakdown={confidenceBreakdown}
            domain={domain}
            status={status}
          />
          {findings.observed.length > 0 || findings.opportunities.length > 0 || summary ? (
            <section className="flex flex-col gap-4 rounded-xl bg-surface-soft p-5 ring-1 ring-hairline">
              <div>
                <h2 className="font-display text-[18px] leading-6 tracking-[-0.3px] text-ink">Why {domain} is visible</h2>
                <p className="mt-1 text-sm leading-6 text-body">
                  What the checked searches and the crawl recorded, and, separately, what you could do about it. Nothing here
                  says why search engines rank it, and nothing promises a ranking.
                </p>
              </div>
              {findings.observed.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <h3 className="font-mono text-[12px] text-muted-foreground">Observed</h3>
                  <ul className="flex flex-col gap-1.5 text-sm leading-6 text-body">
                    {findings.observed.map((row) => (
                      <li key={row.text} className="flex gap-2">
                        <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-muted-foreground/60" />
                        {row.text}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : summary ? (
                <p className="text-sm leading-6 text-body">{summary}</p>
              ) : null}
              {findings.opportunities.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <h3 className="font-mono text-[12px] text-muted-foreground">Opportunities (interpretation)</h3>
                  <ul className="flex flex-col gap-1.5 text-sm leading-6 text-body">
                    {findings.opportunities.map((row) => (
                      <li key={row.factId} className="flex gap-2">
                        <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-primary" />
                        {row.text}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          ) : null}
          <CompetitorSeoBreakdown
            title={`${domain} SEO score`}
            score={seoScore}
            dimensions={dimensions}
            notMeasured={notMeasured}
          />
        </div>
      ) : null}

      {tab === "rankings" ? (
        <section className="flex flex-col gap-4 rounded-xl bg-surface-soft p-5 ring-1 ring-hairline">
          <div>
            <h2 className="font-display text-[18px] leading-6 tracking-[-0.3px] text-ink">
              Shared searches
            </h2>
            <p className="mt-1 text-sm text-body">
              The searches that identified {domain} as a competitor, and where you rank on each.
            </p>
          </div>
          {queries.length === 0 ? (
            <p className="text-sm leading-6 text-body">
              {searchNote ?? `${domain} did not appear in any of the searches checked.`}
            </p>
          ) : (
            <table className="w-full border-collapse text-left text-sm">
              <thead className="font-mono text-[12px] text-muted-foreground">
                <tr>
                  <th scope="col" className="py-2 font-medium">Search</th>
                  <th scope="col" className="py-2 text-right font-medium">They rank</th>
                  <th scope="col" className="py-2 text-right font-medium">You rank</th>
                </tr>
              </thead>
              <tbody>
                {queries.map((row) => (
                  <tr key={`${row.query}-${row.position}`} className="border-t border-hairline">
                    <td className="py-2 text-ink">{row.query}</td>
                    <td className="py-2 text-right font-mono tabular-nums text-body">
                      #{row.position}
                    </td>
                    <td className="py-2 text-right font-mono tabular-nums text-body">
                      {row.selfPosition == null ? (
                        <span className="text-muted-soft">Not in top results</span>
                      ) : (
                        `#${row.selfPosition}`
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ) : null}

      {tab === "pages" ? (
        <section className="flex flex-col gap-4">
          <div>
            <h2 className="font-display text-[18px] leading-6 tracking-[-0.3px] text-ink">
              Pages we analyzed
            </h2>
            <p className="mt-1 text-sm text-body">
              Only its most important pages: the homepage, pages that ranked in your searches, and its main service, product
              and pricing pages. The whole site is never crawled.
            </p>
          </div>
          {pages.length === 0 ? (
            <p className="text-sm leading-6 text-body">No pages stored yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-2xl bg-surface-soft ring-1 ring-hairline">
              <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                <thead className="font-mono text-[12px] text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-5 py-3.5 font-medium">URL</th>
                    <th scope="col" className="px-5 py-3.5 font-medium">Why selected</th>
                    <th scope="col" className="px-5 py-3.5 font-medium">Title</th>
                    <th scope="col" className="px-5 py-3.5 font-medium">Words</th>
                    <th scope="col" className="px-5 py-3.5 font-medium">Links</th>
                    <th scope="col" className="px-5 py-3.5 font-medium">Schema</th>
                  </tr>
                </thead>
                <tbody>
                  {pages.map((page) => (
                    <tr key={page.id} className="border-t border-hairline">
                      <td className="max-w-[280px] px-5 py-4">
                        <p className="truncate font-mono text-ink">{page.url}</p>
                      </td>
                      <td className="max-w-[220px] px-5 py-4">
                        <p className="truncate text-[12px] text-muted-foreground" title={page.selectionReason ?? undefined}>
                          {page.selectionReason ?? "—"}
                        </p>
                      </td>
                      <td className="max-w-[260px] px-5 py-4">
                        <p className="truncate text-body">{page.title ?? "—"}</p>
                      </td>
                      <td className="px-5 py-4 font-mono tabular-nums text-body">
                        {page.wordCount ?? "—"}
                      </td>
                      <td className="px-5 py-4 font-mono tabular-nums text-body">
                        {page.internalLinks ?? "—"}
                      </td>
                      <td className="px-5 py-4 font-mono tabular-nums text-body">
                        {page.schemaCount ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {tab === "content" ? (
        <section className="grid gap-3 sm:grid-cols-3">
          <Stat label="Pages analyzed" value={String(pages.length)} />
          <Stat label="Average words" value={avgWords == null ? "Not measured" : String(avgWords)} />
          <Stat
            label="Schema coverage"
            value={schemaCoverage == null ? "Not measured" : `${schemaCoverage}%`}
          />
        </section>
      ) : null}

      {tab === "gaps" && gapsPanel ? gapsPanel : null}

      {tab === "gaps" && !gapsPanel ? (
        <section className="rounded-xl bg-surface-soft p-5 ring-1 ring-hairline">
          <h2 className="font-display text-[18px] leading-6 tracking-[-0.3px] text-ink">
            Content gaps
          </h2>
          <p className="mt-2 text-sm leading-6 text-body">
            Gap detection compares topic coverage across all your tracked competitors. Run it from
            the Competitors page once more than one competitor has been analyzed.
          </p>
        </section>
      ) : null}

      {tab === "compare" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <CompetitorSeoBreakdown
            title="Your site"
            score={selfSeoScore}
            dimensions={selfDimensions}
            notMeasured={selfNotMeasured}
          />
          <CompetitorSeoBreakdown
            title={domain}
            score={seoScore}
            dimensions={dimensions}
            notMeasured={notMeasured}
          />
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-soft p-5 ring-1 ring-hairline">
      <p className="font-mono text-[12px] text-muted-foreground">{label}</p>
      <p className="mt-2 font-display text-[24px] leading-none tracking-[-0.4px] tabular-nums text-ink">
        {value}
      </p>
    </div>
  );
}

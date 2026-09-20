"use client";

import {
  type ConfidenceBand,
  confidenceBandLabels,
  confidenceBandRating,
  seoScoreBand,
  seoScoreBandRating,
} from "@seo-maker/core/scoring";
import { Info, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { CompetitorRowActions } from "@/components/project/CompetitorRowActions";
import { CompetitorStatusBadge } from "@/components/project/CompetitorStatusBadge";
import { cn } from "@/lib/utils";

export type CompetitorRow = {
  id: string;
  domain: string;
  name: string | null;
  source: string;
  status: string;
  statusError: string | null;
  confidence: number | null;
  confidenceBand: string | null;
  seoScore: number | null;
  pageCount: number;
  queryCount: number;
  topQueryCount: number;
  avgPosition: number | null;
  pinned: boolean;
  crawlDone: number;
  crawlTotal: number;
};

const ratingClass: Record<string, string> = {
  good: "bg-good/15 text-good",
  warn: "bg-warn/15 text-warn",
  bad: "bg-bad/15 text-bad",
  none: "bg-surface-card text-muted-foreground",
};

const sourceLabels: Record<string, string> = {
  manual: "Added by you",
  serp: "Found in search",
  ai: "Suggested",
};

const ACTIVE = new Set(["queued", "crawling", "analyzing"]);

export function CompetitorTable({
  projectId,
  rows,
  totalQueries,
}: {
  projectId: string;
  rows: CompetitorRow[];
  totalQueries: number;
}) {
  const router = useRouter();

  if (rows.length === 0) {
    return null;
  }

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="font-display text-[18px] leading-6 tracking-[-0.3px] text-ink">
          Competitors
        </h2>
        <p className="mt-1 text-sm text-body">
          {rows.length} tracked. Confidence is how strongly a domain competes with you in search —
          it is not an SEO score.
        </p>
      </div>

      <div className="overflow-x-auto rounded-2xl bg-surface-soft ring-1 ring-hairline">
        <table className="w-full min-w-[860px] border-collapse text-left text-sm">
          <caption className="sr-only">Tracked competitors and their scores</caption>
          <thead className="font-mono text-[12px] text-muted-foreground">
            <tr>
              <th scope="col" className="px-5 py-3.5 font-medium">
                Domain
              </th>
              <th scope="col" className="px-5 py-3.5 font-medium">
                Source
              </th>
              <th scope="col" className="px-5 py-3.5 font-medium">
                <span className="inline-flex items-center gap-1">
                  Confidence
                  <Info className="size-3 text-muted-soft" aria-hidden />
                </span>
              </th>
              <th scope="col" className="px-5 py-3.5 font-medium">
                Shared searches
              </th>
              <th scope="col" className="px-5 py-3.5 font-medium">
                Avg position
              </th>
              <th scope="col" className="px-5 py-3.5 font-medium">
                SEO score
              </th>
              <th scope="col" className="px-5 py-3.5 font-medium">
                Pages
              </th>
              <th scope="col" className="px-5 py-3.5 font-medium">
                Status
              </th>
              <th scope="col" className="px-5 py-3.5 text-right font-medium">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const href = `/projects/${projectId}/competitors/${row.id}`;
              const busy = ACTIVE.has(row.status);
              const band = (row.confidenceBand ?? null) as ConfidenceBand | null;
              const seo = row.seoScore == null ? null : seoScoreBand(row.seoScore);

              return (
                <tr
                  key={row.id}
                  role="link"
                  tabIndex={0}
                  onClick={() => router.push(href)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      router.push(href);
                    }
                  }}
                  className={cn(
                    "cursor-pointer border-t border-hairline hover:bg-surface-card/60 focus-visible:bg-surface-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    busy && "bg-primary/5",
                  )}
                >
                  <td className="max-w-[260px] px-5 py-4">
                    <span className="flex items-center gap-2.5">
                      <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-card ring-1 ring-hairline">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(row.domain)}&sz=64`}
                          alt=""
                          width={20}
                          height={20}
                          className="size-5"
                        />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-mono text-ink">{row.domain}</span>
                        {row.name ? (
                          <span className="block truncate text-[12px] text-muted-foreground">
                            {row.name}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </td>
                  <td className="px-5 py-4 text-[12px] text-muted-foreground">
                    {sourceLabels[row.source] ?? row.source}
                  </td>
                  <td className="px-5 py-4">
                    {row.confidence == null ? (
                      <span className="font-mono text-[12px] text-muted-soft">Not enough data</span>
                    ) : (
                      <span className="flex flex-col gap-1">
                        <span
                          className={cn(
                            "inline-flex w-fit rounded-full px-2 py-0.5 font-mono text-[12px] tabular-nums",
                            ratingClass[band ? confidenceBandRating[band] : "none"],
                          )}
                        >
                          {Math.round(row.confidence)}
                        </span>
                        {band ? (
                          <span className="text-[11px] text-muted-foreground">
                            {confidenceBandLabels[band]}
                          </span>
                        ) : null}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4 font-mono tabular-nums text-body">
                    {totalQueries === 0 ? (
                      <span className="text-muted-soft">Not measured</span>
                    ) : (
                      `${row.queryCount}/${totalQueries}`
                    )}
                  </td>
                  <td className="px-5 py-4 font-mono tabular-nums text-body">
                    {row.avgPosition == null ? (
                      <span className="text-muted-soft">—</span>
                    ) : (
                      row.avgPosition.toFixed(1)
                    )}
                  </td>
                  <td className="px-5 py-4">
                    {row.seoScore == null ? (
                      <span className="font-mono text-[12px] text-muted-soft">
                        {busy ? "Measuring" : "Not measured"}
                      </span>
                    ) : (
                      <span
                        className={cn(
                          "inline-flex min-w-[34px] justify-center rounded-full px-2 py-0.5 font-mono text-[12px] tabular-nums",
                          ratingClass[seo ? seoScoreBandRating[seo] : "none"],
                        )}
                      >
                        {Math.round(row.seoScore)}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4 font-mono tabular-nums text-body">
                    {busy && row.crawlTotal > 0 ? (
                      <span className="inline-flex items-center gap-1.5 text-primary">
                        <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
                        {row.crawlDone}
                      </span>
                    ) : (
                      row.pageCount
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <CompetitorStatusBadge
                      status={row.status}
                      title={row.statusError ?? undefined}
                    />
                  </td>
                  <td className="px-5 py-4">
                    <CompetitorRowActions
                      projectId={projectId}
                      competitorId={row.id}
                      pinned={row.pinned}
                      busy={busy}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

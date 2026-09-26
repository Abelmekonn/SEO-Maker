"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Search } from "lucide-react";
import type { Page } from "@seo-maker/db";
import { ScoreRing } from "@/components/project/ScoreRing";
import {
  failedChecks,
  healthLabels,
  isCrawled,
  pageHealth,
  pageSeoScore,
  type PageHealth,
} from "@/lib/page-audit";
import { pagePath } from "@/lib/site-url";
import { cn } from "@/lib/utils";

/**
 * A preview: the overview shows this many pages, and "View more" opens the
 * Pages screen, which holds the full inventory.
 */
const PREVIEW_ROWS = 8;

type Tab = "all" | "issues" | "warnings" | "optimized";

const healthStyle: Record<PageHealth, string> = {
  optimized: "bg-good/15 text-good",
  issues: "bg-primary/15 text-primary",
  warnings: "bg-warn/15 text-warn",
  critical: "bg-bad/15 text-bad",
  pending: "bg-surface-card text-muted-foreground",
};

export type OverviewTableRow = {
  id?: string;
  path: string;
  title: string;
  score: number | null;
  health: PageHealth;
  perf: number | null;
  issues: number | null;
};

export function OverviewPageTable({
  pages,
  projectId,
  homepageId,
  homepagePerf,
  demo,
}: {
  pages: Page[];
  projectId: string;
  homepageId: string | null;
  homepagePerf: number | null;
  demo?: {
    counts: { all: number; issues: number; warnings: number; optimized: number };
    rows: OverviewTableRow[];
  };
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");

  const liveRows = useMemo<OverviewTableRow[]>(
    () =>
      pages.map((page) => ({
        id: page.id,
        path: pagePath(page.finalUrl ?? page.url),
        title: page.title?.trim() ?? "",
        score: pageSeoScore(page),
        health: pageHealth(page),
        perf: page.id === homepageId ? homepagePerf : null,
        issues: isCrawled(page) ? failedChecks(page).length : null,
      })),
    [homepageId, homepagePerf, pages],
  );

  const rows = demo?.rows ?? liveRows;

  const counts = demo?.counts ?? {
    all: rows.length,
    issues: rows.filter((row) => row.health === "issues" || row.health === "critical").length,
    warnings: rows.filter((row) => row.health === "warnings").length,
    optimized: rows.filter((row) => row.health === "optimized").length,
  };

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (tab === "issues" && row.health !== "issues" && row.health !== "critical") return false;
      if (tab === "warnings" && row.health !== "warnings") return false;
      if (tab === "optimized" && row.health !== "optimized") return false;
      if (!needle) return true;
      return row.path.toLowerCase().includes(needle) || row.title.toLowerCase().includes(needle);
    });
  }, [query, rows, tab]);

  const slice = filtered.slice(0, PREVIEW_ROWS);

  const tabs: Array<{ id: Tab; label: string; count: number }> = [
    { id: "all", label: "All pages", count: counts.all },
    { id: "issues", label: "Issues", count: counts.issues },
    { id: "warnings", label: "Warnings", count: counts.warnings },
    { id: "optimized", label: "Optimized", count: counts.optimized },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-surface-soft ring-1 ring-hairline">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-5 py-3">
        <div role="tablist" aria-label="Filter pages" className="flex flex-wrap items-center gap-1">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={cn(
                "inline-flex h-11 items-center gap-1 rounded-md px-3 font-mono text-[12px]",
                tab === item.id ? "bg-surface-card text-ink" : "text-muted-foreground hover:text-ink",
              )}
              onClick={() => setTab(item.id)}
            >
              {item.label}
              <span className="tabular-nums">({item.count})</span>
            </button>
          ))}
        </div>
        <label className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <span className="sr-only">Search pages</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search pages"
            className="h-11 w-full rounded-md border border-hairline bg-canvas pl-9 pr-3 text-sm text-ink outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
      </div>

      {filtered.length === 0 ? (
        <p className="px-5 py-8 text-sm leading-6 text-body">
          {rows.length === 0 ? "No pages yet. Run a crawl to fill this table." : "No pages match this filter."}
        </p>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[880px] border-collapse text-sm">
            <caption className="sr-only">Page analysis</caption>
            <thead className="sticky top-0 z-10 bg-surface-card">
              <tr className="text-left font-mono text-[12px] text-muted-foreground">
                <th scope="col" className="px-5 py-3.5 font-medium">
                  Page
                </th>
                <th scope="col" className="px-5 py-3.5 font-medium">
                  SEO score
                </th>
                <th scope="col" className="px-5 py-3.5 font-medium">
                  Status
                </th>
                <th scope="col" className="px-5 py-3.5 font-medium">
                  Title
                </th>
                <th scope="col" className="px-5 py-3.5 font-medium">
                  Performance
                </th>
                <th scope="col" className="px-5 py-3.5 font-medium">
                  Issues
                </th>
              </tr>
            </thead>
            <tbody>
              {slice.map((row) => {
                const href = row.id
                  ? `/projects/${projectId}/pages/${row.id}`
                  : `/projects/${projectId}/pages`;

                return (
                  <tr
                    key={`${row.path}-${row.title}`}
                    className="cursor-pointer border-t border-hairline hover:bg-surface-card/60 focus-visible:bg-surface-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    role="link"
                    tabIndex={0}
                    aria-label={`Open ${row.path}`}
                    onClick={() => router.push(href)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        router.push(href);
                      }
                    }}
                  >
                    <td className="max-w-[420px] px-5 py-4 font-mono text-ink">
                      <span className="block truncate" title={row.path}>
                        {row.path}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4">
                      {row.score == null ? (
                        <span className="text-muted-foreground">-</span>
                      ) : (
                        <ScoreRing score={row.score} label={`SEO score for ${row.path}`} showValue />
                      )}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2.5 py-1 font-mono text-[12px] leading-4",
                          healthStyle[row.health],
                        )}
                      >
                        {healthLabels[row.health]}
                      </span>
                    </td>
                    <td className="w-full max-w-0 px-5 py-4">
                      <span className="block truncate text-body" title={row.title || undefined}>
                        {row.title || "-"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 font-mono text-[12px] tabular-nums text-body">
                      {row.perf == null ? "-" : Math.round(row.perf)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 font-mono text-[12px] tabular-nums">
                      {row.issues == null ? (
                        <span className="text-muted-foreground">-</span>
                      ) : row.issues === 0 ? (
                        <span className="text-good">0</span>
                      ) : (
                        <span className="text-bad">{row.issues}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {filtered.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline px-5 py-2">
          <p className="font-mono text-[12px] text-muted-foreground">
            Showing {slice.length} of {filtered.length} {filtered.length === 1 ? "page" : "pages"}
          </p>
          <Link
            href={`/projects/${projectId}/pages`}
            className="inline-flex h-11 items-center gap-1 font-mono text-[12px] text-body hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            View more
            <ArrowUpRight className="size-3.5" aria-hidden />
          </Link>
        </div>
      ) : null}
    </div>
  );
}

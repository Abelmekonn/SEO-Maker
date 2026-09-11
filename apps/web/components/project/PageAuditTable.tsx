"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ExternalLink,
  ListFilter,
  LoaderCircle,
  Search,
} from "lucide-react";
import type { Page } from "@seo-maker/db";
import { ScoreRing } from "@/components/project/ScoreRing";
import { StatusBadge } from "@/components/project/StatusBadge";
import { Button } from "@/components/ui/button";
import { failedChecks, hasIssue, isCrawled, pageSeoScore, THIN_WORD_LIMIT } from "@/lib/page-audit";
import { pagePath } from "@/lib/site-url";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 10;

type Tab = "all" | "issues" | "passed" | "excluded";

function Dash() {
  return <span className="text-muted-foreground">-</span>;
}

function LoadingValue({ label = "Crawling" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
      <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
      <span className="font-mono text-[12px]">{label}</span>
    </span>
  );
}

function isLoading(page: Page) {
  return page.status === "pending" || page.status === "crawling";
}

function FieldCell({
  page,
  value,
}: {
  page: Page;
  value: string | null | undefined;
}) {
  if (!isCrawled(page)) {
    return isLoading(page) ? <LoadingValue /> : <Dash />;
  }
  if (!value?.trim()) {
    return <Dash />;
  }
  return (
    <span className="block truncate text-body" title={value}>
      {value}
    </span>
  );
}

export function PageAuditTable({
  pages,
  projectId,
  pageSize = PAGE_SIZE,
}: {
  pages: Page[];
  projectId?: string;
  pageSize?: number;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [pageIndex, setPageIndex] = useState(0);

  const counts = useMemo(() => {
    const issues = pages.filter((page) => isCrawled(page) && hasIssue(page)).length;
    const passed = pages.filter((page) => page.status === "analyzed" && !hasIssue(page)).length;
    return { all: pages.length, issues, passed, excluded: 0 };
  }, [pages]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return pages.filter((page) => {
      if (tab === "issues" && !(isCrawled(page) && hasIssue(page))) return false;
      if (tab === "passed" && !(page.status === "analyzed" && !hasIssue(page))) return false;
      if (tab === "excluded") return false;
      if (!needle) return true;
      const path = pagePath(page.finalUrl ?? page.url).toLowerCase();
      const title = (page.title ?? "").toLowerCase();
      return path.includes(needle) || title.includes(needle);
    });
  }, [pages, query, tab]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safeIndex = Math.min(pageIndex, pageCount - 1);
  const slice = filtered.slice(safeIndex * pageSize, safeIndex * pageSize + pageSize);
  const from = filtered.length === 0 ? 0 : safeIndex * pageSize + 1;
  const to = Math.min(filtered.length, (safeIndex + 1) * pageSize);

  function goTab(next: Tab) {
    setTab(next);
    setPageIndex(0);
  }

  const tabs: Array<{ id: Tab; label: string; count: number }> = [
    { id: "all", label: "All pages", count: counts.all },
    { id: "issues", label: "Issues", count: counts.issues },
    { id: "passed", label: "Passed", count: counts.passed },
    { id: "excluded", label: "Excluded", count: counts.excluded },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg bg-surface-soft ring-1 ring-hairline">
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
                tab === item.id
                  ? "bg-surface-card text-ink"
                  : "text-muted-foreground hover:text-ink",
              )}
              onClick={() => goTab(item.id)}
            >
              {item.label}
              <span className="tabular-nums">({item.count})</span>
            </button>
          ))}
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2 sm:max-w-md">
          <span className="inline-flex h-11 items-center gap-2 rounded-md px-3 font-mono text-[12px] text-muted-foreground">
            <ListFilter className="size-4" aria-hidden />
            Filter
          </span>
          <label className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <span className="sr-only">Search URLs or titles</span>
            <input
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPageIndex(0);
              }}
              placeholder="Search URLs or titles"
              className="h-11 w-full rounded-md border border-hairline bg-canvas pl-9 pr-3 text-sm text-ink outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="px-5 py-8 text-sm leading-6 text-body">
          {pages.length === 0
            ? "No pages yet. Run a crawl to fill this table."
            : tab === "excluded"
              ? "No excluded pages. Every URL in the crawl is listed here."
              : "No pages match this filter."}
        </p>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[1100px] border-collapse text-sm">
            <caption className="sr-only">Audit results per page</caption>
            <thead className="sticky top-0 z-10 bg-surface-card">
              <tr className="text-left font-mono text-[12px] text-muted-foreground">
                <th scope="col" className="px-5 py-3.5 font-medium">
                  URL
                </th>
                <th scope="col" className="px-5 py-3.5 font-medium">
                  Status
                </th>
                <th scope="col" className="px-5 py-3.5 font-medium">
                  SEO score
                </th>
                <th scope="col" className="px-5 py-3.5 font-medium">
                  Title
                </th>
                <th scope="col" className="px-5 py-3.5 font-medium">
                  Meta description
                </th>
                <th scope="col" className="px-5 py-3.5 font-medium">
                  H1
                </th>
                <th scope="col" className="px-5 py-3.5 text-right font-medium">
                  Words
                </th>
                <th scope="col" className="px-5 py-3.5 font-medium">
                  Issues
                </th>
              </tr>
            </thead>
            <tbody>
              {slice.map((page) => {
                const path = pagePath(page.finalUrl ?? page.url);
                const href = projectId ? `/projects/${projectId}/pages/${page.id}` : null;
                const live = page.finalUrl ?? page.url;
                const score = pageSeoScore(page);
                const issueCount = isCrawled(page) ? failedChecks(page).length : null;

                return (
                  <tr
                    key={page.id}
                    className={cn(
                      "border-t border-hairline transition-colors",
                      isLoading(page) && "bg-surface-card/30",
                      href &&
                        "cursor-pointer hover:bg-surface-card/60 focus-visible:bg-surface-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    )}
                    role={href ? "link" : undefined}
                    tabIndex={href ? 0 : undefined}
                    aria-label={href ? `Open ${path}` : undefined}
                    onClick={href ? () => router.push(href) : undefined}
                    onKeyDown={
                      href
                        ? (event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              router.push(href);
                            }
                          }
                        : undefined
                    }
                  >
                    <td className="max-w-[220px] px-5 py-4 font-mono text-ink">
                      <span className="flex items-center gap-2">
                        <span className="min-w-0 truncate whitespace-nowrap" title={path}>
                          {path}
                        </span>
                        <a
                          href={live}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`Open live page ${path}`}
                          className="shrink-0 text-muted-foreground hover:text-ink"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <ExternalLink className="size-3.5" />
                        </a>
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4">
                      <StatusBadge status={page.status} />
                    </td>
                    <td className="whitespace-nowrap px-5 py-4">
                      {score == null ? (
                        isLoading(page) ? (
                          <LoadingValue label="Scoring" />
                        ) : (
                          <Dash />
                        )
                      ) : (
                        <ScoreRing score={score} label={`SEO score for ${path}`} showValue />
                      )}
                    </td>
                    <td className="max-w-[220px] px-5 py-4">
                      <FieldCell page={page} value={page.title} />
                    </td>
                    <td className="max-w-[260px] px-5 py-4">
                      <FieldCell page={page} value={page.metaDesc} />
                    </td>
                    <td className="max-w-[200px] px-5 py-4">
                      <FieldCell page={page} value={page.h1} />
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-right font-mono tabular-nums text-body">
                      {!isCrawled(page) || page.wordCount == null ? (
                        isLoading(page) ? (
                          <LoadingValue label="Parsing" />
                        ) : (
                          <Dash />
                        )
                      ) : (
                        <span className={page.wordCount < THIN_WORD_LIMIT ? "text-warn" : undefined}>
                          {page.wordCount.toLocaleString()}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4">
                      {issueCount == null ? (
                        isLoading(page) ? (
                          <LoadingValue label="Scanning" />
                        ) : (
                          <Dash />
                        )
                      ) : issueCount === 0 ? (
                        <span className="text-good">0</span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-bad">
                          <CircleAlert className="size-3.5 shrink-0" aria-hidden />
                          {issueCount}
                        </span>
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
        <nav
          aria-label="Page table"
          className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline px-5 py-3"
        >
          <p className="font-mono text-[12px] text-muted-foreground">
            {from} to {to} of {filtered.length} pages
          </p>
          <div className="flex flex-wrap items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              className="h-11 w-fit"
              disabled={safeIndex === 0}
              onClick={() => setPageIndex((value) => Math.max(0, value - 1))}
            >
              <ChevronLeft className="size-4" aria-hidden />
              Previous
            </Button>
            {pageNumbers(safeIndex, pageCount).map((item, index) =>
              item === "…" ? (
                <span key={`e-${index}`} className="px-2 font-mono text-[12px] text-muted-foreground">
                  …
                </span>
              ) : (
                <button
                  key={item}
                  type="button"
                  aria-current={item === safeIndex + 1 ? "page" : undefined}
                  className={cn(
                    "inline-flex size-11 items-center justify-center rounded-md font-mono text-[12px]",
                    item === safeIndex + 1
                      ? "bg-primary text-primary-foreground"
                      : "text-body hover:bg-surface-card hover:text-ink",
                  )}
                  onClick={() => setPageIndex(item - 1)}
                >
                  {item}
                </button>
              ),
            )}
            <Button
              type="button"
              variant="ghost"
              className="h-11 w-fit"
              disabled={safeIndex >= pageCount - 1}
              onClick={() => setPageIndex((value) => Math.min(pageCount - 1, value + 1))}
            >
              Next
              <ChevronRight className="size-4" aria-hidden />
            </Button>
          </div>
        </nav>
      ) : null}
    </div>
  );
}

function pageNumbers(index: number, count: number): Array<number | "…"> {
  if (count <= 7) {
    return Array.from({ length: count }, (_, i) => i + 1);
  }
  const current = index + 1;
  const items = new Set([1, 2, current - 1, current, current + 1, count - 1, count]);
  const ordered = [...items].filter((n) => n >= 1 && n <= count).sort((a, b) => a - b);
  const result: Array<number | "…"> = [];
  for (const n of ordered) {
    const last = result[result.length - 1];
    if (typeof last === "number" && n - last > 1) {
      result.push("…");
    }
    result.push(n);
  }
  return result;
}

"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ExternalLink,
  ListFilter,
  LoaderCircle,
  Search,
} from "lucide-react";
import type { Page } from "@seo-maker/db";
import { TierBadge } from "@/components/ai/TierBadge";
import { ScoreRing } from "@/components/project/ScoreRing";
import { StatusBadge } from "@/components/project/StatusBadge";
import { Button } from "@/components/ui/button";
import { failedChecks, hasIssue, isCrawled, pageSeoScore, THIN_WORD_LIMIT } from "@/lib/page-audit";
import type { InventoryRow, TierScope, TieredPage } from "@/lib/site-inventory";
import { pagePath } from "@/lib/site-url";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 10;

type Tab = "all" | "issues" | "passed" | "excluded";

/**
 * One row: a page the latest crawl fetched, or a page the inventory knows
 * that no crawl has fetched yet (it has no results, and no detail screen).
 */
type Row =
  | { kind: "page"; key: string; page: TieredPage; path: string; tier: TieredPage["tier"]; inventoryKey: string | null }
  | { kind: "known"; key: string; known: InventoryRow; path: string; tier: InventoryRow["tier"]; inventoryKey: string };

const FILTERS: Array<{ id: TierScope; label: string }> = [
  { id: "general", label: "General" },
  { id: "priority", label: "Priority Pages" },
  { id: "standard", label: "Standard Pages" },
];

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
  uncrawled = [],
  projectId,
  pageSize = PAGE_SIZE,
}: {
  pages: TieredPage[];
  /** Inventory pages no crawl has fetched: listed so every known page is visible. */
  uncrawled?: InventoryRow[];
  projectId?: string;
  pageSize?: number;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("all");
  const [tierFilter, setTierFilter] = useState<TierScope>("general");
  const [query, setQuery] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const [changing, setChanging] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; upgrade: boolean } | null>(null);

  const rows = useMemo<Row[]>(
    () => [
      ...pages.map(
        (page): Row => ({
          kind: "page",
          key: page.id,
          page,
          path: pagePath(page.finalUrl ?? page.url),
          tier: page.tier,
          inventoryKey: page.inventoryKey,
        }),
      ),
      ...uncrawled.map(
        (known): Row => ({
          kind: "known",
          key: `known-${known.pageKey}`,
          known,
          path: known.path,
          tier: known.tier,
          inventoryKey: known.pageKey,
        }),
      ),
    ],
    [pages, uncrawled],
  );

  // The classification filter narrows everything below it, tab counts included.
  const scoped = useMemo(
    () => (tierFilter === "general" ? rows : rows.filter((row) => row.tier === tierFilter)),
    [rows, tierFilter],
  );

  const counts = useMemo(() => {
    const crawled = scoped.flatMap((row) => (row.kind === "page" ? [row.page] : []));
    return {
      all: scoped.length,
      issues: crawled.filter((page) => isCrawled(page) && hasIssue(page)).length,
      passed: crawled.filter((page) => page.status === "analyzed" && !hasIssue(page)).length,
      excluded: 0,
    };
  }, [scoped]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return scoped.filter((row) => {
      if (tab === "issues" && !(row.kind === "page" && isCrawled(row.page) && hasIssue(row.page))) return false;
      if (tab === "passed" && !(row.kind === "page" && row.page.status === "analyzed" && !hasIssue(row.page))) return false;
      if (tab === "excluded") return false;
      if (!needle) return true;
      const title = row.kind === "page" ? (row.page.title ?? "").toLowerCase() : "";
      return row.path.toLowerCase().includes(needle) || title.includes(needle);
    });
  }, [query, scoped, tab]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safeIndex = Math.min(pageIndex, pageCount - 1);
  const slice = filtered.slice(safeIndex * pageSize, safeIndex * pageSize + pageSize);
  const from = filtered.length === 0 ? 0 : safeIndex * pageSize + 1;
  const to = Math.min(filtered.length, (safeIndex + 1) * pageSize);

  function goTab(next: Tab) {
    setTab(next);
    setPageIndex(0);
  }

  async function changeTier(row: Row) {
    if (!projectId) return;
    const tier = row.tier === "priority" ? "standard" : "priority";
    setChanging(row.key);
    setNotice(null);
    const response = await fetch(`/api/projects/${projectId}/inventory`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pageKey: row.inventoryKey, tier }),
    }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as { error?: string; upgrade?: boolean } | null;
    setChanging(null);
    if (!response?.ok) {
      setNotice({ text: data?.error ?? "Could not change this page. Try again.", upgrade: Boolean(data?.upgrade) });
      return;
    }
    router.refresh();
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
          <TierFilterMenu
            value={tierFilter}
            onChange={(next) => {
              setTierFilter(next);
              setPageIndex(0);
            }}
          />
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

      {notice ? (
        <p role="alert" className="border-b border-hairline px-5 py-2.5 text-sm text-bad">
          {notice.text}
          {notice.upgrade ? (
            <>
              {" "}
              <Link href="/pricing" className="text-ink underline underline-offset-4 hover:text-primary">
                See plans
              </Link>
            </>
          ) : null}
        </p>
      ) : null}

      {filtered.length === 0 ? (
        <p className="px-5 py-8 text-sm leading-6 text-body">
          {rows.length === 0
            ? "No pages yet. Run a crawl to fill this table."
            : tab === "excluded"
              ? "No excluded pages. Every URL in the crawl is listed here."
              : scoped.length === 0
                ? `No ${tierFilter === "priority" ? "Priority" : "Standard"} pages.`
                : "No pages match this filter."}
        </p>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[1180px] border-collapse text-sm">
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
                <th scope="col" className="px-5 py-3.5 font-medium">
                  <span className="sr-only">Classification</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {slice.map((row) =>
                row.kind === "page" ? (
                  <CrawledRow
                    key={row.key}
                    row={row}
                    projectId={projectId}
                    busy={changing === row.key}
                    onChangeTier={() => void changeTier(row)}
                    onOpen={(href) => router.push(href)}
                  />
                ) : (
                  <KnownRow key={row.key} row={row} busy={changing === row.key} onChangeTier={() => void changeTier(row)} />
                ),
              )}
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

function CrawledRow({
  row,
  projectId,
  busy,
  onChangeTier,
  onOpen,
}: {
  row: Extract<Row, { kind: "page" }>;
  projectId?: string;
  busy: boolean;
  onChangeTier: () => void;
  onOpen: (href: string) => void;
}) {
  const { page, path } = row;
  const href = projectId ? `/projects/${projectId}/pages/${page.id}` : null;
  const live = page.finalUrl ?? page.url;
  const score = pageSeoScore(page);
  const issueCount = isCrawled(page) ? failedChecks(page).length : null;

  return (
    <tr
      className={cn(
        "border-t border-hairline transition-colors",
        isLoading(page) && "bg-surface-card/30",
        href &&
          "cursor-pointer hover:bg-surface-card/60 focus-visible:bg-surface-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
      )}
      role={href ? "link" : undefined}
      tabIndex={href ? 0 : undefined}
      aria-label={href ? `Open ${path}` : undefined}
      onClick={href ? () => onOpen(href) : undefined}
      onKeyDown={
        href
          ? (event) => {
              if (event.target !== event.currentTarget) return;
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onOpen(href);
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
        <span className="flex items-center gap-1.5">
          <StatusBadge status={page.status} />
          <TierBadge tier={row.tier} />
        </span>
      </td>
      <td className="whitespace-nowrap px-5 py-4">
        {score == null ? (
          isLoading(page) ? <LoadingValue label="Scoring" /> : <Dash />
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
          isLoading(page) ? <LoadingValue label="Parsing" /> : <Dash />
        ) : (
          <span className={page.wordCount < THIN_WORD_LIMIT ? "text-warn" : undefined}>
            {page.wordCount.toLocaleString()}
          </span>
        )}
      </td>
      <td className="whitespace-nowrap px-5 py-4">
        {issueCount == null ? (
          isLoading(page) ? <LoadingValue label="Scanning" /> : <Dash />
        ) : issueCount === 0 ? (
          <span className="text-good">0</span>
        ) : (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-bad">
            <CircleAlert className="size-3.5 shrink-0" aria-hidden />
            {issueCount}
          </span>
        )}
      </td>
      <td className="whitespace-nowrap px-5 py-4 text-right">
        {row.inventoryKey ? <TierAction tier={row.tier} path={path} busy={busy} onClick={onChangeTier} /> : null}
      </td>
    </tr>
  );
}

function KnownRow({
  row,
  busy,
  onChangeTier,
}: {
  row: Extract<Row, { kind: "known" }>;
  busy: boolean;
  onChangeTier: () => void;
}) {
  return (
    <tr className="border-t border-hairline">
      <td className="max-w-[220px] px-5 py-4 font-mono text-ink">
        <span className="flex items-center gap-2">
          <span className="min-w-0 truncate whitespace-nowrap" title={row.path}>
            {row.path}
          </span>
          <a
            href={row.known.url}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open live page ${row.path}`}
            className="shrink-0 text-muted-foreground hover:text-ink"
          >
            <ExternalLink className="size-3.5" />
          </a>
        </span>
      </td>
      <td className="whitespace-nowrap px-5 py-4">
        <span className="flex items-center gap-1.5">
          <StatusBadge status="not-crawled" />
          <TierBadge tier={row.tier} />
        </span>
      </td>
      <td className="px-5 py-4" colSpan={6}>
        <span className="text-xs text-muted-foreground">
          Known from discovery, not crawled yet. Choose it on Re-crawl Site to crawl it.
        </span>
      </td>
      <td className="whitespace-nowrap px-5 py-4 text-right">
        <TierAction tier={row.tier} path={row.path} busy={busy} onClick={onChangeTier} />
      </td>
    </tr>
  );
}

function TierAction({
  tier,
  path,
  busy,
  onClick,
}: {
  tier: "priority" | "standard";
  path: string;
  busy: boolean;
  onClick: () => void;
}) {
  const priority = tier === "priority";
  return (
    <button
      type="button"
      disabled={busy}
      aria-label={`${priority ? "Make Standard" : "Make Priority"}: ${path}`}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      onKeyDown={(event) => event.stopPropagation()}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-md px-3 font-mono text-[12px] ring-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
        priority ? "text-body ring-hairline hover:bg-surface-card hover:text-ink" : "text-primary ring-primary/30 hover:bg-primary/10",
      )}
    >
      {busy ? (
        <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
      ) : priority ? (
        <ArrowDownToLine className="size-3.5" aria-hidden />
      ) : (
        <ArrowUpToLine className="size-3.5" aria-hidden />
      )}
      {priority ? "Make Standard" : "Make Priority"}
    </button>
  );
}

/** The classification filter: General (every page), Priority Pages or Standard Pages. */
function TierFilterMenu({ value, onChange }: { value: TierScope; onChange: (value: TierScope) => void }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const wrapper = useRef<HTMLDivElement>(null);
  const active = FILTERS.find((filter) => filter.id === value) ?? FILTERS[0];

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapper} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "inline-flex h-11 items-center gap-2 rounded-md px-3 font-mono text-[12px] ring-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          value === "general" ? "text-muted-foreground ring-transparent hover:text-ink" : "bg-surface-card text-ink ring-hairline",
        )}
      >
        <ListFilter className="size-4" aria-hidden />
        {value === "general" ? "Filter" : active.label}
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Filter by classification"
          className="absolute right-0 top-12 z-20 flex w-52 flex-col rounded-lg bg-canvas p-1 shadow-lg ring-1 ring-hairline"
        >
          {FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              role="menuitemradio"
              aria-checked={value === filter.id}
              onClick={() => {
                onChange(filter.id);
                setOpen(false);
              }}
              className="flex h-10 items-center justify-between gap-2 rounded-md px-3 text-left text-sm text-body hover:bg-surface-soft hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {filter.label}
              {value === filter.id ? <Check className="size-4 text-primary" aria-hidden /> : null}
            </button>
          ))}
        </div>
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

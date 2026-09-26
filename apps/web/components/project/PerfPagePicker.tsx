"use client";

import { useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ListChecks, LoaderCircle, Play, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PerfPageView, PerfStrategy } from "@/lib/perf-view";
import { scoreBand, type Rating } from "@/lib/performance";
import { cn } from "@/lib/utils";

/**
 * Chooses which pages a PageSpeed run tests, before it starts.
 *
 * Each page costs about a minute (Lighthouse runs mobile, then desktop), so a
 * run over every page of a 100-page crawl is well over an hour, and it holds
 * the crawl queue while it runs. Pressing Run used to start straight away on
 * whatever was selected last time. Now it opens this: find pages by path or
 * title, narrow by type, section or last score, pick them one by one or all
 * at once, and see the count and the time before anything starts.
 */

type ResultStatus = "untested" | "slow" | "average" | "fast";
type StatusFilter = "all" | ResultStatus | "selected";

const MINUTES_PER_PAGE = 1;

const TYPE_LABELS: Record<string, string> = {
  homepage: "Homepage",
  product: "Product",
  service: "Service",
  pricing: "Pricing",
  article: "Article",
  documentation: "Docs",
  category: "Category",
  landing: "Landing",
  about: "About",
  contact: "Contact",
  legal: "Legal",
  utility: "Utility",
  other: "Other",
};

const scoreTone: Record<Rating, string> = {
  good: "bg-good/15 text-good",
  warn: "bg-warn/15 text-warn",
  bad: "bg-bad/15 text-bad",
  none: "bg-surface-card text-muted-foreground",
};

export function typeLabel(type: string | null) {
  return type ? (TYPE_LABELS[type] ?? type) : "Unknown";
}

/** "/payments/checkout" -> "/payments"; the homepage is its own section. */
function sectionOf(path: string) {
  const first = path.split("/").filter(Boolean)[0];
  return first ? `/${first}` : "/";
}

export function PerfPagePicker({
  projectId,
  pages,
  homepageId,
  maxPages,
  planLabel,
  strategy,
  scores,
  tested,
  suggestedIds,
  lastRunIds,
  initialSelected,
  active,
  hasResults,
}: {
  projectId: string;
  pages: PerfPageView[];
  homepageId: string | null;
  maxPages: number;
  planLabel: string;
  strategy: PerfStrategy;
  /** Latest performance score per page for `strategy`. */
  scores: Map<string, number | null>;
  /** Pages with any PageSpeed result. */
  tested: Set<string>;
  suggestedIds: string[];
  lastRunIds: string[];
  initialSelected: string[];
  active: boolean;
  hasResults: boolean;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const searchId = useId();

  // Only crawled HTML pages can be measured; failed fetches and files cannot.
  const candidates = useMemo(
    () => pages.filter((page) => page.crawled || page.id === homepageId),
    [homepageId, pages],
  );
  const known = useMemo(() => new Set(candidates.map((page) => page.id)), [candidates]);

  const [selected, setSelected] = useState<string[]>(() =>
    initialSelected.filter((id) => known.has(id)).slice(0, maxPages),
  );
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [section, setSection] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const statusById = useMemo(() => {
    const map = new Map<string, ResultStatus>();
    for (const page of candidates) {
      const score = scores.get(page.id);
      map.set(
        page.id,
        !tested.has(page.id) || score == null ? "untested" : score < 50 ? "slow" : score < 90 ? "average" : "fast",
      );
    }
    return map;
  }, [candidates, scores, tested]);

  const types = useMemo(() => countBy(candidates, (page) => page.pageType ?? ""), [candidates]);
  const sections = useMemo(() => countBy(candidates, (page) => sectionOf(page.path)), [candidates]);

  const statusCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = {
      all: candidates.length,
      untested: 0,
      slow: 0,
      average: 0,
      fast: 0,
      selected: selected.length,
    };
    for (const value of statusById.values()) counts[value] += 1;
    return counts;
  }, [candidates.length, selected.length, statusById]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return candidates.filter((page) => {
      if (needle && !page.path.toLowerCase().includes(needle) && !page.title.toLowerCase().includes(needle)) {
        return false;
      }
      if (type !== "all" && (page.pageType ?? "") !== type) return false;
      if (section !== "all" && sectionOf(page.path) !== section) return false;
      if (status === "selected") return selectedSet.has(page.id);
      if (status !== "all" && statusById.get(page.id) !== status) return false;
      return true;
    });
  }, [candidates, query, section, selectedSet, status, statusById, type]);

  const atCap = selected.length >= maxPages;
  const visibleUnselected = visible.filter((page) => !selectedSet.has(page.id));
  const allVisibleSelected = visible.length > 0 && visibleUnselected.length === 0;
  const room = Math.max(0, maxPages - selected.length);
  const filtered = query.trim() !== "" || type !== "all" || section !== "all" || status !== "all";
  const everything = visible.length === candidates.length;
  const selectLabel = allVisibleSelected
    ? everything
      ? "Unselect all"
      : visible.length === 1
        ? "Unselect this page"
        : `Unselect these ${visible.length}`
    : room === 0
      ? `Limit of ${maxPages} reached`
      : visibleUnselected.length > room
        ? `Select ${room} more (limit ${maxPages})`
        : everything
          ? `Select all ${visible.length}`
          : visible.length === 1
            ? "Select this page"
            : `Select the ${visible.length} shown`;

  function open() {
    setError("");
    dialogRef.current?.showModal();
  }

  function close() {
    if (!pending) dialogRef.current?.close();
  }

  function toggle(id: string) {
    setSelected((current) => {
      if (current.includes(id)) return current.filter((value) => value !== id);
      if (current.length >= maxPages) return current;
      return [...current, id];
    });
  }

  function toggleVisible() {
    if (allVisibleSelected) {
      const hide = new Set(visible.map((page) => page.id));
      setSelected((current) => current.filter((id) => !hide.has(id)));
      return;
    }
    const add = visibleUnselected.slice(0, room).map((page) => page.id);
    setSelected((current) => [...current, ...add]);
  }

  function choose(ids: string[]) {
    setSelected([...new Set(ids.filter((id) => known.has(id)))].slice(0, maxPages));
    setStatus("all");
  }

  function resetFilters() {
    setQuery("");
    setType("all");
    setSection("all");
    setStatus("all");
  }

  async function start() {
    if (selected.length === 0) return;
    setPending(true);
    setError("");
    const response = await fetch(`/api/projects/${projectId}/performance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageIds: selected }),
    }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as { error?: string } | null;
    setPending(false);
    if (!response?.ok) {
      setError(data?.error ?? "Could not start PageSpeed.");
      return;
    }
    dialogRef.current?.close();
    window.dispatchEvent(new Event("seo-maker:perf-queued"));
    router.refresh();
  }

  const minutes = selected.length * MINUTES_PER_PAGE;
  const showLastRun = lastRunIds.length > 0 && !sameSet(lastRunIds, selected);
  const showSuggested = suggestedIds.length > 1 && !sameSet(suggestedIds, selected);

  return (
    <>
      <Button
        type="button"
        variant={hasResults ? "outline" : "default"}
        className="h-11 w-fit"
        disabled={active}
        aria-busy={active}
        onClick={open}
      >
        {active ? (
          <LoaderCircle className="animate-spin" aria-hidden />
        ) : (
          <ListChecks aria-hidden />
        )}
        {active ? "Running PageSpeed" : "Choose pages to test"}
      </Button>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onCancel={(event) => {
          if (pending) event.preventDefault();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
        className="m-auto max-h-[min(760px,calc(100dvh-32px))] w-[min(780px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl bg-canvas p-0 text-ink ring-1 ring-hairline backdrop:bg-black/70 backdrop:backdrop-blur-sm open:flex"
      >
          <header className="flex items-start justify-between gap-4 border-b border-hairline px-5 pt-5 pb-4 sm:px-6">
            <div className="flex min-w-0 flex-col gap-1">
              <h2 id={titleId} className="font-display text-[20px] leading-6 tracking-[-0.3px] text-ink">
                Choose pages to test
              </h2>
              <p className="text-sm leading-6 text-body">
                Each page runs on mobile, then desktop: about a minute per page. {planLabel} tests up to{" "}
                {maxPages} {maxPages === 1 ? "page" : "pages"} per run. Scores are the last {strategy} result.
              </p>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-surface-soft hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-4" aria-hidden />
            </button>
          </header>

          <div className="flex flex-col gap-3 border-b border-hairline px-5 py-4 sm:px-6">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
              <label htmlFor={searchId} className="relative col-span-2 sm:col-span-1">
                <span className="sr-only">Search pages by path or title</span>
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-soft"
                  aria-hidden
                />
                <input
                  id={searchId}
                  type="search"
                  autoFocus
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search by path or title"
                  className="h-11 w-full rounded-md bg-surface-soft pl-9 pr-3 text-sm text-ink ring-1 ring-hairline placeholder:text-muted-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>
              <FilterSelect label="Page type" value={type} onChange={setType}>
                <option value="all">All types</option>
                {types.map(([value, count]) => (
                  <option key={value || "unknown"} value={value}>
                    {typeLabel(value || null)} ({count})
                  </option>
                ))}
              </FilterSelect>
              <FilterSelect label="Section" value={section} onChange={setSection}>
                <option value="all">All sections</option>
                {sections.map(([value, count]) => (
                  <option key={value} value={value}>
                    {value} ({count})
                  </option>
                ))}
              </FilterSelect>
            </div>

            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5" role="group" aria-label="Filter by last result">
              {(
                [
                  ["all", "All"],
                  ["untested", "Not tested"],
                  ["slow", "Slow"],
                  ["average", "Needs work"],
                  ["fast", "Fast"],
                  ["selected", "Selected"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={status === key}
                  onClick={() => setStatus(key)}
                  className={cn(
                    "inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[12px] font-medium ring-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    status === key
                      ? "bg-surface-card text-ink ring-hairline"
                      : "text-muted-foreground ring-transparent hover:text-ink",
                  )}
                >
                  {key === "slow" || key === "average" || key === "fast" ? (
                    <span
                      aria-hidden
                      className={cn(
                        "size-1.5 rounded-full",
                        key === "slow" ? "bg-bad" : key === "average" ? "bg-warn" : "bg-good",
                      )}
                    />
                  ) : null}
                  {label}
                  <span className="font-mono tabular-nums text-muted-soft">{statusCounts[key]}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-2.5 sm:px-6">
            <label className="flex min-h-9 cursor-pointer items-center gap-2.5 text-sm text-ink">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={allVisibleSelected}
                disabled={visible.length === 0 || (!allVisibleSelected && room === 0)}
                onChange={toggleVisible}
              />
              {selectLabel}
            </label>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[12px]">
              {homepageId ? <QuickPick onClick={() => choose([homepageId])}>Homepage only</QuickPick> : null}
              {showSuggested ? <QuickPick onClick={() => choose(suggestedIds)}>Suggested</QuickPick> : null}
              {showLastRun ? <QuickPick onClick={() => choose(lastRunIds)}>Last run</QuickPick> : null}
              {selected.length > 0 ? <QuickPick onClick={() => setSelected([])}>Clear</QuickPick> : null}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto border-t border-hairline">
            {visible.length === 0 ? (
              <div className="flex min-h-40 flex-col items-center justify-center gap-2 px-6 text-center">
                <p className="text-sm text-ink">No pages match.</p>
                {filtered ? (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="cursor-pointer font-mono text-[12px] text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Clear filters
                  </button>
                ) : null}
              </div>
            ) : (
              <ul aria-label="Pages" className="divide-y divide-hairline">
                {visible.map((page) => {
                  const checked = selectedSet.has(page.id);
                  const blocked = !checked && atCap;
                  const score = scores.get(page.id) ?? null;
                  const band = scoreBand(score);
                  return (
                    <li key={page.id}>
                      <label
                        className={cn(
                          "grid min-h-14 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-5 py-2.5 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:px-6",
                          blocked ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-surface-soft",
                          checked && "bg-primary/5",
                        )}
                      >
                        <input
                          type="checkbox"
                          className="size-4 accent-primary"
                          checked={checked}
                          disabled={blocked}
                          onChange={() => toggle(page.id)}
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-mono text-[13px] text-ink" title={page.path}>
                            {page.path}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {page.title || "No title"}
                          </span>
                        </span>
                        <span className="hidden rounded-full bg-surface-card px-2 py-0.5 font-mono text-[11px] text-body sm:inline">
                          {page.id === homepageId ? "Homepage" : typeLabel(page.pageType)}
                        </span>
                        <span
                          className={cn(
                            "inline-flex min-w-[42px] items-center justify-center gap-1 rounded-full px-2 py-0.5 font-mono text-[11px] tabular-nums",
                            scoreTone[band.rating],
                          )}
                          title={score == null ? "Not tested yet" : `Last ${strategy} score`}
                        >
                          {score == null ? "New" : score}
                          <span className="sr-only">{score == null ? " (not tested yet)" : ` (last ${strategy} score)`}</span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <footer className="flex flex-col gap-3 border-t border-hairline px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="text-sm text-ink" aria-live="polite">
                <span className="font-mono tabular-nums">{selected.length}</span>{" "}
                {selected.length === 1 ? "page" : "pages"} selected
                <span className="text-muted-foreground">
                  {" "}
                  · {selected.length === 0 ? "nothing to run" : `about ${minutes} ${minutes === 1 ? "minute" : "minutes"}`}
                </span>
              </p>
              {atCap ? (
                <p className="text-xs text-warn">
                  That is the {planLabel} limit of {maxPages} pages per run.
                </p>
              ) : minutes > 20 ? (
                <p className="text-xs text-muted-foreground">You can stop the run at any time; pages already measured are kept.</p>
              ) : null}
              {error ? (
                <p role="alert" className="text-sm text-bad">
                  {error}
                </p>
              ) : null}
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="outline" className="h-11" onClick={close} disabled={pending}>
                Cancel
              </Button>
              <Button
                type="button"
                className="h-11"
                onClick={start}
                disabled={pending || selected.length === 0}
                aria-busy={pending}
              >
                {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Play className="fill-current" aria-hidden />}
                {pending
                  ? "Starting"
                  : selected.length === 0
                    ? "Select pages to test"
                    : `Test ${selected.length} ${selected.length === 1 ? "page" : "pages"}`}
              </Button>
            </div>
          </footer>
      </dialog>
    </>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="min-w-0">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full min-w-0 cursor-pointer rounded-md bg-surface-soft px-3 text-sm text-ink ring-1 ring-hairline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-40"
      >
        {children}
      </select>
    </label>
  );
}

export function QuickPick({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-9 cursor-pointer text-body underline-offset-4 hover:text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </button>
  );
}

function countBy<T>(items: T[], key: (item: T) => string): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function sameSet(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

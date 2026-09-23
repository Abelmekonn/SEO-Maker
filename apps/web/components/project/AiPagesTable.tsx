"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, CircleAlert, Search, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Every page with something to fix, and what the AI has done for it.
 *
 * One row per page: its problems, whether the AI has explained them, how many
 * fixes are ready to copy, and when it last ran. Worst pages first, because on
 * a tier that manages about a page a minute the order is the plan.
 */

export type AiPageRow = {
  id: string;
  path: string;
  pageType: string | null;
  searchIntent: string | null;
  issues: number;
  worst: "critical" | "high" | "medium" | "low";
  state: "ready" | "failed" | "none";
  fixes: number;
  failure: string | null;
  lastRun: string | null;
};

type Tab = "all" | "todo" | "ready" | "failed";
const PAGE_SIZE = 10;

const WORST: Record<AiPageRow["worst"], string> = {
  critical: "bg-bad",
  high: "bg-bad/70",
  medium: "bg-warn",
  low: "bg-muted-foreground/60",
};

export function AiPagesTable({ projectId, rows }: { projectId: string; rows: AiPageRow[] }) {
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);

  const counts = {
    all: rows.length,
    todo: rows.filter((row) => row.state === "none").length,
    ready: rows.filter((row) => row.state === "ready").length,
    failed: rows.filter((row) => row.state === "failed").length,
  };

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (tab === "todo" && row.state !== "none") return false;
      if (tab === "ready" && row.state !== "ready") return false;
      if (tab === "failed" && row.state !== "failed") return false;
      return !needle || row.path.toLowerCase().includes(needle) || (row.pageType ?? "").includes(needle);
    });
  }, [query, rows, tab]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const slice = filtered.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "all", label: "All" },
    { id: "todo", label: "To analyse" },
    { id: "ready", label: "Ready" },
    { id: "failed", label: "Needs a rerun" },
  ];

  return (
    <section aria-label="Pages" className="flex min-w-0 flex-col overflow-hidden rounded-xl bg-surface-soft ring-1 ring-hairline">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-4 py-3">
        <div role="tablist" aria-label="Filter pages" className="flex flex-wrap gap-1">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => {
                setTab(item.id);
                setPage(0);
              }}
              className={cn(
                "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md px-3 font-mono text-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                tab === item.id ? "bg-surface-card text-ink" : "text-muted-foreground hover:text-ink",
              )}
            >
              {item.label}
              <span className="tabular-nums text-muted-foreground">{counts[item.id]}</span>
            </button>
          ))}
        </div>
        <label className="relative w-full sm:w-56">
          <span className="sr-only">Search pages</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(0);
            }}
            placeholder="Search path or type"
            className="h-9 w-full rounded-md border border-hairline bg-canvas pr-3 pl-8 text-sm text-ink placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
      </div>

      {slice.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-body">
          {tab === "todo"
            ? "Every page with issues has been analysed."
            : tab === "failed"
              ? "No runs need repeating."
              : "No pages match."}
        </p>
      ) : (
        <ul className="divide-y divide-hairline">
          {slice.map((row) => (
            <li key={row.id}>
              <Link
                href={`/projects/${projectId}/pages/${row.id}`}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3 hover:bg-surface-card/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:grid-cols-[minmax(0,1fr)_110px_176px_76px]"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="truncate font-mono text-[13px] text-ink" title={row.path}>
                    {row.path}
                  </p>
                  <p className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                    <span>{row.pageType ?? "unclassified"}</span>
                    {row.searchIntent ? <span>· {row.searchIntent}</span> : null}
                  </p>
                </div>

                <p className="hidden items-center gap-2 font-mono text-[12px] tabular-nums text-body sm:flex">
                  <span aria-hidden className={cn("size-2 rounded-full", WORST[row.worst])} />
                  {row.issues} {row.issues === 1 ? "issue" : "issues"}
                  <span className="sr-only">, worst {row.worst}</span>
                </p>

                <State row={row} />

                <p className="hidden text-right font-mono text-[11px] text-muted-foreground sm:block">{row.lastRun ?? "—"}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 ? (
        <div className="flex items-center justify-between gap-3 border-t border-hairline px-4 py-2.5">
          <p className="font-mono text-[12px] text-muted-foreground">
            {current * PAGE_SIZE + 1}–{Math.min(filtered.length, (current + 1) * PAGE_SIZE)} of {filtered.length}
          </p>
          <div className="flex gap-1">
            <PageButton label="Previous page" disabled={current === 0} onClick={() => setPage(current - 1)}>
              <ChevronLeft className="size-4" aria-hidden />
            </PageButton>
            <PageButton label="Next page" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
              <ChevronRight className="size-4" aria-hidden />
            </PageButton>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function State({ row }: { row: AiPageRow }) {
  if (row.state === "ready") {
    return (
      <span className="inline-flex w-fit items-center gap-1.5 whitespace-nowrap justify-self-end rounded-full bg-good/10 px-2.5 py-1 font-mono text-[11px] text-good sm:justify-self-start">
        <Sparkles className="size-3" aria-hidden />
        Explained{row.fixes ? ` · ${row.fixes} ${row.fixes === 1 ? "fix" : "fixes"}` : ""}
      </span>
    );
  }
  if (row.state === "failed") {
    return (
      <span
        title={row.failure ?? undefined}
        className="inline-flex w-fit items-center gap-1.5 whitespace-nowrap justify-self-end rounded-full bg-bad/10 px-2.5 py-1 font-mono text-[11px] text-bad sm:justify-self-start"
      >
        <CircleAlert className="size-3" aria-hidden />
        Needs a rerun
      </span>
    );
  }
  return (
    <span className="w-fit whitespace-nowrap justify-self-end rounded-full bg-surface-card px-2.5 py-1 font-mono text-[11px] text-muted-foreground sm:justify-self-start">
      Not analysed
    </span>
  );
}

function PageButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-9 cursor-pointer items-center justify-center rounded-md text-body ring-1 ring-hairline hover:bg-surface-card hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

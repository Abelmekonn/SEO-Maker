"use client";

import { useId, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDownToLine, ArrowUpToLine, LoaderCircle, Search } from "lucide-react";
import { typeLabel } from "@/components/project/PerfPagePicker";
import type { InventoryRow } from "@/lib/site-inventory";
import { cn } from "@/lib/utils";

/**
 * The site's page inventory, split into Priority and Standard pages.
 *
 * Each page can be moved between tiers ("Make Priority", "Make Standard").
 * That changes its classification and nothing else: no page is discovered,
 * re-classified or crawled until the user starts a crawl. With `selection`,
 * pages can also be ticked for a crawl, as on the re-crawl screen.
 */

export type { InventoryRow };

export type Selection = {
  selected: Set<string>;
  toggle: (pageKey: string) => void;
  setMany: (pageKeys: string[], on: boolean) => void;
};

const LEVEL_LABEL: Record<string, string> = { high: "High", medium: "Medium", low: "Low", utility: "Utility" };

const shortDate = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });

/** Rows shown per tier before "Show more". Search reaches the rest. */
const PAGE = 40;

export function PageInventoryList({
  projectId,
  rows,
  onRowsChange,
  priorityLimit,
  planLabel,
  selection,
}: {
  projectId: string;
  rows: InventoryRow[];
  onRowsChange: (rows: InventoryRow[]) => void;
  priorityLimit: number;
  planLabel: string;
  selection?: Selection;
}) {
  const searchId = useId();
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [problem, setProblem] = useState<{ pageKey: string; text: string; upgrade: boolean } | null>(null);

  const needle = query.trim().toLowerCase();
  const matches = useMemo(
    () => (needle ? rows.filter((row) => row.path.toLowerCase().includes(needle)) : rows),
    [needle, rows],
  );
  const priority = matches.filter((row) => row.tier === "priority");
  const standard = matches.filter((row) => row.tier === "standard");
  const priorityCount = rows.filter((row) => row.tier === "priority").length;

  async function changeTier(row: InventoryRow, tier: InventoryRow["tier"]) {
    setPending(row.pageKey);
    setProblem(null);
    const response = await fetch(`/api/projects/${projectId}/inventory`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pageKey: row.pageKey, tier }),
    }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as { error?: string; upgrade?: boolean } | null;
    setPending(null);
    if (!response?.ok) {
      setProblem({
        pageKey: row.pageKey,
        text: data?.error ?? "Could not change this page. Try again.",
        upgrade: Boolean(data?.upgrade),
      });
      return;
    }
    onRowsChange(rows.map((entry) => (entry.pageKey === row.pageKey ? { ...entry, tier, tierSource: "user" } : entry)));
  }

  const section = (tier: InventoryRow["tier"], list: InventoryRow[]) => (
    <TierSection
      key={tier}
      tier={tier}
      list={list}
      total={tier === "priority" ? priorityCount : rows.length - priorityCount}
      priorityLimit={priorityLimit}
      planLabel={planLabel}
      selection={selection}
      pending={pending}
      problem={problem}
      atCap={priorityCount >= priorityLimit}
      onChangeTier={changeTier}
    />
  );

  return (
    <div className="flex flex-col gap-4">
      <label htmlFor={searchId} className="relative block">
        <span className="sr-only">Search pages by path</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          id={searchId}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search pages by path"
          className="h-11 w-full rounded-md border border-hairline bg-canvas pl-9 pr-3 text-sm text-ink outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>
      {section("priority", priority)}
      {section("standard", standard)}
    </div>
  );
}

function TierSection({
  tier,
  list,
  total,
  priorityLimit,
  planLabel,
  selection,
  pending,
  problem,
  atCap,
  onChangeTier,
}: {
  tier: InventoryRow["tier"];
  list: InventoryRow[];
  total: number;
  priorityLimit: number;
  planLabel: string;
  selection?: Selection;
  pending: string | null;
  problem: { pageKey: string; text: string; upgrade: boolean } | null;
  atCap: boolean;
  onChangeTier: (row: InventoryRow, tier: InventoryRow["tier"]) => void;
}) {
  const [visible, setVisible] = useState(PAGE);
  const headingId = useId();
  const priority = tier === "priority";
  const keys = list.map((row) => row.pageKey);
  const selectedHere = selection ? keys.filter((key) => selection.selected.has(key)).length : 0;

  return (
    <section aria-labelledby={headingId} className="overflow-hidden rounded-xl bg-surface-soft ring-1 ring-hairline">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-5 py-3.5">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id={headingId} className="flex items-center gap-2 font-display text-[17px] leading-6 tracking-[-0.2px] text-ink">
            <span aria-hidden className={cn("size-2 rounded-full", priority ? "bg-primary" : "bg-muted-foreground/60")} />
            {priority ? "Priority pages" : "Standard pages"}
            <span className="font-mono text-[12px] tabular-nums text-muted-foreground">{total}</span>
          </h2>
          <p className="text-xs leading-5 text-body">
            {priority
              ? `Full crawl: text, headings, links, images and structured data. ${planLabel} includes up to ${priorityLimit}.`
              : atCap
                ? `Crawled only when you choose them. All ${priorityLimit} Priority slots are in use: make a page Standard to free one.`
                : "Crawled only when you choose them. Make one Priority to include it in every Priority crawl."}
          </p>
        </div>
        {selection && list.length > 0 ? (
          <div className="flex items-center gap-1 font-mono text-[12px]">
            <span className="px-1 tabular-nums text-muted-foreground" aria-live="polite">
              {selectedHere} selected
            </span>
            <button
              type="button"
              onClick={() => selection.setMany(keys, true)}
              className="inline-flex h-9 items-center rounded-md px-2.5 text-body hover:bg-surface-card hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Select all
            </button>
            <button
              type="button"
              onClick={() => selection.setMany(keys, false)}
              className="inline-flex h-9 items-center rounded-md px-2.5 text-body hover:bg-surface-card hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Clear
            </button>
          </div>
        ) : null}
      </header>

      {list.length === 0 ? (
        <p className="px-5 py-6 text-sm leading-6 text-body">
          {total === 0
            ? priority
              ? "No Priority pages. Make a Standard page Priority to crawl it in full."
              : "Every page is Priority."
            : "No pages match your search."}
        </p>
      ) : (
        <ul className="divide-y divide-hairline">
          {list.slice(0, visible).map((row) => (
            <InventoryItem
              key={row.pageKey}
              row={row}
              selection={selection}
              busy={pending === row.pageKey}
              problem={problem?.pageKey === row.pageKey ? problem : null}
              promoteBlocked={!priority && atCap}
              onChangeTier={onChangeTier}
            />
          ))}
        </ul>
      )}
      {list.length > visible ? (
        <div className="border-t border-hairline px-5 py-2">
          <button
            type="button"
            onClick={() => setVisible((count) => count + PAGE)}
            className="inline-flex h-9 items-center font-mono text-[12px] text-body hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Show {Math.min(PAGE, list.length - visible)} more of {list.length - visible}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function InventoryItem({
  row,
  selection,
  busy,
  problem,
  promoteBlocked,
  onChangeTier,
}: {
  row: InventoryRow;
  selection?: Selection;
  busy: boolean;
  problem: { text: string; upgrade: boolean } | null;
  promoteBlocked: boolean;
  onChangeTier: (row: InventoryRow, tier: InventoryRow["tier"]) => void;
}) {
  const checkboxId = useId();
  const priority = row.tier === "priority";
  const type = row.homepage ? "Homepage" : typeLabel(row.pageType);
  const crawled = row.lastCrawledAt ? `Crawled ${shortDate.format(new Date(row.lastCrawledAt))}` : "Not crawled yet";
  const checked = selection?.selected.has(row.pageKey) ?? false;

  return (
    <li className={cn("flex flex-col gap-1.5 px-5 py-2.5", checked && "bg-primary/5")}>
      <div className="grid min-h-11 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {selection ? (
            <input
              id={checkboxId}
              type="checkbox"
              className="size-4 shrink-0 accent-primary"
              checked={checked}
              onChange={() => selection.toggle(row.pageKey)}
            />
          ) : null}
          <label htmlFor={selection ? checkboxId : undefined} className={cn("min-w-0", selection && "cursor-pointer")}>
            <span className="block truncate font-mono text-[13px] text-ink" title={row.url}>
              {row.path}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {type}
              {LEVEL_LABEL[row.level] ? ` · ${LEVEL_LABEL[row.level]} importance` : ""}
              {row.tierSource === "user" ? " · set by you" : ""}
              {" · "}
              <span className={row.lastCrawledAt ? undefined : "text-warn"}>{crawled}</span>
            </span>
          </label>
        </div>
        <button
          type="button"
          disabled={busy}
          title={!priority && promoteBlocked ? "Your plan's Priority pages are in use. Make one Standard first." : undefined}
          aria-label={`${priority ? "Make Standard" : "Make Priority"}: ${row.path}`}
          onClick={() => onChangeTier(row, priority ? "standard" : "priority")}
          className={cn(
            "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-3 font-mono text-[12px] ring-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
            priority
              ? "text-body ring-hairline hover:bg-surface-card hover:text-ink"
              : "text-primary ring-primary/30 hover:bg-primary/10",
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
      </div>
      {problem ? (
        <p role="alert" className="text-xs leading-5 text-bad">
          {problem.text}
          {problem.upgrade ? (
            <>
              {" "}
              <Link href="/pricing" className="text-ink underline underline-offset-4 hover:text-primary">
                See plans
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
    </li>
  );
}

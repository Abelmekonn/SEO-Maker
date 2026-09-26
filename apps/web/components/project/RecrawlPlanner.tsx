"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { CRAWL_QUEUED_EVENT } from "@/components/project/CrawlMiniStatus";
import { PageInventoryList, type Selection } from "@/components/project/PageInventoryList";
import { Button } from "@/components/ui/button";
import type { InventoryRow } from "@/lib/site-inventory";
import { cn } from "@/lib/utils";

/**
 * The re-crawl screen's choice of pages.
 *
 * Every known page, Priority and Standard apart. Priority pages are ticked to
 * start with; any page can be ticked or unticked, and moved between tiers.
 * The crawl fetches exactly the ticked pages, each at its tier. Nothing is
 * re-classified, and pages left unticked keep their last results.
 */
export function RecrawlPlanner({
  projectId,
  rows: initialRows,
  priorityLimit,
  planLabel,
  maxPages,
  crawlsLeft,
  held = [],
  heldCount = 0,
}: {
  projectId: string;
  rows: InventoryRow[];
  priorityLimit: number;
  planLabel: string;
  /** Pages the plan crawls, and the most crawled pages a site holds. */
  maxPages: number;
  /** Crawls of this site left on the plan. Null: unlimited. */
  crawlsLeft: number | null;
  /** Page keys of the pages the results hold now. */
  held?: string[];
  /** How many pages the results hold now. */
  heldCount?: number;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [selected, setSelected] = useState(
    () => new Set(initialRows.filter((row) => row.tier === "priority").map((row) => row.pageKey)),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ text: string; upgrade: boolean } | null>(null);

  const selection = useMemo<Selection>(
    () => ({
      selected,
      toggle: (pageKey) =>
        setSelected((current) => {
          const next = new Set(current);
          if (next.has(pageKey)) next.delete(pageKey);
          else next.add(pageKey);
          return next;
        }),
      setMany: (pageKeys, on) =>
        setSelected((current) => {
          const next = new Set(current);
          for (const key of pageKeys) {
            if (on) next.add(key);
            else next.delete(key);
          }
          return next;
        }),
    }),
    [selected],
  );

  const chosen = rows.filter((row) => selected.has(row.pageKey));
  const chosenPriority = chosen.filter((row) => row.tier === "priority").length;
  const overLimit = chosen.length > maxPages;
  // A site holds at most `maxPages` crawled pages. Pages not chosen keep
  // their results while there is room; the rest leave the results (Standard
  // and oldest first) and stay in the inventory.
  const heldSet = useMemo(() => new Set(held), [held]);
  const kept = heldCount - chosen.filter((row) => heldSet.has(row.pageKey)).length;
  const leaving = Math.max(0, kept - Math.max(0, maxPages - chosen.length));

  async function start() {
    setPending(true);
    setError(null);
    const response = await fetch(`/api/projects/${projectId}/crawl`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pages: chosen.map((row) => row.pageKey), scope: "recrawl" }),
    }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as { error?: string; upgrade?: boolean } | null;
    if (!response?.ok) {
      setPending(false);
      setError({ text: data?.error ?? "Could not start the crawl. Try again.", upgrade: Boolean(data?.upgrade) });
      return;
    }
    window.dispatchEvent(new Event(CRAWL_QUEUED_EVENT));
    router.push(`/projects/${projectId}`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <PageInventoryList
        projectId={projectId}
        rows={rows}
        onRowsChange={setRows}
        priorityLimit={priorityLimit}
        planLabel={planLabel}
        selection={selection}
      />

      <div className="sticky bottom-0 z-10 -mx-1 flex flex-col gap-3 rounded-xl bg-canvas/95 p-4 ring-1 ring-hairline backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-sm text-ink" aria-live="polite">
            <span className="font-mono tabular-nums">{chosen.length}</span> {chosen.length === 1 ? "page" : "pages"} selected
            <span className="text-muted-foreground">
              {" "}
              · {chosenPriority} Priority, {chosen.length - chosenPriority} Standard
            </span>
          </p>
          <p className={cn("text-xs leading-5", overLimit ? "text-warn" : "text-muted-foreground")}>
            {overLimit
              ? `${planLabel} crawls up to ${maxPages} ${maxPages === 1 ? "page" : "pages"} at a time. Untick ${chosen.length - maxPages} to continue.`
              : crawlsLeft != null
                ? crawlsLeft === 0
                  ? "You have used this site's crawls on your plan."
                  : `${crawlsLeft} ${crawlsLeft === 1 ? "crawl" : "crawls"} of this site left on ${planLabel}.`
                : "Pages you do not select keep their last results."}
          </p>
          {!overLimit && leaving > 0 ? (
            <p className="text-xs leading-5 text-warn">
              {planLabel} keeps up to {maxPages} crawled pages, so {leaving} earlier{" "}
              {leaving === 1 ? "page leaves" : "pages leave"} your results, Standard pages first. They stay in your page
              inventory.
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-bad">
              {error.text}
              {error.upgrade ? (
                <>
                  {" "}
                  <Link href="/pricing" className="text-ink underline underline-offset-4 hover:text-primary">
                    See plans
                  </Link>
                </>
              ) : null}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button asChild variant="outline" className="h-11">
            <Link href={`/projects/${projectId}`}>Cancel</Link>
          </Button>
          <Button
            type="button"
            className="h-11"
            onClick={start}
            disabled={pending || chosen.length === 0 || overLimit || crawlsLeft === 0}
            aria-busy={pending}
          >
            {pending ? (
              <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />
            ) : (
              <RefreshCw aria-hidden />
            )}
            {pending ? "Starting" : `Re-crawl ${chosen.length} ${chosen.length === 1 ? "page" : "pages"}`}
          </Button>
        </div>
      </div>
    </div>
  );
}

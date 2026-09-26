"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleAlert, LoaderCircle, Play } from "lucide-react";
import { CRAWL_QUEUED_EVENT } from "@/components/project/CrawlMiniStatus";
import { PageInventoryList } from "@/components/project/PageInventoryList";
import { Button } from "@/components/ui/button";
import type { DiscoverySummary, InventoryRow } from "@/lib/site-inventory";

/**
 * A new site after discovery, before its first crawl.
 *
 * Shows how the pages were classified, lets the user move pages between
 * Priority and Standard, and starts the crawl of the Priority pages only.
 * Standard pages stay in the inventory, uncrawled, until the user chooses
 * them on the re-crawl screen.
 */
export function CrawlStartPanel({
  projectId,
  hostname,
  rows: initialRows,
  priorityLimit,
  planLabel,
  summary,
  crawlsLeft,
  notice,
}: {
  projectId: string;
  hostname: string;
  rows: InventoryRow[];
  priorityLimit: number;
  planLabel: string;
  summary: DiscoverySummary | null;
  /** Crawls of this site left on the plan. Null: unlimited. */
  crawlsLeft: number | null;
  /** Why an earlier start did not produce results, when one did not. */
  notice?: string | null;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ text: string; upgrade: boolean } | null>(null);

  const priority = rows.filter((row) => row.tier === "priority").length;
  const standard = rows.length - priority;
  const blocked = summary?.counts.blocked_by_robots ?? 0;

  async function start() {
    setPending(true);
    setError(null);
    const response = await fetch(`/api/projects/${projectId}/crawl`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as { error?: string; upgrade?: boolean } | null;
    if (!response?.ok) {
      setPending(false);
      setError({ text: data?.error ?? "Could not start the crawl. Try again.", upgrade: Boolean(data?.upgrade) });
      return;
    }
    // The overview re-renders as the crawl's progress view; every other
    // screen's mini status starts tracking it straight away.
    window.dispatchEvent(new Event(CRAWL_QUEUED_EVENT));
    router.refresh();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <section aria-labelledby="start-title" className="relative overflow-hidden rounded-2xl bg-surface-soft ring-1 ring-hairline">
        <div aria-hidden className="pointer-events-none absolute -top-44 -right-24 size-[520px] rounded-full bg-primary/10 blur-3xl" />
        <div className="relative flex flex-col gap-6 p-6 sm:p-8">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-canvas ring-1 ring-hairline">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`}
                alt=""
                width={24}
                height={24}
                className="size-6"
              />
            </span>
            <div className="flex min-w-0 flex-col">
              <p className="font-mono text-[12px] text-primary">Step 2 of 2 · Crawl</p>
              <p className="truncate font-mono text-sm text-body">{hostname}</p>
            </div>
          </div>

          <div className="flex max-w-2xl flex-col gap-2">
            <h1 id="start-title" className="font-display text-[28px] leading-tight tracking-[-0.6px] text-ink">
              {rows.length} {rows.length === 1 ? "page" : "pages"} found on {hostname}
            </h1>
            <p className="text-sm leading-6 text-body">
              Only Priority pages are crawled now. Standard pages stay in your page inventory, and you can crawl them any
              time from Re-crawl Site.
            </p>
          </div>

          <dl className="grid max-w-xl grid-cols-2 overflow-hidden rounded-xl bg-canvas ring-1 ring-hairline">
            <div className="flex flex-col gap-1 px-5 py-4">
              <dt className="flex items-center gap-2 font-mono text-[12px] text-muted-foreground">
                <span aria-hidden className="size-2 rounded-full bg-primary" />
                Priority Pages
              </dt>
              <dd className="font-display text-[40px] leading-none tracking-[-1px] tabular-nums text-ink">{priority}</dd>
              <dd className="text-xs leading-5 text-body">Crawled when you start</dd>
            </div>
            <div className="flex flex-col gap-1 border-l border-hairline px-5 py-4">
              <dt className="flex items-center gap-2 font-mono text-[12px] text-muted-foreground">
                <span aria-hidden className="size-2 rounded-full bg-muted-foreground/60" />
                Standard Pages
              </dt>
              <dd className="font-display text-[40px] leading-none tracking-[-1px] tabular-nums text-ink">{standard}</dd>
              <dd className="text-xs leading-5 text-body">Not crawled yet</dd>
            </div>
          </dl>

          <div className="flex flex-col items-start gap-2">
            <Button
              type="button"
              className="h-11 rounded-full px-5"
              onClick={start}
              disabled={pending || priority === 0 || crawlsLeft === 0}
              aria-busy={pending}
            >
              {pending ? (
                <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
              ) : (
                <Play className="size-3.5 fill-current" aria-hidden />
              )}
              {pending ? "Starting" : "Start Crawl — Priority Pages"}
            </Button>
            {priority === 0 ? (
              <p className="text-xs leading-5 text-warn">Make at least one page Priority to start the crawl.</p>
            ) : crawlsLeft != null ? (
              <p className="text-xs leading-5 text-muted-foreground">
                {crawlsLeft === 0
                  ? "You have used this site's crawls on your plan."
                  : `${crawlsLeft} ${crawlsLeft === 1 ? "crawl" : "crawls"} of this site left on ${planLabel}.`}
              </p>
            ) : null}
            {notice ? <p className="text-xs leading-5 text-warn">{notice}</p> : null}
            {error ? (
              <p role="alert" className="text-sm leading-6 text-bad">
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
        </div>
      </section>

      <section aria-labelledby="classification-title" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="classification-title" className="font-display text-[20px] leading-7 tracking-[-0.3px] text-ink">
            Review the classification
          </h2>
          <p className="max-w-2xl text-sm leading-6 text-body">
            Pages were sorted by what discovery could see: the homepage, the pages it links to, what each URL says it
            is, and your sitemap. Move any page between Priority and Standard before you start.
          </p>
          {summary?.homepageError || blocked > 0 ? (
            <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
              <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>
                {summary?.homepageError ? `Your homepage's links could not be read (${summary.homepageError}). ` : ""}
                {blocked > 0 ? `${blocked} ${blocked === 1 ? "URL is" : "URLs are"} left out because robots.txt blocks ${blocked === 1 ? "it" : "them"}.` : ""}
              </span>
            </p>
          ) : null}
        </div>
        <PageInventoryList
          projectId={projectId}
          rows={rows}
          onRowsChange={setRows}
          priorityLimit={priorityLimit}
          planLabel={planLabel}
        />
      </section>
    </div>
  );
}

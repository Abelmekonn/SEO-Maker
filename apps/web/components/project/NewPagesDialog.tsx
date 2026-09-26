"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleAlert, LoaderCircle, Play, Radar, X } from "lucide-react";
import { TierBadge } from "@/components/ai/TierBadge";
import { CRAWL_QUEUED_EVENT } from "@/components/project/CrawlMiniStatus";
import { typeLabel } from "@/components/project/PerfPagePicker";
import { Button } from "@/components/ui/button";
import type { DiscoveryState } from "@/lib/site-inventory";

/**
 * "Check for New Pages": looks for pages SEO Maker does not know yet.
 *
 *   discover -> compare with the known pages -> classify only the new ones
 *   -> show them -> the user chooses whether to crawl them
 *
 * Known pages are neither re-classified nor crawled. New pages are added to
 * the inventory with their classification either way; they are crawled only
 * when the user presses "Crawl New Pages". Cancel crawls nothing.
 */

const POLL_MS = 1500;

type Phase =
  | { kind: "checking" }
  | { kind: "done"; state: DiscoveryState }
  | { kind: "failed"; message: string };

export function NewPagesDialog({
  projectId,
  maxPages,
  heldPages = 0,
  planLabel = "Your plan",
}: {
  projectId: string;
  /** Pages the plan crawls, and the most crawled pages a site holds. */
  maxPages: number;
  /** Crawled pages the results hold now. */
  heldPages?: number;
  planLabel?: string;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [phase, setPhase] = useState<Phase>({ kind: "checking" });
  const [open, setOpen] = useState(false);
  // Polling starts once the check is queued, so the previous check's result
  // is never read as this one's.
  const [armed, setArmed] = useState(false);
  const [crawling, setCrawling] = useState(false);
  const [error, setError] = useState<{ text: string; upgrade: boolean } | null>(null);

  const poll = useCallback(async () => {
    const response = await fetch(`/api/projects/${projectId}/discover`, { cache: "no-store" }).catch(() => null);
    if (!response?.ok) return;
    const state = (await response.json()) as DiscoveryState;
    if (state.mode !== "new-pages") return;
    if (state.status === "done") setPhase({ kind: "done", state });
    if (state.status === "failed") setPhase({ kind: "failed", message: state.error ?? "The check did not finish." });
  }, [projectId]);

  useEffect(() => {
    if (!open || !armed || phase.kind !== "checking") return;
    const timer = window.setInterval(() => void poll(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [armed, open, phase.kind, poll]);

  async function check() {
    setPhase({ kind: "checking" });
    setArmed(false);
    setError(null);
    const response = await fetch(`/api/projects/${projectId}/discover`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "new-pages" }),
    }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as { error?: string } | null;
    if (!response?.ok) {
      setPhase({ kind: "failed", message: data?.error ?? "Could not start the check. Try again." });
      return;
    }
    setArmed(true);
  }

  function show() {
    setOpen(true);
    dialogRef.current?.showModal();
    void check();
  }

  function close() {
    if (crawling) return;
    dialogRef.current?.close();
  }

  const added = phase.kind === "done" ? (phase.state.result?.added ?? []) : [];
  const notListed = phase.kind === "done" ? (phase.state.result?.addedNotListed ?? 0) : 0;
  const total = added.length + notListed;
  const priority = added.filter((row) => row.tier === "priority").length;
  // Priority first, and no more than one crawl holds.
  const toCrawl = [...added].sort((a, b) => Number(b.tier === "priority") - Number(a.tier === "priority")).slice(0, maxPages);

  // Crawled pages past the plan's page count leave the results, Standard and oldest first.
  const leaving = Math.max(0, heldPages - Math.max(0, maxPages - toCrawl.length));

  async function crawlNew() {
    setCrawling(true);
    setError(null);
    const response = await fetch(`/api/projects/${projectId}/crawl`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pages: toCrawl.map((row) => row.pageKey), scope: "new-pages" }),
    }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as { error?: string; upgrade?: boolean } | null;
    setCrawling(false);
    if (!response?.ok) {
      setError({ text: data?.error ?? "Could not start the crawl. Try again.", upgrade: Boolean(data?.upgrade) });
      return;
    }
    dialogRef.current?.close();
    window.dispatchEvent(new Event(CRAWL_QUEUED_EVENT));
    router.refresh();
  }

  return (
    <>
      <Button type="button" variant="outline" className="h-11 w-fit rounded-full px-5" aria-haspopup="dialog" onClick={show}>
        <Radar className="size-3.5" aria-hidden />
        Check for New Pages
      </Button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onCancel={(event) => {
          if (crawling) event.preventDefault();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
        onClose={() => {
          setOpen(false);
          // New pages found and not crawled stay in the inventory; the
          // screens behind this one count them.
          if (phase.kind === "done") router.refresh();
        }}
        className="m-auto max-h-[min(720px,calc(100dvh-32px))] w-[min(620px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl bg-canvas p-0 text-ink ring-1 ring-hairline backdrop:bg-black/70 backdrop:backdrop-blur-sm open:flex"
      >
        <header className="flex items-start justify-between gap-4 border-b border-hairline px-5 pt-5 pb-4 sm:px-6">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 id={titleId} className="font-display text-[20px] leading-6 tracking-[-0.3px] text-ink">
              {phase.kind === "checking"
                ? "Checking for new pages"
                : phase.kind === "failed"
                  ? "The check did not finish"
                  : total > 0
                    ? "New Pages Found"
                    : "No new pages"}
            </h2>
            <p className="text-sm leading-6 text-body">
              {phase.kind === "checking"
                ? "Reading your sitemaps and homepage links for pages SEO Maker does not know yet. Known pages keep their classification and are not crawled."
                : phase.kind === "failed"
                  ? "Nothing was added or crawled."
                  : total > 0
                    ? `${total} ${total === 1 ? "page is" : "pages are"} new. ${total === 1 ? "It has" : "They have"} been classified and added to your page inventory. Nothing is crawled unless you choose to.`
                    : `Your sitemaps and homepage list no pages beyond the ${phase.state.result?.total ?? 0} SEO Maker already knows.`}
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

        {phase.kind === "checking" ? (
          <div className="flex min-h-36 items-center justify-center gap-2 px-6 text-sm text-body" role="status">
            <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
            Looking for new pages
          </div>
        ) : phase.kind === "failed" ? (
          <p role="alert" className="flex items-start gap-2 px-5 py-6 text-sm leading-6 text-bad sm:px-6">
            <CircleAlert className="mt-1 size-4 shrink-0" aria-hidden />
            {phase.message}
          </p>
        ) : total > 0 ? (
          <>
            <dl className="grid grid-cols-2 border-b border-hairline">
              <div className="flex flex-col gap-0.5 px-5 py-4 sm:px-6">
                <dt className="flex items-center gap-2 font-mono text-[12px] text-muted-foreground">
                  <span aria-hidden className="size-2 rounded-full bg-primary" />
                  Priority
                </dt>
                <dd className="font-display text-[32px] leading-none tabular-nums text-ink">{priority}</dd>
              </div>
              <div className="flex flex-col gap-0.5 border-l border-hairline px-5 py-4 sm:px-6">
                <dt className="flex items-center gap-2 font-mono text-[12px] text-muted-foreground">
                  <span aria-hidden className="size-2 rounded-full bg-muted-foreground/60" />
                  Standard
                </dt>
                <dd className="font-display text-[32px] leading-none tabular-nums text-ink">{total - priority}</dd>
              </div>
            </dl>
            <ul aria-label="New pages" className="min-h-0 flex-1 divide-y divide-hairline overflow-y-auto">
              {added.map((row) => (
                <li key={row.pageKey} className="flex min-h-12 items-center justify-between gap-3 px-5 py-2.5 sm:px-6">
                  <span className="min-w-0">
                    <span className="block truncate font-mono text-[13px] text-ink" title={row.url}>
                      {row.path}
                    </span>
                    <span className="block text-xs text-muted-foreground">{typeLabel(row.pageType)}</span>
                  </span>
                  <TierBadge tier={row.tier} />
                </li>
              ))}
              {notListed > 0 ? (
                <li className="px-5 py-2.5 font-mono text-[12px] text-muted-foreground sm:px-6">
                  and {notListed.toLocaleString()} more, listed in your page inventory
                </li>
              ) : null}
            </ul>
          </>
        ) : null}

        <footer className="flex flex-col gap-3 border-t border-hairline px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex min-w-0 flex-col gap-0.5">
            {phase.kind === "done" && total > 0 ? (
              <p className="text-xs leading-5 text-muted-foreground">
                {total > toCrawl.length
                  ? `Crawls the first ${toCrawl.length}, Priority first. The rest stay in your inventory for Re-crawl Site.`
                  : "Cancel keeps them in your inventory, not crawled."}
              </p>
            ) : null}
            {phase.kind === "done" && total > 0 && leaving > 0 ? (
              <p className="text-xs leading-5 text-warn">
                {planLabel} keeps up to {maxPages} crawled pages, so crawling these moves {leaving} earlier{" "}
                {leaving === 1 ? "page" : "pages"} out of your results, Standard pages first.
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
            {phase.kind === "done" && total > 0 ? (
              <>
                <Button type="button" variant="outline" className="h-11" onClick={close} disabled={crawling}>
                  Cancel
                </Button>
                <Button type="button" className="h-11" onClick={crawlNew} disabled={crawling || toCrawl.length === 0} aria-busy={crawling}>
                  {crawling ? (
                    <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />
                  ) : (
                    <Play className="fill-current" aria-hidden />
                  )}
                  {crawling ? "Starting" : "Crawl New Pages"}
                </Button>
              </>
            ) : phase.kind === "failed" ? (
              <>
                <Button type="button" variant="outline" className="h-11" onClick={close}>
                  Close
                </Button>
                <Button type="button" className="h-11" onClick={() => void check()}>
                  Try again
                </Button>
              </>
            ) : (
              <Button type="button" variant="outline" className="h-11" onClick={close}>
                Close
              </Button>
            )}
          </div>
        </footer>
      </dialog>
    </>
  );
}

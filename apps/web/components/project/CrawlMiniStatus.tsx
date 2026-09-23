"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import type { CrawlProgress } from "@/lib/crawl-progress";

/**
 * A slim crawl indicator for every project screen except the overview.
 *
 * The crawl runs on the worker while you work elsewhere; this keeps it in
 * view without taking over the page. The screens under it keep showing the
 * last finished crawl, and refresh once, when the new one completes.
 */

export const CRAWL_QUEUED_EVENT = "seo-maker:crawl-queued";

export function CrawlMiniStatus({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [progress, setProgress] = useState<CrawlProgress | null>(null);
  const [justFinished, setJustFinished] = useState(false);
  const [polling, setPolling] = useState(true);
  const wasRunning = useRef(false);

  const load = useCallback(async () => {
    const response = await fetch(`/api/projects/${projectId}/crawl`, { cache: "no-store" }).catch(() => null);
    if (!response?.ok) return;
    const next = (await response.json()) as CrawlProgress;
    setProgress(next);
    const active = next.state === "running" || next.state === "queued";
    if (active) {
      wasRunning.current = true;
      setPolling(true);
    } else {
      if (wasRunning.current && next.state === "done") {
        wasRunning.current = false;
        setJustFinished(true);
        router.refresh();
        window.setTimeout(() => setJustFinished(false), 5000);
      }
      setPolling(false);
    }
  }, [projectId, router]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    function onQueued() {
      setPolling(true);
      void load();
    }
    window.addEventListener(CRAWL_QUEUED_EVENT, onQueued);
    return () => window.removeEventListener(CRAWL_QUEUED_EVENT, onQueued);
  }, [load]);

  useEffect(() => {
    if (!polling) return;
    const timer = window.setInterval(() => void load(), 3000);
    return () => window.clearInterval(timer);
  }, [load, polling]);

  // The overview shows the full progress view instead.
  if (pathname === `/projects/${projectId}`) return null;

  if (justFinished) {
    return (
      <div className="mb-4 flex items-center gap-2.5 rounded-xl bg-surface-soft px-4 py-2.5 text-sm text-body ring-1 ring-good/30">
        <CheckCircle2 className="size-4 text-good" aria-hidden />
        <span aria-live="polite">Crawl finished. This page now shows the new results.</span>
      </div>
    );
  }

  if (!progress || (progress.state !== "running" && progress.state !== "queued")) return null;

  const processed = progress.done + progress.failedPages;
  const planned = progress.phase === "crawling" || progress.phase === "scoring";
  const pct = planned && progress.target ? Math.min(99, Math.round((processed / progress.target) * 100)) : null;
  const text =
    progress.state === "queued"
      ? progress.workerOnline
        ? "Crawl queued"
        : "Crawl waiting: no crawler worker is running"
      : progress.phase === "crawling"
        ? `Crawling · ${processed} ${progress.targetIsCap ? `pages · up to ${progress.target}` : `/ ${progress.target} pages`}${progress.etaSeconds != null ? ` · ~${eta(progress.etaSeconds)} left` : ""}`
        : progress.phase === "scoring"
          ? "Crawl almost done · scoring pages"
          : "Crawl starting · reading robots.txt and sitemap";

  return (
    <div className="mb-4 flex flex-col gap-2 rounded-xl bg-surface-soft px-4 py-2.5 ring-1 ring-primary/25">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="flex min-w-0 items-center gap-2.5 text-sm text-ink" aria-live="polite">
          <Loader2 className="size-4 shrink-0 animate-spin text-primary motion-reduce:animate-none" aria-hidden />
          <span className="truncate">{text}</span>
        </p>
        <Link
          href={`/projects/${projectId}`}
          className="font-mono text-[12px] text-body underline-offset-4 hover:text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          View progress
        </Link>
      </div>
      <div className="relative h-1 overflow-hidden rounded-full bg-canvas" aria-hidden>
        {pct != null ? (
          <span className="absolute inset-y-0 left-0 rounded-full bg-primary transition-[width] duration-700" style={{ width: `${Math.max(pct, 4)}%` }} />
        ) : null}
        <span className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-primary/60 to-transparent motion-safe:animate-progress-sheen motion-reduce:hidden" />
      </div>
    </div>
  );
}

function eta(seconds: number) {
  return seconds < 60 ? `${seconds}s` : `${Math.round(seconds / 60)} min`;
}

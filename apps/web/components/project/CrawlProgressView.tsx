"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  Check,
  CircleAlert,
  CircleStop,
  FileSearch,
  Gauge,
  Globe,
  Layers,
  Loader2,
  Radar,
  ServerCog,
  Sparkles,
  Timer,
} from "lucide-react";
import { RecrawlButton } from "@/components/project/RecrawlButton";
import { ScoreRing } from "@/components/project/ScoreRing";
import { StopWorkButton } from "@/components/project/StopWorkButton";
import type { CrawlPhase, CrawlProgress } from "@/lib/crawl-progress";
import { cn } from "@/lib/utils";

/**
 * The overview while a crawl runs.
 *
 * The overview used to open straight onto an empty site: zero scores and one
 * pending row, because the crawl had barely started. This shows what the
 * crawler is doing instead, in the order it does it, with a determinate count
 * once the plan is known, the pace and time left, and each page as it lands.
 * When the results are complete it steps aside and the real overview renders.
 *
 * The crawl runs in the worker, not in this tab. Leaving the page does not
 * stop it; the mini status on every other screen keeps track.
 */

const POLL_MS = 1500;

const STEPS: Array<{ id: CrawlPhase; label: string; icon: typeof Radar }> = [
  { id: "queued", label: "Queued", icon: ServerCog },
  { id: "discovering", label: "robots.txt & sitemap", icon: Radar },
  { id: "crawling", label: "Crawling pages", icon: Globe },
  { id: "scoring", label: "Scoring", icon: Gauge },
  { id: "done", label: "Ready", icon: Sparkles },
];

const ORDER: Record<CrawlPhase, number> = {
  queued: 0,
  starting: 1,
  discovering: 1,
  crawling: 2,
  scoring: 3,
  done: 4,
  failed: -1,
  cancelled: -1,
};

export function CrawlProgressView({
  projectId,
  hostname,
  initial,
}: {
  projectId: string;
  hostname: string;
  initial: CrawlProgress;
}) {
  const router = useRouter();
  const [progress, setProgress] = useState(initial);
  const [finished, setFinished] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  const sawRunning = useRef(initial.state === "running" || initial.state === "queued");

  const load = useCallback(async () => {
    const response = await fetch(`/api/projects/${projectId}/crawl`, { cache: "no-store" }).catch(() => null);
    if (!response?.ok) return;
    const next = (await response.json()) as CrawlProgress;
    setProgress(next);
    if (next.state === "running" || next.state === "queued") {
      sawRunning.current = true;
    } else if (next.state === "done" && sawRunning.current) {
      // A short moment to register "done" before the overview replaces this.
      setFinished(true);
      window.setTimeout(() => router.refresh(), 1400);
    } else if (next.state === "cancelled" && sawRunning.current) {
      // Stopped: the overview shows the previous results, or this view in
      // its stopped state when there are none.
      sawRunning.current = false;
      router.refresh();
    }
  }, [projectId, router]);

  useEffect(() => {
    if (progress.state !== "running" && progress.state !== "queued") return;
    const timer = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [load, progress.state]);

  // Elapsed time is client-only, so the server and client render the same HTML.
  useEffect(() => {
    const first = window.setTimeout(() => setNow(Date.now()), 0);
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, []);

  const phase: CrawlPhase = finished ? "done" : progress.phase;
  const processed = progress.done + progress.failedPages;
  const planned = phase === "crawling" || phase === "scoring" || phase === "done";
  const pct = finished || phase === "done" ? 100 : planned && progress.target > 0 ? Math.min(99, Math.round((processed / progress.target) * 100)) : 0;
  const elapsed = now && progress.startedAt ? Math.max(0, Math.floor((now - Date.parse(progress.startedAt)) / 1000)) : null;
  const failed = progress.state === "failed";
  const stopped = progress.state === "cancelled";
  const live = progress.state === "running" || progress.state === "queued";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <section
        aria-labelledby="crawl-title"
        className="relative overflow-hidden rounded-2xl bg-surface-soft ring-1 ring-hairline"
      >
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute -top-44 -right-24 size-[520px] rounded-full blur-3xl",
            failed ? "bg-bad/10" : stopped ? "bg-warn/10" : "bg-primary/15 motion-safe:animate-pulse",
          )}
        />

        <div className="relative flex flex-col gap-7 p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-canvas ring-1 ring-hairline">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`}
                  alt=""
                  width={22}
                  height={22}
                  className="size-[22px]"
                />
              </span>
              <div className="min-w-0">
                <p className="truncate font-mono text-sm text-ink">{hostname}</p>
                <p className="font-mono text-[12px] text-muted-foreground">
                  {progress.mode === "deep" ? "Deep analysis" : "Quick check"} · up to {progress.maxPages}{" "}
                  {progress.maxPages === 1 ? "page" : "pages"}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {elapsed != null && live ? (
                <span className="inline-flex items-center gap-1.5 font-mono text-[12px] tabular-nums text-body">
                  <Timer className="size-3.5" aria-hidden />
                  {formatDuration(elapsed)}
                </span>
              ) : null}
              <LiveBadge phase={phase} failed={failed} stopped={stopped} stopping={progress.stopping} />
              {live && !finished && phase !== "scoring" ? (
                <StopWorkButton
                  endpoint={`/api/projects/${projectId}/crawl`}
                  noun="crawl"
                  size="compact"
                  stopping={progress.stopping}
                  title="Stop this crawl?"
                  onStopped={() => void load()}
                >
                  <StopCrawlCopy processed={processed} hasPrevious={progress.hasPrevious} />
                </StopWorkButton>
              ) : null}
            </div>
          </div>

          <div className="grid items-center gap-8 lg:grid-cols-[auto_minmax(0,1fr)]">
            <Ring
              pct={pct}
              phase={phase}
              failed={failed}
              stopped={stopped}
              processed={processed}
              target={progress.target}
              upTo={progress.targetIsCap}
              planned={planned}
            />

            <div className="flex min-w-0 flex-col gap-5">
              <div className="flex flex-col gap-2">
                <h1
                  id="crawl-title"
                  className="font-display text-[30px] leading-[1.1] tracking-[-0.9px] text-ink sm:text-[40px]"
                  aria-live="polite"
                >
                  {title(phase, failed, hostname, stopped, progress.stopping)}
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-body">{subtitle(progress, phase, failed, stopped)}</p>
              </div>

              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Pages / min" value={progress.pagesPerMinute != null ? `${progress.pagesPerMinute}` : "—"} />
                <Stat
                  label="Time left"
                  value={
                    phase === "done" ? "0s" : progress.etaSeconds != null && phase === "crawling" ? `~${formatDuration(progress.etaSeconds)}` : "—"
                  }
                />
                <Stat label="Problems found" value={`${progress.problems}`} tone={progress.problems ? "warn" : undefined} />
                <Stat label="Failed pages" value={`${progress.failedPages}`} tone={progress.failedPages ? "bad" : undefined} />
              </dl>
            </div>
          </div>

          {!stopped ? <Stepper phase={phase} failed={failed} progress={progress} /> : null}

          <div className="relative h-1.5 overflow-hidden rounded-full bg-canvas" aria-hidden>
            <span
              className={cn(
                "absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-out",
                failed ? "bg-bad" : stopped ? "bg-warn" : phase === "done" ? "bg-good" : "bg-primary",
              )}
              style={{ width: `${failed || stopped ? 100 : Math.max(pct, phase === "queued" ? 3 : 6)}%` }}
            />
            {live && !progress.stopping && phase !== "done" ? (
              <span className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/25 to-transparent motion-safe:animate-progress-sheen motion-reduce:hidden" />
            ) : null}
          </div>
        </div>
      </section>

      {!progress.workerOnline && (progress.state === "queued" || progress.state === "running") ? (
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-warn/10 px-4 py-3 text-sm leading-6 text-warn ring-1 ring-warn/30">
          <CircleAlert className="mt-1 size-4 shrink-0" aria-hidden />
          No crawler worker is connected, so this crawl is waiting. Start the worker (pnpm dev, or the worker app on
          its own) and it begins right away.
        </p>
      ) : null}

      {failed ? (
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-surface-soft p-5 ring-1 ring-bad/30">
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-sm font-medium text-ink">The crawl stopped before it finished.</p>
            <p className="break-words text-sm leading-6 text-body">{progress.error ?? "The worker reported a failure."}</p>
            {progress.hasPrevious ? (
              <p className="text-xs leading-5 text-muted-foreground">Your previous results are unchanged.</p>
            ) : null}
          </div>
          <RecrawlButton projectId={projectId} maxPages={progress.maxPages} appearance="primary" />
        </section>
      ) : null}

      {stopped ? (
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-surface-soft p-5 ring-1 ring-warn/30">
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-sm font-medium text-ink">You stopped this crawl before any page was saved.</p>
            <p className="text-sm leading-6 text-body">There are no results for this site yet. Crawl it when you are ready.</p>
          </div>
          <RecrawlButton projectId={projectId} maxPages={progress.maxPages} appearance="primary" />
        </section>
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(300px,340px)]">
        <section aria-labelledby="feed-title" className="flex min-w-0 flex-col overflow-hidden rounded-xl bg-surface-soft ring-1 ring-hairline">
          <header className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-4">
            <h2 id="feed-title" className="flex items-center gap-2 font-display text-[16px] text-ink">
              <span className="relative flex size-2">
                {phase === "crawling" ? (
                  <span className="absolute inline-flex size-full rounded-full bg-primary opacity-60 motion-safe:animate-ping" />
                ) : null}
                <span className={cn("relative inline-flex size-2 rounded-full", phase === "crawling" ? "bg-primary" : "bg-surface-strong")} />
              </span>
              Live feed
            </h2>
            <p className="font-mono text-[12px] tabular-nums text-muted-foreground">
              {processed} {processed === 1 ? "page" : "pages"} so far
            </p>
          </header>

          {progress.recent.length === 0 ? (
            <ul aria-label="Waiting for the first page" className="divide-y divide-hairline">
              {Array.from({ length: 5 }).map((_, index) => (
                <li key={index} className="flex items-center gap-3 px-5 py-3.5">
                  <span className="h-5 w-10 rounded bg-surface-card motion-safe:animate-pulse" />
                  <span className="h-3.5 flex-1 rounded bg-surface-card motion-safe:animate-pulse" style={{ maxWidth: `${70 - index * 9}%` }} />
                  <span className="size-7 rounded-full bg-surface-card motion-safe:animate-pulse" />
                </li>
              ))}
              <li className="px-5 py-3 text-xs text-muted-foreground">
                {phase === "queued"
                  ? "Waiting for the crawler to pick this up."
                  : "Reading robots.txt and the sitemap to plan which pages to crawl."}
              </li>
            </ul>
          ) : (
            <ol className="divide-y divide-hairline">
              {progress.recent.map((page) => (
                <li
                  key={page.id}
                  className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-5 py-3 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-500"
                >
                  <StatusChip page={page} />
                  <div className="min-w-0">
                    <p className="truncate font-mono text-[13px] text-ink" title={page.path}>
                      {page.path}
                    </p>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      {page.status === "excluded"
                        ? "Not an HTML page, left out of the audit"
                        : page.status === "failed"
                          ? "Could not be fetched"
                          : `${(page.words ?? 0).toLocaleString()} words · ${page.issues} ${page.issues === 1 ? "problem" : "problems"}`}
                    </p>
                  </div>
                  {page.score != null ? (
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-[12px] tabular-nums text-body">{page.score}</span>
                      <ScoreRing score={page.score} size={22} strokeWidth={3} label={`SEO score for ${page.path}: ${page.score} of 100`} />
                    </span>
                  ) : (
                    <span className="w-12" aria-hidden />
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>

        <aside className="flex flex-col gap-4">
          <section className="flex flex-col gap-4 rounded-xl bg-surface-soft p-5 ring-1 ring-hairline">
            <h2 className="flex items-center gap-2 font-display text-[16px] text-ink">
              <span className="flex size-6 items-center justify-center rounded-full bg-surface-card text-body">
                <Layers className="size-3.5" aria-hidden />
              </span>
              Crawl plan
            </h2>
            {progress.plan ? (
              <dl className="flex flex-col">
                <PlanRow label="robots.txt" value={progress.plan.robotsFound ? "Found" : "Not found"} good={progress.plan.robotsFound} />
                <PlanRow label="Sitemap URLs" value={progress.plan.sitemapUrls.toLocaleString()} />
                <PlanRow label="Sections sampled" value={`${progress.plan.sections}`} />
                <PlanRow
                  label="Speed"
                  value={
                    progress.plan.crawlDelay
                      ? `1 at a time, ${progress.plan.crawlDelay}s apart`
                      : `${progress.plan.concurrency} pages at a time`
                  }
                />
                {progress.plan.deferred > 0 ? (
                  <PlanRow label="Past the page limit" value={progress.plan.deferred.toLocaleString()} />
                ) : null}
              </dl>
            ) : (
              <p className="flex items-center gap-2 text-sm text-body">
                <Loader2 className="size-3.5 animate-spin text-muted-foreground motion-reduce:animate-none" aria-hidden />
                Planned once robots.txt and the sitemap are read.
              </p>
            )}
          </section>

          <section className="flex flex-col gap-3 rounded-xl bg-surface-soft p-5 ring-1 ring-hairline">
            <h2 className="font-display text-[16px] text-ink">Keep working</h2>
            <p className="text-sm leading-6 text-body">
              The crawl runs on the worker, not in this tab. Leave whenever you like; it keeps going and this page
              shows the results when they are in.
            </p>
            <ul className="flex flex-col">
              {progress.mode !== "deep" ? (
                <KeepLink href={`/projects/${projectId}/settings`} icon={Sparkles} label="Add business context" hint="Makes AI suggestions specific" />
              ) : (
                <KeepLink href={`/projects/${projectId}/settings`} icon={Sparkles} label="Review business context" hint="Used by Deep analysis" />
              )}
              <KeepLink href={`/projects/${projectId}/performance`} icon={Gauge} label="PageSpeed" hint="Choose pages to test" />
              <KeepLink href="/dashboard" icon={FileSearch} label="Workspace" hint="Your other sites" />
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}

function title(phase: CrawlPhase, failed: boolean, hostname: string, stopped: boolean, stopping: boolean) {
  if (failed) return "The crawl did not finish";
  if (stopped) return "Crawl stopped";
  if (stopping) return "Stopping the crawl";
  switch (phase) {
    case "queued":
      return "Waiting for the crawler";
    case "starting":
    case "discovering":
      return "Mapping the site";
    case "crawling":
      return `Crawling ${hostname}`;
    case "scoring":
      return "Scoring every page";
    default:
      return "Your results are ready";
  }
}

function subtitle(progress: CrawlProgress, phase: CrawlPhase, failed: boolean, stopped: boolean) {
  if (failed) return "Nothing was lost. Start the crawl again when you are ready.";
  if (stopped) return "Nothing more will be fetched.";
  if (progress.stopping) {
    return "Letting the requests already in flight settle. No new pages are fetched; this takes a few seconds.";
  }
  switch (phase) {
    case "queued":
      return progress.waitingPosition && progress.waitingPosition > 1
        ? `${progress.waitingPosition - 1} other ${progress.waitingPosition === 2 ? "crawl is" : "crawls are"} ahead of this one.`
        : "The crawl is queued and starts as soon as the worker is free.";
    case "starting":
    case "discovering":
      return "Reading robots.txt and the sitemap to choose which pages to crawl, spread across the sections of the site.";
    case "crawling":
      return `Fetching and checking each page: status, title, headings, canonical, structured data, images, links and indexability. ${progress.hasPrevious ? "Your previous results stay in place until this finishes." : ""}`;
    case "scoring":
      return "Every page is crawled. Recording each problem and computing the site scores.";
    default:
      return "Opening the overview.";
  }
}

/** What stopping keeps and drops, for the confirmation. */
export function StopCrawlCopy({ processed, hasPrevious }: { processed: number; hasPrevious: boolean }) {
  const fetched = processed === 1 ? "The 1 page fetched so far is" : `The ${processed} pages fetched so far are`;
  if (hasPrevious) {
    return (
      <p>
        {processed > 0 ? `${fetched} dropped, and your` : "Nothing has been fetched yet. Your"} previous results stay
        exactly as they are. You can crawl again any time.
      </p>
    );
  }
  return (
    <p>
      {processed > 0
        ? `${fetched} scored and shown as a partial crawl.`
        : "Nothing has been saved yet, so there will be no results to show."}{" "}
      You can crawl again any time.
    </p>
  );
}

function LiveBadge({
  phase,
  failed,
  stopped,
  stopping,
}: {
  phase: CrawlPhase;
  failed: boolean;
  stopped: boolean;
  stopping: boolean;
}) {
  if (stopped || stopping) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-warn/15 px-2.5 py-1 font-mono text-[11px] text-warn">
        {stopping ? (
          <Loader2 className="size-3 animate-spin motion-reduce:animate-none" aria-hidden />
        ) : (
          <CircleStop className="size-3" aria-hidden />
        )}
        {stopping ? "Stopping" : "Stopped"}
      </span>
    );
  }
  if (failed) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-bad/15 px-2.5 py-1 font-mono text-[11px] text-bad">
        <CircleAlert className="size-3" aria-hidden />
        Stopped
      </span>
    );
  }
  if (phase === "done") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-good/15 px-2.5 py-1 font-mono text-[11px] text-good">
        <Check className="size-3" aria-hidden />
        Complete
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-1 font-mono text-[11px] text-primary">
      <span className="relative flex size-1.5">
        <span className="absolute inline-flex size-full rounded-full bg-primary opacity-70 motion-safe:animate-ping" />
        <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
      </span>
      Live
    </span>
  );
}

function Ring({
  pct,
  phase,
  failed,
  stopped,
  processed,
  target,
  upTo,
  planned,
}: {
  pct: number;
  phase: CrawlPhase;
  failed: boolean;
  stopped: boolean;
  processed: number;
  target: number;
  /** The target is the page limit, not a known count. */
  upTo: boolean;
  planned: boolean;
}) {
  const size = 176;
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const indeterminate = !planned && !failed && !stopped;

  return (
    <div
      role="progressbar"
      aria-label="Crawl progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : pct}
      aria-valuetext={indeterminate ? "Planning the crawl" : `${processed} of ${upTo ? "up to " : ""}${target} pages`}
      className="relative mx-auto size-[176px] shrink-0 lg:mx-0"
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={cn(indeterminate && "motion-safe:animate-spin [animation-duration:2.4s]")}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} className="stroke-canvas" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={indeterminate ? circumference * 0.75 : circumference * (1 - pct / 100)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className={cn(
            "transition-[stroke-dashoffset] duration-700 ease-out",
            failed ? "stroke-bad" : stopped ? "stroke-warn" : phase === "done" ? "stroke-good" : "stroke-primary",
          )}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
        {phase === "done" ? (
          <Check className="size-12 text-good motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-500" strokeWidth={2.5} aria-hidden />
        ) : failed ? (
          <CircleAlert className="size-11 text-bad" aria-hidden />
        ) : stopped ? (
          <CircleStop className="size-11 text-warn" aria-hidden />
        ) : indeterminate ? (
          <Radar className="size-9 text-primary" aria-hidden />
        ) : (
          <>
            <span className="font-display text-[40px] leading-none tracking-[-1.2px] tabular-nums text-ink">{pct}%</span>
            <span className="font-mono text-[12px] tabular-nums text-muted-foreground">
              {upTo ? `${processed} · up to ${target}` : `${processed} / ${target} pages`}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

function Stepper({ phase, failed, progress }: { phase: CrawlPhase; failed: boolean; progress: CrawlProgress }) {
  const current = ORDER[phase];
  const hint: Partial<Record<CrawlPhase, string>> = {
    queued: progress.workerOnline ? "Worker ready" : "Worker offline",
    discovering: progress.plan ? `${progress.plan.sitemapUrls.toLocaleString()} URLs found` : "Planning",
    crawling: progress.target
      ? `${progress.done + progress.failedPages} of ${progress.targetIsCap ? "up to " : ""}${progress.target}`
      : "",
    scoring: current >= 3 ? `${progress.problems} problems` : "",
    done: "",
  };
  return (
    <ol className="grid grid-cols-5 gap-2" aria-label="Crawl steps">
      {STEPS.map((step, index) => {
        const state = failed ? (index <= Math.max(0, ORDER[progress.phase === "failed" ? "crawling" : progress.phase]) ? "failed" : "todo") : index < current ? "done" : index === current ? "active" : "todo";
        return (
          <li key={step.id} className="relative flex flex-col items-center gap-2 text-center">
            {index > 0 ? (
              <span
                aria-hidden
                className={cn(
                  "absolute top-4 right-1/2 left-[-50%] h-px -translate-y-1/2",
                  state === "done" || state === "active" ? "bg-primary/60" : "bg-hairline",
                )}
              />
            ) : null}
            <span
              className={cn(
                "relative z-10 flex size-8 items-center justify-center rounded-full ring-4 ring-surface-soft transition-colors",
                state === "done" && "bg-primary text-primary-foreground",
                state === "active" && "bg-primary/15 text-primary ring-primary/20",
                state === "todo" && "bg-surface-card text-muted-foreground",
                state === "failed" && "bg-bad/15 text-bad",
              )}
            >
              {state === "done" ? (
                <Check className="size-4" strokeWidth={2.5} aria-hidden />
              ) : state === "active" && step.id !== "done" ? (
                <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
              ) : (
                <step.icon className="size-3.5" aria-hidden />
              )}
            </span>
            <span className="flex flex-col gap-0.5">
              <span className={cn("text-[12px] leading-4 sm:text-[13px]", state === "todo" ? "text-muted-foreground" : "text-ink")}>
                {step.label}
                <span className="sr-only">
                  {state === "done" ? " (done)" : state === "active" ? " (in progress)" : ""}
                </span>
              </span>
              {state === "active" || state === "done" ? (
                <span className="hidden font-mono text-[11px] text-muted-foreground sm:block">{hint[step.id]}</span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "warn" | "bad" }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-canvas/60 px-3.5 py-3 ring-1 ring-hairline">
      <dt className="font-mono text-[11px] text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "font-display text-[22px] leading-none tabular-nums tracking-[-0.4px]",
          tone === "warn" ? "text-warn" : tone === "bad" ? "text-bad" : "text-ink",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function StatusChip({ page }: { page: CrawlProgress["recent"][number] }) {
  const ok = page.status === "analyzed" && (page.statusCode ?? 0) < 400;
  return (
    <span
      className={cn(
        "inline-flex h-6 min-w-11 items-center justify-center rounded-md px-1.5 font-mono text-[11px] tabular-nums",
        page.status === "excluded"
          ? "bg-surface-card text-muted-foreground"
          : ok
            ? "bg-good/15 text-good"
            : "bg-bad/15 text-bad",
      )}
    >
      {page.status === "excluded" ? "file" : page.statusCode ?? "—"}
    </span>
  );
}

function PlanRow({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-hairline py-2.5 first:border-t-0 first:pt-0">
      <dt className="text-sm text-body">{label}</dt>
      <dd className={cn("font-mono text-[13px] tabular-nums", good === false ? "text-warn" : good ? "text-good" : "text-ink")}>
        {value}
      </dd>
    </div>
  );
}

function KeepLink({ href, icon: Icon, label, hint }: { href: string; icon: typeof Gauge; label: string; hint: string }) {
  return (
    <li className="border-t border-hairline first:border-t-0">
      <Link
        href={href}
        className="flex min-h-11 items-center gap-3 py-2 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex size-7 items-center justify-center rounded-full bg-surface-card text-body">
          <Icon className="size-3.5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm text-ink">{label}</span>
          <span className="block text-xs text-muted-foreground">{hint}</span>
        </span>
        <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
    </li>
  );
}

export function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
}

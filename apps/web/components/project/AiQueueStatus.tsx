"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleStop, Clock, Loader2 } from "lucide-react";
import { StopWorkButton } from "@/components/project/StopWorkButton";
import { cn } from "@/lib/utils";

/**
 * Live progress for queued AI work.
 *
 * On a provider tier measured in tokens per minute, a page takes minutes, not
 * seconds. This shows what is running, how far through the batch it is, and
 * how long the rest should take, then refreshes the page when the work is
 * done, so nobody has to guess when to reload. Determinate progress for the
 * batch (the total is known) and an indeterminate spinner for the page that is
 * running (its duration is not).
 */

export const AI_QUEUED_EVENT = "seo-maker:ai-queued";

type Job = { jobId: string; pageId: string; state: "active" | "waiting"; position: number; path: string | null };
type Status = { queueOnline: boolean; stopping?: boolean; jobs: Job[]; etaMinutes: number };

const POLL_MS = 4000;

export function AiQueueStatus({ projectId, pageId }: { projectId: string; pageId?: string }) {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [eta, setEta] = useState(0);
  const [total, setTotal] = useState(0);
  const [finished, setFinished] = useState<"done" | "stopped" | null>(null);
  const [stopping, setStopping] = useState(false);
  const [offline, setOffline] = useState(false);
  const [polling, setPolling] = useState(true);
  const hadJobs = useRef(false);
  const stopped = useRef(false);

  const load = useCallback(async () => {
    const response = await fetch(`/api/projects/${projectId}/ai/status`, { cache: "no-store" }).catch(() => null);
    if (!response?.ok) return;
    const data = (await response.json()) as Status;
    const mine = pageId ? data.jobs.filter((job) => job.pageId === pageId) : data.jobs;
    setOffline(!data.queueOnline);
    setJobs(mine);
    setEta(data.etaMinutes);
    setStopping(Boolean(data.stopping) && mine.length > 0);
    if (data.stopping) stopped.current = true;
    setTotal((current) => Math.max(current, mine.length));

    if (mine.length > 0) {
      hadJobs.current = true;
      setFinished(null);
    } else {
      if (hadJobs.current) {
        hadJobs.current = false;
        setFinished(stopped.current ? "stopped" : "done");
        stopped.current = false;
        setTotal(0);
        router.refresh();
        window.setTimeout(() => setFinished(null), 6000);
      }
      setPolling(false);
    }
  }, [pageId, projectId, router]);

  useEffect(() => {
    // setState runs after the fetch resolves, not synchronously in the effect.
    void load();
  }, [load]);

  useEffect(() => {
    function onQueued() {
      setPolling(true);
      void load();
    }
    window.addEventListener(AI_QUEUED_EVENT, onQueued);
    return () => window.removeEventListener(AI_QUEUED_EVENT, onQueued);
  }, [load]);

  useEffect(() => {
    if (!polling) return;
    const timer = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [load, polling]);

  if (offline) {
    return (
      <Shell tone="warn">
        <Clock className="size-4 shrink-0 text-warn" aria-hidden />
        <p className="text-sm text-body">The AI queue is offline. Start Redis and the worker to run analysis.</p>
      </Shell>
    );
  }

  if (finished === "stopped" && jobs.length === 0) {
    return (
      <Shell tone="warn">
        <CircleStop className="size-4 shrink-0 text-warn" aria-hidden />
        <p className="text-sm text-body" aria-live="polite">
          Analysis stopped. Explanations and fixes already written are kept.
        </p>
      </Shell>
    );
  }

  if (finished === "done" && jobs.length === 0) {
    return (
      <Shell tone="good">
        <CheckCircle2 className="size-4 shrink-0 text-good" aria-hidden />
        <p className="text-sm text-body" aria-live="polite">
          Analysis finished. The results below are up to date.
        </p>
      </Shell>
    );
  }

  if (jobs.length === 0) return null;

  const active = jobs.find((job) => job.state === "active");
  const waiting = jobs.filter((job) => job.state === "waiting");
  const done = Math.max(0, total - jobs.length);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <Shell tone={stopping ? "warn" : undefined}>
      <Loader2
        className={cn("size-4 shrink-0 animate-spin motion-reduce:animate-none", stopping ? "text-warn" : "text-primary")}
        aria-hidden
      />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="min-w-0 text-sm text-ink" aria-live="polite">
            {stopping ? (
              <>Stopping the analysis</>
            ) : active ? (
              <>
                Analysing <span className="font-mono text-[13px]">{active.path ?? "a page"}</span>
              </>
            ) : (
              <>Waiting for the AI worker{waiting[0] ? ` (place ${waiting[0].position} in the queue)` : ""}</>
            )}
          </p>
          <span className="flex items-center gap-3">
            {!stopping ? (
              <span className="font-mono text-[12px] tabular-nums text-muted-foreground">
                {total > 1 ? `${done} of ${total} pages · ` : ""}about {eta} min left
              </span>
            ) : null}
            <StopWorkButton
              endpoint={`/api/projects/${projectId}/ai`}
              noun="analysis"
              size="compact"
              stopping={stopping}
              title="Stop AI analysis?"
              onStopped={() => {
                stopped.current = true;
                setStopping(true);
                void load();
              }}
            >
              {pageId ? (
                <p>
                  This stops all AI analysis queued for this site, this page included. Nothing half-finished is saved,
                  and explanations and fixes already written are kept.
                </p>
              ) : (
                <p>
                  {waiting.length > 0
                    ? `${waiting.length} waiting ${waiting.length === 1 ? "page is" : "pages are"} taken off the queue`
                    : "Nothing else is waiting"}
                  {active ? ", and the page being analysed stops without saving a half-finished answer" : ""}.
                  Explanations and fixes already written are kept.
                </p>
              )}
            </StopWorkButton>
          </span>
        </div>
        {total > 1 ? (
          <div
            role="progressbar"
            aria-label="Pages analysed in this batch"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={done}
            className="h-1.5 overflow-hidden rounded-full bg-surface-card"
          >
            <span className="block h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${pct}%` }} />
          </div>
        ) : null}
        {waiting.length > 0 && active ? (
          <p className="truncate text-xs text-muted-foreground">
            Next: {waiting.slice(0, 3).map((job) => job.path ?? "page").join(", ")}
            {waiting.length > 3 ? ` and ${waiting.length - 3} more` : ""}
          </p>
        ) : null}
      </div>
    </Shell>
  );
}

function Shell({ children, tone }: { children: React.ReactNode; tone?: "good" | "warn" }) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl bg-surface-soft px-4 py-3.5 ring-1",
        tone === "good" ? "ring-good/30" : tone === "warn" ? "ring-warn/30" : "ring-primary/30",
      )}
    >
      {children}
    </div>
  );
}

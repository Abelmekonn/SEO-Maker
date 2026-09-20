import { COMPETITOR_PHASE_LABELS, COMPETITOR_PHASES } from "@seo-maker/core/queue";
import { Check, CircleAlert, Info, LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Mirrors the shape of PerformanceStatus: a role="status" banner while work is
 * in flight, role="alert" when it failed, nothing otherwise.
 */
export function CompetitorDiscoveryStatus({
  status,
  phase,
  error,
  done,
  total,
  phaseDone,
  phaseTotal,
}: {
  status: string;
  phase: string | null;
  error: string | null;
  done: number;
  total: number;
  phaseDone: number;
  phaseTotal: number;
}) {
  if (status === "queued" || status === "running") {
    const currentIndex = phase ? COMPETITOR_PHASES.indexOf(phase as never) : -1;
    return (
      <div
        role="status"
        className="flex flex-col gap-3 rounded-lg bg-surface-soft px-5 py-4 ring-1 ring-primary/40"
      >
        <div className="flex items-center gap-3">
          <LoaderCircle className="size-4 shrink-0 animate-spin text-primary" aria-hidden />
          <p className="text-sm text-ink">
            {status === "queued"
              ? "Queued. The worker will pick this up in a moment."
              : `Finding competitors — step ${Math.min(done + 1, total || 9)} of ${total || 9}.`}
          </p>
        </div>
        <ol className="grid gap-1.5 pl-7">
          {COMPETITOR_PHASES.map((id, index) => {
            const isDone = currentIndex > index;
            const isCurrent = currentIndex === index;
            return (
              <li
                key={id}
                className={cn(
                  "flex items-center gap-2 text-[12px]",
                  isDone && "text-body",
                  isCurrent && "text-ink",
                  !isDone && !isCurrent && "text-muted-soft",
                )}
              >
                <span className="flex size-4 shrink-0 items-center justify-center">
                  {isDone ? (
                    <Check className="size-3.5 text-good" aria-hidden />
                  ) : isCurrent ? (
                    <LoaderCircle className="size-3 animate-spin text-primary" aria-hidden />
                  ) : (
                    <span className="size-1.5 rounded-full bg-surface-strong" aria-hidden />
                  )}
                </span>
                {COMPETITOR_PHASE_LABELS[id]}
                {isCurrent && phaseTotal > 0 ? (
                  <span className="font-mono tabular-nums text-muted-foreground">
                    {phaseDone} of {phaseTotal}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>
    );
  }

  if (status === "failed" || (status === "partial" && error)) {
    const failed = status === "failed";
    return (
      <div
        role="alert"
        className={cn(
          "flex items-start gap-3 rounded-lg bg-surface-soft px-5 py-4 ring-1",
          failed ? "ring-bad/40" : "ring-warn/40",
        )}
      >
        {failed ? (
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-bad" aria-hidden />
        ) : (
          <Info className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
        )}
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-ink">
            {failed ? "Competitor discovery did not finish" : "Some steps were skipped"}
          </p>
          {error ? <p className="break-words text-sm leading-6 text-body">{error}</p> : null}
        </div>
      </div>
    );
  }

  return null;
}

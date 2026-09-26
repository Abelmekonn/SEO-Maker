import Link from "next/link";
import type { QuotaView } from "@/lib/ai-access";
import { cn } from "@/lib/utils";

/**
 * The user's AI allowance: generations left today and this week, and when
 * the next one frees up. Counts only. Tokens, budgets and cost stay on the
 * server.
 */

function until(iso: string | null): string | null {
  if (!iso) return null;
  const minutes = Math.max(1, Math.ceil((new Date(iso).getTime() - Date.now()) / 60_000));
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `in ${hours} h`;
  return `in ${Math.round(hours / 24)} d`;
}

function Window({ label, window }: { label: string; window: QuotaView["daily"] }) {
  if (window.limit == null) return null;
  const used = Math.min(window.used, window.limit);
  const empty = window.remaining === 0;
  const frees = until(window.resetsAt);
  return (
    <div className="flex min-w-[140px] flex-1 flex-col gap-1.5">
      <p className="flex items-baseline justify-between gap-3 font-mono text-[12px]">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn("tabular-nums", empty ? "text-warn" : "text-ink")}>
          {window.remaining} of {window.limit} left
        </span>
      </p>
      <div
        role="progressbar"
        aria-label={`${label}: ${used} of ${window.limit} AI generations used`}
        aria-valuemin={0}
        aria-valuemax={window.limit}
        aria-valuenow={used}
        className="h-1 overflow-hidden rounded-full bg-surface-card"
      >
        <span
          className={cn("block h-full rounded-full", empty ? "bg-warn" : "bg-primary")}
          style={{ width: `${(used / window.limit) * 100}%` }}
        />
      </div>
      {empty && frees ? <p className="font-mono text-[11px] text-muted-foreground">Next one frees up {frees}</p> : null}
    </div>
  );
}

export function UsageMeter({ quota, planLabel, className }: { quota: QuotaView; planLabel: string; className?: string }) {
  const capped = quota.daily.limit != null || quota.weekly.limit != null;
  return (
    <section
      aria-label="AI allowance"
      className={cn("flex flex-col gap-3 rounded-xl bg-surface-soft p-4 ring-1 ring-hairline", className)}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium text-ink">AI recommendations</p>
        <span className="font-mono text-[11px] text-muted-foreground">{planLabel}</span>
      </div>
      {capped ? (
        <>
          <div className="flex flex-wrap gap-4">
            <Window label="Today" window={quota.daily} />
            <Window label="This week" window={quota.weekly} />
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            Each request counts once, however many suggestions it returns. Nothing is counted when a request fails or
            there is nothing new to write.{" "}
            <Link href="/pricing" className="text-ink underline underline-offset-4 hover:text-primary">
              No daily cap on Pro
            </Link>
          </p>
        </>
      ) : (
        <p className="text-xs leading-5 text-muted-foreground">
          No daily cap on {planLabel}. Each request still runs only when you ask for it.
        </p>
      )}
    </section>
  );
}

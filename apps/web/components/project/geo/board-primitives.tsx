import type { ReactNode } from "react";
import { Eye } from "lucide-react";
import { ScoreRing } from "@/components/project/ScoreRing";
import { cn } from "@/lib/utils";

/** Shared building blocks for the AI Search boards, so both read the same. */

export function Panel({
  title,
  tabs,
  action,
  className,
  children,
}: {
  title: string;
  tabs?: string[];
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col gap-4 rounded-xl bg-surface-soft p-5 ring-1 ring-hairline",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold text-ink">{title}</h2>
        {tabs ? (
          <div className="flex flex-wrap gap-1">
            {tabs.map((tab, index) => (
              <span
                key={tab}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px] font-medium leading-4",
                  index === 0 ? "bg-surface-card text-muted-foreground" : "text-muted-soft",
                )}
              >
                {tab}
              </span>
            ))}
          </div>
        ) : null}
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * A metric with no measurement behind it.
 *
 * Renders an em dash, never a zero. Zero is a reading; "we have not measured
 * this" is not, and on these screens the two must not look alike.
 */
export function MetricCard({
  icon: Icon,
  label,
  hint,
  denominator,
  value,
  tone,
  ring = false,
}: {
  icon: typeof Eye;
  label: string;
  hint: string;
  denominator?: string;
  /** Omit for a metric with nothing behind it yet. */
  value?: number | string;
  tone?: "default" | "bad" | "good";
  ring?: boolean;
}) {
  const measured = value != null;

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-surface-soft p-5 ring-1 ring-hairline">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-4 shrink-0" aria-hidden />
        <span className="truncate text-[12px] font-medium">{label}</span>
      </div>
      <div className="flex items-center gap-3">
        {ring && !measured ? (
          <ScoreRing score={null} size={48} strokeWidth={5} label={label} />
        ) : null}
        <div className="min-w-0">
          <p
            className={cn(
              "font-display text-[24px] leading-none",
              !measured && "text-muted-soft",
              measured && tone === "bad" && "text-bad",
              measured && tone === "good" && "text-good",
              measured && (tone == null || tone === "default") && "text-ink",
            )}
          >
            {measured ? value : <>&mdash;</>}
            {denominator ? (
              <span className="ml-1 font-mono text-[12px] text-muted-soft">/ {denominator}</span>
            ) : null}
          </p>
          {!measured ? (
            <p className="mt-1.5 text-[11px] leading-4 text-muted-soft">Not tracked yet</p>
          ) : null}
        </div>
      </div>
      <p className="text-[11px] leading-4 text-muted-soft">{hint}</p>
    </div>
  );
}

/** A chart frame drawn empty: the shape, without implying a reading. */
export function TrendFrame({ title, body }: { title: string; body: string }) {
  return (
    <div className="relative h-52 overflow-hidden rounded-lg bg-canvas ring-1 ring-hairline">
      <div aria-hidden className="absolute inset-0 flex flex-col justify-between p-4">
        {[0, 1, 2, 3, 4].map((line) => (
          <span key={line} className="h-px w-full bg-hairline/60" />
        ))}
      </div>
      <div className="relative flex h-full flex-col items-center justify-center px-6 text-center">
        <p className="text-[12px] font-medium text-ink">{title}</p>
        <p className="mt-1 max-w-sm text-[11px] leading-4 text-muted-soft">{body}</p>
      </div>
    </div>
  );
}

const severityTone: Record<string, string> = {
  critical: "bg-bad/15 text-bad",
  high: "bg-warn/15 text-warn",
  medium: "bg-warn/15 text-warn",
  low: "bg-surface-card text-muted-foreground",
};

export function SeverityBadge({ severity }: { severity: string }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-medium capitalize leading-4",
        severityTone[severity] ?? severityTone.low,
      )}
    >
      {severity}
    </span>
  );
}

/** Used wherever a column exists but nothing fills it yet. */
export function NotTracked() {
  return <span className="font-mono text-[11px] text-muted-soft">Not tracked</span>;
}

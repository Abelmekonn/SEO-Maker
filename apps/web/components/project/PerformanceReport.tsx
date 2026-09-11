import type { PerformanceAudit } from "@seo-maker/db";
import { CircleAlert, LoaderCircle, Monitor, Smartphone } from "lucide-react";
import {
  formatSavings,
  readDiagnostics,
  readOpportunities,
  scoreRating,
  vitalRating,
  vitalValue,
  vitals,
  type Rating,
} from "@/lib/performance";
import { cn } from "@/lib/utils";

const ratingText: Record<Rating, string> = {
  good: "text-good",
  warn: "text-warn",
  bad: "text-bad",
  none: "text-muted-foreground",
};

const ratingStroke: Record<Rating, string> = {
  good: "stroke-good",
  warn: "stroke-warn",
  bad: "stroke-bad",
  none: "stroke-surface-strong",
};

const ratingDot: Record<Rating, string> = {
  good: "bg-good",
  warn: "bg-warn",
  bad: "bg-bad",
  none: "bg-surface-strong",
};

const ratingLabel: Record<Rating, string> = {
  good: "Good",
  warn: "Needs work",
  bad: "Poor",
  none: "No data",
};

export function PerformanceStatus({
  status,
  error,
  done = 0,
  total = 0,
}: {
  status: string;
  error: string | null;
  done?: number;
  total?: number;
}) {
  if (status === "queued" || status === "running") {
    const scoped = total > 1;
    const pageLabel = scoped ? ` Page ${Math.min(done + 1, total)} of ${total}.` : "";
    return (
      <div
        role="status"
        className="flex items-center gap-3 rounded-lg bg-surface-soft px-5 py-4 ring-1 ring-primary/40"
      >
        <LoaderCircle className="size-4 shrink-0 animate-spin text-primary" aria-hidden />
        <p className="text-sm text-ink">
          {status === "queued"
            ? scoped
              ? `Queued. ${total} pages. The worker will pick this up in a moment.`
              : "Queued. The worker will pick this up in a moment."
            : `Running PageSpeed on mobile, then desktop.${pageLabel} This takes about a minute per page.`}
        </p>
      </div>
    );
  }

  if (status === "failed" || error) {
    return (
      <div
        role="alert"
        className={cn(
          "flex items-start gap-3 rounded-lg bg-surface-soft px-5 py-4 ring-1",
          status === "failed" ? "ring-bad/40" : "ring-warn/40",
        )}
      >
        <CircleAlert
          className={cn("mt-0.5 size-4 shrink-0", status === "failed" ? "text-bad" : "text-warn")}
          aria-hidden
        />
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-ink">
            {status === "failed" ? "PageSpeed did not finish" : "One strategy did not finish"}
          </p>
          <p className="break-words text-sm leading-6 text-body">{error}</p>
        </div>
      </div>
    );
  }

  return null;
}

export function StrategyReport({
  strategy,
  audit,
  active,
}: {
  strategy: "mobile" | "desktop";
  audit: PerformanceAudit | null;
  active: boolean;
}) {
  const Icon = strategy === "mobile" ? Smartphone : Monitor;
  const title = strategy === "mobile" ? "Mobile" : "Desktop";

  return (
    <section
      aria-label={`${title} results`}
      className={cn(
        "relative flex flex-col gap-6 overflow-hidden rounded-lg bg-surface-soft p-6 ring-1 ring-hairline",
        active && !audit && "ring-primary/40",
      )}
    >
      {active && !audit ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px animate-pulse bg-gradient-to-r from-transparent via-primary to-transparent"
        />
      ) : null}

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <Icon className="size-4 text-body" aria-hidden />
          <h2 className="font-display text-[20px] leading-6 tracking-[-0.3px] text-ink">{title}</h2>
        </div>
        {audit ? (
          <p className="font-mono text-[12px] text-muted-foreground">
            {audit.createdAt.toLocaleString()}
          </p>
        ) : null}
      </div>

      {audit ? (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <ScoreRing label="Performance" score={audit.performance} />
            <ScoreRing label="Accessibility" score={audit.accessibility} />
            <ScoreRing label="Best practices" score={audit.bestPractices} />
            <ScoreRing label="SEO" score={audit.seo} />
          </div>

          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {vitals.map((def) => {
              const value = vitalValue(audit, def);
              const rating = vitalRating(def, value);
              return (
                <div
                  key={def.id}
                  className="flex flex-col gap-1 rounded-md bg-surface-card px-3 py-3"
                  title={def.name}
                >
                  <dt className="flex items-center gap-1.5 font-mono text-[12px] text-muted-foreground">
                    <span aria-hidden className={cn("size-1.5 rounded-full", ratingDot[rating])} />
                    {def.label}
                  </dt>
                  <dd className={cn("font-mono text-[18px] leading-6 tabular-nums", ratingText[rating])}>
                    {value == null ? "-" : def.format(value)}
                  </dd>
                  <dd className="sr-only">{ratingLabel[rating]}</dd>
                </div>
              );
            })}
          </dl>
        </>
      ) : (
        <div className="flex min-h-[180px] flex-col items-center justify-center gap-3 rounded-md bg-surface-card/50 text-center">
          {active ? (
            <>
              <LoaderCircle className="size-5 animate-spin text-primary" aria-hidden />
              <p className="text-sm text-body">Measuring {title.toLowerCase()}</p>
            </>
          ) : (
            <p className="max-w-[28ch] text-sm leading-6 text-body">
              No {title.toLowerCase()} run yet.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function ScoreRing({ label, score }: { label: string; score: number | null }) {
  const rating = scoreRating(score);
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const pct = score == null ? 0 : Math.max(0, Math.min(100, score));
  const offset = circumference * (1 - pct / 100);

  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <div className="relative size-16">
        <svg viewBox="0 0 64 64" className="size-16 -rotate-90" aria-hidden>
          <circle cx="32" cy="32" r={radius} className="fill-none stroke-surface-card" strokeWidth="5" />
          <circle
            cx="32"
            cy="32"
            r={radius}
            className={cn("fill-none transition-[stroke-dashoffset] duration-700", ratingStroke[rating])}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        </svg>
        <span
          className={cn(
            "absolute inset-0 flex items-center justify-center font-display text-[18px] tabular-nums",
            ratingText[rating],
          )}
        >
          {score == null ? "-" : score}
        </span>
      </div>
      <p className="text-xs leading-4 text-body">{label}</p>
      <p className="sr-only">
        {label} {score == null ? "no data" : `${score} out of 100, ${ratingLabel[rating]}`}
      </p>
    </div>
  );
}

export function OpportunitiesCard({
  mobile,
  desktop,
}: {
  mobile: PerformanceAudit | null;
  desktop: PerformanceAudit | null;
}) {
  const rows = [
    ...readOpportunities(mobile?.opportunities).map((o) => ({ ...o, strategy: "Mobile" })),
    ...readOpportunities(desktop?.opportunities).map((o) => ({ ...o, strategy: "Desktop" })),
  ].sort((a, b) => b.savingsMs - a.savingsMs);

  const diagnostics = [
    ...readDiagnostics(mobile?.diagnostics).map((d) => ({ ...d, strategy: "Mobile" })),
    ...readDiagnostics(desktop?.diagnostics).map((d) => ({ ...d, strategy: "Desktop" })),
  ];

  if (rows.length === 0 && diagnostics.length === 0) {
    return null;
  }

  return (
    <section
      aria-label="Opportunities"
      className="grid gap-6 rounded-lg bg-surface-soft p-6 ring-1 ring-hairline lg:grid-cols-2"
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-display text-[20px] leading-6 tracking-[-0.3px] text-ink">
            Opportunities
          </h2>
          <p className="font-mono text-[12px] text-muted-foreground">Estimated savings</p>
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-body">Nothing to speed up. Nice.</p>
        ) : (
          <ul className="divide-y divide-hairline">
            {rows.slice(0, 8).map((row) => (
              <li
                key={`${row.strategy}-${row.id}`}
                className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="text-sm leading-5 text-ink">{row.title}</p>
                  <p className="font-mono text-[12px] text-muted-foreground">{row.strategy}</p>
                </div>
                <p className="shrink-0 font-mono text-sm tabular-nums text-warn">
                  {formatSavings(row.savingsMs)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="font-display text-[20px] leading-6 tracking-[-0.3px] text-ink">
          Diagnostics
        </h2>
        {diagnostics.length === 0 ? (
          <p className="text-sm text-body">No diagnostics flagged.</p>
        ) : (
          <ul className="divide-y divide-hairline">
            {diagnostics.slice(0, 8).map((row) => (
              <li
                key={`${row.strategy}-${row.id}`}
                className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="text-sm leading-5 text-ink">{row.title}</p>
                  <p className="font-mono text-[12px] text-muted-foreground">{row.strategy}</p>
                </div>
                {row.value ? (
                  <p className="shrink-0 font-mono text-[12px] tabular-nums text-body">{row.value}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

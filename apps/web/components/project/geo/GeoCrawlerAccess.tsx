import {
  GEO_ACCESS_CHECK_LABELS,
  type GeoAccessCheck,
  type GeoCheckStatus,
  geoCheckStatusLabels,
} from "@seo-maker/core/geo";
import { Check, CircleHelp, Minus, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * AI crawler accessibility.
 *
 * Deliberately not an 11 x 7 grid of coloured cells. That is 77 cells encoded
 * by a red/green pairing many people cannot distinguish, and it collapses on a
 * narrow screen. Instead: the five weighted checks with their observation, then
 * one row per crawler with its verdict.
 *
 * Every status carries a glyph and a word, never colour alone, and `unknown` is
 * visually distinct from `not tested` because they mean different things — one
 * is "we tried and could not", the other is "we never claim to have tried".
 */

type Cell = { status: GeoCheckStatus; detail: string };

type AgentRow = {
  agent: {
    token: string;
    label: string;
    operator: string;
    purpose: string;
    note: string;
  };
  scored: boolean;
  checks: Record<GeoAccessCheck, Cell>;
};

export type CrawlerMatrix = {
  matrix: AgentRow[];
  signals: Record<GeoAccessCheck, GeoCheckStatus>;
};

const WEIGHTED_CHECKS: GeoAccessCheck[] = [
  "robots-root",
  "robots-key-pages",
  "http-status",
  "auth-wall",
  "noindex",
];

const statusIcon = {
  pass: Check,
  fail: X,
  unknown: CircleHelp,
  not_tested: Minus,
} as const;

const statusTone: Record<GeoCheckStatus, string> = {
  pass: "bg-good/15 text-good",
  fail: "bg-bad/15 text-bad",
  // Neutral, never red: not knowing is not a failure.
  unknown: "bg-surface-card text-muted-foreground ring-1 ring-hairline",
  not_tested: "text-muted-soft",
};

export function StatusChip({ status }: { status: GeoCheckStatus }) {
  const Icon = statusIcon[status];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-4",
        statusTone[status],
      )}
    >
      <Icon className="size-3" aria-hidden />
      {geoCheckStatusLabels[status]}
    </span>
  );
}

export function GeoCrawlerAccess({ matrix }: { matrix: CrawlerMatrix }) {
  // Every scored agent shares the same observation for these checks, so one
  // representative row supplies the detail text.
  const sample = matrix.matrix.find((row) => row.scored) ?? matrix.matrix[0];
  const scored = matrix.matrix.filter((row) => row.scored);
  const unscored = matrix.matrix.filter((row) => !row.scored);

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3 rounded-xl bg-surface-soft p-5 ring-1 ring-hairline">
        <h2 className="text-[13px] font-semibold text-ink">Accessibility checks</h2>
        <ul className="flex flex-col gap-2.5">
          {WEIGHTED_CHECKS.map((check) => (
            <li
              key={check}
              className="flex flex-col gap-1.5 rounded-lg bg-canvas px-3 py-2.5 ring-1 ring-hairline sm:flex-row sm:items-start sm:justify-between sm:gap-3"
            >
              <div className="min-w-0">
                <p className="text-[12px] font-medium text-ink">
                  {GEO_ACCESS_CHECK_LABELS[check]}
                </p>
                {sample ? (
                  <p className="mt-0.5 text-[11px] leading-4 text-muted-soft">
                    {sample.checks[check]?.detail}
                  </p>
                ) : null}
              </div>
              <StatusChip status={matrix.signals[check]} />
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3 rounded-xl bg-surface-soft p-5 ring-1 ring-hairline">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[13px] font-semibold text-ink">Crawlers</h2>
          <span className="text-[11px] text-muted-soft">Scored: search and answer-time fetchers</span>
        </div>

        <ul className="flex flex-col gap-2">
          {scored.map((row) => (
            <AgentLine key={row.agent.token} row={row} />
          ))}
        </ul>

        {unscored.length > 0 ? (
          <details className="group">
            <summary className="cursor-pointer list-none rounded-lg px-1 py-1.5 text-[12px] text-muted-foreground hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {unscored.length} training crawler{unscored.length === 1 ? "" : "s"} — not scored
            </summary>
            <p className="px-1 pb-2 pt-1 text-[11px] leading-4 text-muted-soft">
              Blocking these is a deliberate choice many publishers make. It is reported here, but it
              does not affect the readiness score.
            </p>
            <ul className="flex flex-col gap-2">
              {unscored.map((row) => (
                <AgentLine key={row.agent.token} row={row} muted />
              ))}
            </ul>
          </details>
        ) : null}

        <p className="border-t border-hairline pt-3 text-[11px] leading-4 text-muted-soft">
          Read from robots.txt and from our own crawl. We did not request this site as
          OAI-SearchBot, GPTBot or any other agent, so we cannot confirm what those crawlers
          receive.
        </p>
      </section>
    </div>
  );
}

function AgentLine({ row, muted = false }: { row: AgentRow; muted?: boolean }) {
  // The worst weighted result this crawler gets. A single blocked check is the
  // headline, not an average.
  const statuses = WEIGHTED_CHECKS.map((check) => row.checks[check]?.status).filter(
    Boolean,
  ) as GeoCheckStatus[];
  const verdict: GeoCheckStatus = statuses.includes("fail")
    ? "fail"
    : statuses.includes("pass")
      ? "pass"
      : statuses.includes("unknown")
        ? "unknown"
        : "not_tested";

  return (
    <li
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 rounded-lg bg-canvas px-3 py-2.5 ring-1 ring-hairline",
        muted && "opacity-70",
      )}
    >
      <div className="min-w-0">
        <p className="truncate text-[12px] font-medium text-ink">{row.agent.label}</p>
        <p className="truncate text-[11px] leading-4 text-muted-soft">
          {row.agent.operator} · {row.agent.note}
        </p>
      </div>
      <StatusChip status={verdict} />
    </li>
  );
}

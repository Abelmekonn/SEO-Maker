import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, CircleCheck, Sparkles, Swords, TrendingDown, TrendingUp, Wrench } from "lucide-react";
import { OpportunityStatusControl } from "@/components/project/OpportunityActions";
import { CATEGORY_LABEL, type OpportunityView } from "@/lib/opportunities";
import { cn } from "@/lib/utils";

/**
 * Site opportunities as cards (Phase 3.8).
 *
 * Laid out like the page fixes: what, why, the evidence, what to do. Each card
 * says where its words came from (the crawl, or AI written from the crawl's
 * facts) and how its condition has moved since it was first found. The score
 * is always the deterministic engine's, and "Why this priority" shows its parts.
 */

const BAND_STYLE: Record<string, string> = {
  critical: "bg-bad/15 text-bad",
  high: "bg-warn/15 text-warn",
  medium: "bg-primary/15 text-primary",
  low: "bg-surface-card text-muted-foreground",
};

const OUTCOME: Record<OpportunityView["outcome"], { label: string; className: string; icon: typeof TrendingUp } | null> = {
  new: { label: "New this crawl", className: "bg-primary/10 text-primary", icon: Sparkles },
  resolved: { label: "Resolved by the latest crawl", className: "bg-good/10 text-good", icon: CircleCheck },
  improved: { label: "Improved", className: "bg-good/10 text-good", icon: TrendingDown },
  worse: { label: "Worse", className: "bg-bad/10 text-bad", icon: TrendingUp },
  unchanged: null,
};

const STATUS_LABEL: Record<OpportunityView["status"], string> = {
  open: "Open",
  "in-progress": "In progress",
  done: "Marked done",
  dismissed: "Dismissed",
};

export function OpportunityList({
  projectId,
  rows,
  empty,
}: {
  projectId: string;
  rows: OpportunityView[];
  empty: ReactNode;
}) {
  if (rows.length === 0) {
    return <div className="rounded-xl bg-surface-soft p-6 text-sm leading-6 text-body ring-1 ring-hairline">{empty}</div>;
  }
  return (
    <ol className="flex flex-col gap-3">
      {rows.map((row, index) => (
        <li key={row.id}>
          <OpportunityCard projectId={projectId} row={row} rank={index + 1} />
        </li>
      ))}
    </ol>
  );
}

function OpportunityCard({ projectId, row, rank }: { projectId: string; row: OpportunityView; rank: number }) {
  const outcome = OUTCOME[row.outcome];
  const shown = row.affected.slice(0, 8);
  const more = row.affectedCount - shown.length;

  return (
    <article
      aria-labelledby={`opportunity-${row.id}`}
      className={cn(
        "flex flex-col gap-4 rounded-xl bg-surface-soft p-5 ring-1 ring-hairline sm:p-6",
        row.resolvedAt && "opacity-80",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[12px] text-muted-foreground">{rank}</span>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[11px] leading-5",
            BAND_STYLE[row.band] ?? BAND_STYLE.low,
          )}
          title="Priority, computed from the crawl's evidence"
        >
          {row.band} · {Math.round(row.score)}
        </span>
        <span className="rounded-full bg-surface-card px-2 py-0.5 font-mono text-[11px] leading-5 text-body">
          {CATEGORY_LABEL[row.category] ?? row.category}
        </span>
        {row.effort ? (
          <span className="font-mono text-[11px] text-muted-foreground">{row.effort} effort</span>
        ) : null}
        {row.source === "competitor" ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-surface-card px-2 py-0.5 font-mono text-[11px] leading-5 text-body">
            <Swords className="size-3" aria-hidden />
            {row.competitor ? `from ${row.competitor.domain}` : "from competitors"}
          </span>
        ) : null}
        <SourceBadge aiUsed={row.aiUsed} />
      </div>

      <div className="flex flex-col gap-1.5">
        <h3 id={`opportunity-${row.id}`} className="text-[15px] font-medium leading-6 text-ink">
          {row.title}
        </h3>
        {row.rationale ? <p className="text-sm leading-6 text-body">{row.rationale}</p> : null}
      </div>

      <dl className="grid gap-3 sm:grid-cols-[110px_minmax(0,1fr)]">
        <Row label="Evidence">
          <ul className="flex flex-col gap-1">
            {row.facts.map((fact) => (
              <li key={fact} className="text-sm leading-6 text-body">
                {fact}
              </li>
            ))}
          </ul>
        </Row>
        {row.action ? <Row label="Action">{row.action}</Row> : null}
        {row.nextStep ? (
          <Row label="First step">
            <span className="inline-flex items-start gap-1.5 text-ink">
              <ArrowRight className="mt-1 size-3.5 shrink-0 text-primary" aria-hidden />
              {row.nextStep}
            </span>
          </Row>
        ) : null}
        {shown.length > 0 ? (
          <Row label="Pages">
            <ul className="flex flex-wrap gap-1.5">
              {shown.map((page) => (
                <li key={page.key}>
                  {page.pageId ? (
                    <Link
                      href={`/projects/${projectId}/pages/${page.pageId}`}
                      className="inline-flex min-h-8 max-w-[260px] items-center truncate rounded-md bg-canvas px-2 font-mono text-[12px] text-body ring-1 ring-hairline hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {page.path}
                    </Link>
                  ) : (
                    <span className="inline-flex min-h-8 max-w-[260px] items-center truncate rounded-md bg-canvas px-2 font-mono text-[12px] text-muted-foreground ring-1 ring-hairline">
                      {page.path}
                    </span>
                  )}
                </li>
              ))}
              {more > 0 ? <li className="self-center font-mono text-[12px] text-muted-foreground">+{more} more</li> : null}
            </ul>
          </Row>
        ) : null}
      </dl>

      {row.parts.length > 0 ? (
        <details className="group rounded-lg bg-canvas/60 px-3 py-2 ring-1 ring-hairline">
          <summary className="cursor-pointer font-mono text-[12px] text-muted-foreground hover:text-ink">
            Why this priority
          </summary>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            {row.parts.map((part) => (
              <li key={part.label} className="flex items-center justify-between gap-3 text-xs text-body">
                <span>{part.label}</span>
                <span className="font-mono tabular-nums text-ink">{part.points}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Points out of 100, from the crawl&apos;s evidence
            {row.confidence != null ? `. Confidence in that evidence: ${Math.round(row.confidence * 100)}%` : ""}. The AI
            never sets a priority.
          </p>
        </details>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[12px] text-muted-foreground">{STATUS_LABEL[row.status]}</span>
          {outcome ? (
            <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[11px] leading-5", outcome.className)}>
              <outcome.icon className="size-3" aria-hidden />
              {outcome.label}
              {row.outcome === "improved" || row.outcome === "worse"
                ? ` · ${row.baselineCount} → ${row.affectedCount}`
                : ""}
            </span>
          ) : null}
          {row.status === "done" && !row.resolvedAt ? (
            <span className="font-mono text-[11px] text-warn">The latest crawl still finds this</span>
          ) : null}
        </div>
        <OpportunityStatusControl projectId={projectId} opportunityId={row.id} status={row.status} />
      </div>
    </article>
  );
}

function SourceBadge({ aiUsed }: { aiUsed: boolean }) {
  const style = aiUsed
    ? { icon: Sparkles, text: "Worded by AI from these facts", className: "bg-primary/10 text-primary" }
    : { icon: Wrench, text: "From the crawl", className: "bg-good/10 text-good" };
  return (
    <span className={cn("ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[11px] leading-5", style.className)}>
      <style.icon className="size-3" aria-hidden />
      {style.text}
    </span>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="font-mono text-[12px] text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm leading-6 text-body">{children}</dd>
    </>
  );
}

"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Sparkles } from "lucide-react";
import { PerformanceStatus } from "@/components/project/PerformanceReport";
import { StatusBadge } from "@/components/project/StatusBadge";
import { Button } from "@/components/ui/button";
import { playbookFor, summarizePerformance } from "@/lib/perf-playbook";
import type { PerfAuditView, PerfStrategy } from "@/lib/perf-view";
import {
  formatBytes,
  formatSavings,
  opportunityPriority,
  scoreBand,
  vitalRating,
  vitals,
  type Rating,
} from "@/lib/performance";
import { cn } from "@/lib/utils";

const lcpDef = vitals.find((item) => item.id === "lcp")!;
const inpDef = vitals.find((item) => item.id === "inp")!;
const clsDef = vitals.find((item) => item.id === "cls")!;

const ratingText: Record<Rating, string> = {
  good: "text-good",
  warn: "text-warn",
  bad: "text-bad",
  none: "text-muted-foreground",
};

export function PerformancePageDetail({
  projectId,
  pageId,
  path,
  liveUrl,
  pageStatus,
  projectName,
  initialStrategy,
  mobile,
  desktop,
  perfStatus,
  perfError,
  perfDone,
  perfTotal,
}: {
  projectId: string;
  pageId: string;
  path: string;
  liveUrl: string;
  pageStatus: string;
  projectName: string;
  initialStrategy: PerfStrategy;
  mobile: PerfAuditView | null;
  desktop: PerfAuditView | null;
  perfStatus: string;
  perfError: string | null;
  perfDone: number;
  perfTotal: number;
}) {
  const router = useRouter();
  const [strategy, setStrategy] = useState<PerfStrategy>(initialStrategy);
  const audit = strategy === "desktop" ? desktop : mobile;
  const band = scoreBand(audit?.performance ?? null);
  const top = audit?.opportunities[0] ?? null;

  const failed = useMemo(() => {
    if (!audit) return [];
    const items: string[] = [];
    if (vitalRating(lcpDef, audit.lcp) !== "good" && audit.lcp != null) items.push("Largest Contentful Paint");
    items.push(...audit.opportunities.slice(0, 4).map((item) => item.title));
    return [...new Set(items)];
  }, [audit]);

  function setDevice(next: PerfStrategy) {
    setStrategy(next);
    router.replace(`/projects/${projectId}/performance/${pageId}?device=${next}`, {
      scroll: false,
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <button
        type="button"
        onClick={() => router.push(`/projects/${projectId}/performance`)}
        className="inline-flex min-h-10 w-fit items-center gap-1.5 rounded-md font-mono text-sm text-body hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Performance
      </button>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="font-display text-[28px] leading-none tracking-[-0.5px] text-ink">{path}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <p className="break-all font-mono text-sm text-body">{liveUrl}</p>
            <StatusBadge status={pageStatus} />
          </div>
          <p className="max-w-2xl text-sm leading-6 text-body">
            {projectName}. Lab data from Lighthouse for this URL.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-full bg-surface-soft p-1 ring-1 ring-hairline">
            {(["mobile", "desktop"] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setDevice(key)}
                className={cn(
                  "h-9 rounded-full px-3 text-[13px] font-medium capitalize",
                  strategy === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-ink",
                )}
              >
                {key}
              </button>
            ))}
          </div>
          <Button asChild variant="outline" className="h-11 w-fit">
            <a href={liveUrl} target="_blank" rel="noopener noreferrer">
              Open live page
              <ArrowUpRight aria-hidden />
            </a>
          </Button>
        </div>
      </header>

      <PerformanceStatus status={perfStatus} error={perfError} done={perfDone} total={perfTotal} />

      <section className="grid gap-3 md:grid-cols-4">
        <div className="rounded-xl bg-surface-soft p-4 ring-1 ring-primary/40">
          <p className="font-mono text-[12px] text-muted-foreground">Performance score</p>
          <p className={cn("mt-2 font-display text-[32px] tabular-nums", ratingText[band.rating])}>
            {audit?.performance ?? "-"}
            <span className="text-[16px] text-muted-foreground"> / 100</span>
          </p>
        </div>
        <Vital label="LCP" value={audit?.lcp == null ? "-" : lcpDef.format(audit.lcp)} rating={vitalRating(lcpDef, audit?.lcp)} />
        <Vital label="INP" value={audit?.inp == null ? "-" : inpDef.format(audit.inp)} rating={vitalRating(inpDef, audit?.inp)} />
        <Vital label="CLS" value={audit?.cls == null ? "-" : clsDef.format(audit.cls)} rating={vitalRating(clsDef, audit?.cls)} />
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,340px)]">
        <section className="rounded-xl bg-surface-soft p-5 ring-1 ring-hairline">
          <h2 className="font-display text-[18px] leading-6 tracking-[-0.3px] text-ink">Failed checks</h2>
          {failed.length === 0 ? (
            <p className="mt-3 text-sm text-body">No failing checks on this run.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {failed.map((item) => (
                <li key={item} className="text-sm text-ink">
                  · {item}
                </li>
              ))}
            </ul>
          )}
        </section>
        <aside className="rounded-xl bg-surface-soft p-5 ring-1 ring-hairline">
          <h2 className="flex items-center gap-2 font-display text-[18px] leading-6 tracking-[-0.3px] text-ink">
            <Sparkles className="size-4 text-primary" aria-hidden />
            AI explanation
          </h2>
          <p className="mt-3 text-sm leading-6 text-body">
            {summarizePerformance(audit?.performance ?? null, top, path)}
          </p>
          {top ? (
            <p className="mt-3 text-sm leading-6 text-body">{playbookFor(top.id).fix}</p>
          ) : null}
        </aside>
      </div>

      <section className="rounded-xl bg-surface-soft p-5 ring-1 ring-hairline">
        <h2 className="font-display text-[18px] leading-6 tracking-[-0.3px] text-ink">
          Lighthouse opportunities
        </h2>
        {!audit || audit.opportunities.length === 0 ? (
          <p className="mt-3 text-sm text-body">No opportunities on this {strategy} run.</p>
        ) : (
          <ul className="mt-4 divide-y divide-hairline">
            {audit.opportunities.map((item) => {
              const book = playbookFor(item.id);
              return (
                <li key={item.id} className="flex flex-col gap-1 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm text-ink">{item.title}</p>
                    <p className="shrink-0 font-mono text-[12px] text-warn">
                      {item.savingsMs > 0 ? formatSavings(item.savingsMs) : formatBytes(item.savingsBytes ?? 0)}
                    </p>
                  </div>
                  <p className="text-sm leading-6 text-body">{book.why}</p>
                  <p className="font-mono text-[12px] capitalize text-muted-foreground">
                    {opportunityPriority(item)} · {book.effort} effort
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function Vital({ label, value, rating }: { label: string; value: string; rating: Rating }) {
  return (
    <div className="rounded-xl bg-surface-soft p-4 ring-1 ring-hairline">
      <p className="font-mono text-[12px] text-muted-foreground">{label}</p>
      <p className={cn("mt-2 font-display text-[24px] tabular-nums", ratingText[rating])}>{value}</p>
    </div>
  );
}

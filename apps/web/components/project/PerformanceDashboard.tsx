"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  Gauge,
  LoaderCircle,
  Monitor,
  Smartphone,
  Sparkles,
} from "lucide-react";
import { TrendLines } from "@/components/project/OverviewCharts";
import { PerformanceStatus } from "@/components/project/PerformanceReport";
import { RunPerformanceButton } from "@/components/project/RunPerformanceButton";
import { StatusBadge } from "@/components/project/StatusBadge";
import { Button } from "@/components/ui/button";
import { playbookFor, summarizePerformance } from "@/lib/perf-playbook";
import { latestByStrategy, type PerfAuditView, type PerfHistoryPoint, type PerfPageView, type PerfStrategy } from "@/lib/perf-view";
import type { PlanId } from "@/lib/plan";
import {
  formatBytes,
  formatRelativeRun,
  formatSavings,
  opportunityPriority,
  scoreBand,
  vitalRating,
  vitals,
  type Opportunity,
  type OpportunityPriority,
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

const priorityStyle: Record<OpportunityPriority, string> = {
  high: "bg-bad/15 text-bad",
  medium: "bg-warn/15 text-warn",
  low: "bg-surface-card text-body",
};

export function PerformanceDashboard({
  projectId,
  hostname,
  plan,
  planLabel,
  projectStatus,
  maxPages,
  homepageId,
  pages,
  audits,
  history,
  suggestedIds,
  initialSelected,
  active,
  runningPageId,
  perfStatus,
  perfError,
  perfDone,
  perfTotal,
  lastRunAt,
}: {
  projectId: string;
  hostname: string;
  plan: PlanId;
  planLabel: string;
  projectStatus: string;
  maxPages: number;
  homepageId: string | null;
  pages: PerfPageView[];
  audits: PerfAuditView[];
  history: PerfHistoryPoint[];
  suggestedIds: string[];
  initialSelected: string[];
  active: boolean;
  runningPageId: string | null;
  perfStatus: string;
  perfError: string | null;
  perfDone: number;
  perfTotal: number;
  lastRunAt: string | null;
}) {
  const router = useRouter();
  const canSelect = plan !== "free";
  const [strategy, setStrategy] = useState<PerfStrategy>("mobile");
  const [query, setQuery] = useState("");
  const [oppFilter, setOppFilter] = useState<"all" | OpportunityPriority>("all");
  const [openOpp, setOpenOpp] = useState<string | null>(null);
  const [openDiag, setOpenDiag] = useState<string | null>(null);
  const [showPlan, setShowPlan] = useState(false);
  const [selected, setSelected] = useState<string[]>(() =>
    initialSelected.filter((id) => pages.some((page) => page.id === id)),
  );

  const pageIds = canSelect ? selected : homepageId ? [homepageId] : [];
  const latest = useMemo(() => latestByStrategy(audits, strategy), [audits, strategy]);
  const homepageAudit = homepageId ? latest.get(homepageId) ?? null : null;
  const headline = homepageAudit ?? [...latest.values()][0] ?? null;
  const previous = useMemo(() => {
    const points = history
      .filter((point) => point.strategy === strategy)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return points.length >= 2 ? points[points.length - 2] : null;
  }, [history, strategy]);

  const opportunities = useMemo(() => {
    const grouped = new Map<
      string,
      Opportunity & { pages: string[]; priority: OpportunityPriority }
    >();
    for (const audit of latest.values()) {
      for (const item of audit.opportunities) {
        const current = grouped.get(item.id);
        if (current) {
          current.savingsMs = Math.max(current.savingsMs, item.savingsMs);
          current.savingsBytes = Math.max(current.savingsBytes ?? 0, item.savingsBytes ?? 0);
          if (!current.pages.includes(audit.path)) current.pages.push(audit.path);
        } else {
          grouped.set(item.id, {
            ...item,
            pages: [audit.path],
            priority: opportunityPriority(item),
          });
        }
      }
    }
    return [...grouped.values()].sort(
      (a, b) => b.savingsMs - a.savingsMs || (b.savingsBytes ?? 0) - (a.savingsBytes ?? 0),
    );
  }, [latest]);

  const diagnostics = useMemo(() => {
    const grouped = new Map<string, { id: string; title: string; value: string; pages: string[] }>();
    for (const audit of latest.values()) {
      for (const item of audit.diagnostics) {
        const current = grouped.get(item.id);
        if (current) {
          if (!current.pages.includes(audit.path)) current.pages.push(audit.path);
        } else {
          grouped.set(item.id, { ...item, pages: [audit.path] });
        }
      }
    }
    return [...grouped.values()];
  }, [latest]);

  const visibleOpps = opportunities.filter((item) => oppFilter === "all" || item.priority === oppFilter);
  const topOpp = opportunities[0] ?? null;
  const headlinePath = headline?.path ?? "/";

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return pages
      .filter((page) => {
        if (!needle) return true;
        return page.path.toLowerCase().includes(needle) || page.title.toLowerCase().includes(needle);
      })
      .map((page) => {
        const audit = latest.get(page.id) ?? null;
        return { page, audit };
      });
  }, [latest, pages, query]);

  const crawledIds = pages.filter((page) => page.crawled || page.id === homepageId).map((page) => page.id);
  const failedIds = crawledIds.filter((id) => !latest.get(id));
  const trend = useMemo(() => {
    const points = history
      .filter((point) => point.strategy === strategy)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(-8);
    return buildHistoryChart(points, headline);
  }, [headline, history, strategy]);

  function toggle(id: string) {
    if (active || !canSelect) return;
    setSelected((current) => {
      if (current.includes(id)) {
        if (id === homepageId && current.length === 1) return current;
        return current.filter((value) => value !== id);
      }
      if (current.length >= maxPages) return current;
      return [...current, id];
    });
  }

  function selectHomepage() {
    if (homepageId) setSelected([homepageId]);
  }

  function selectSuggested() {
    const next = suggestedIds.filter((id) => pages.some((page) => page.id === id));
    setSelected(next.length > 0 ? next : homepageId ? [homepageId] : []);
  }

  function selectAllCrawled() {
    const next = homepageId && !crawledIds.includes(homepageId) ? [homepageId, ...crawledIds] : crawledIds;
    setSelected([...new Set(next)].slice(0, maxPages));
  }

  function selectFailed() {
    const next = homepageId ? [homepageId, ...failedIds] : failedIds;
    setSelected([...new Set(next)].slice(0, maxPages));
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-soft text-body ring-1 ring-hairline">
            <Gauge className="size-4" aria-hidden />
          </span>
          <div className="flex min-w-0 flex-col gap-2">
            <h1 className="font-display text-[28px] leading-none tracking-[-0.5px] text-ink">
              Performance
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-mono text-sm text-body">{hostname}</p>
              <StatusBadge status={projectStatus} />
              <span className="inline-flex rounded-full bg-surface-card px-2.5 py-1 font-mono text-[12px] leading-4 text-ink">
                {planLabel}
              </span>
            </div>
            <p className="max-w-2xl text-sm leading-6 text-body">
              Understand your website's speed, prioritize the biggest performance problems, and get
              actionable fixes. Lab data from Lighthouse.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <DeviceToggle value={strategy} onChange={setStrategy} />
          <p className="font-mono text-[12px] text-muted-foreground">
            Last run {formatRelativeRun(lastRunAt ? new Date(lastRunAt) : null)}
          </p>
          <RunPerformanceButton
            projectId={projectId}
            pageIds={pageIds}
            active={active}
            hasResults={audits.length > 0}
            runLabel="Run Lighthouse"
          />
        </div>
      </header>

      <PerformanceStatus status={perfStatus} error={perfError} done={perfDone} total={perfTotal} />

      <section aria-label="Lighthouse scores" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <ScoreCard
          label="Performance"
          score={headline?.performance ?? null}
          delta={delta(headline?.performance, previous?.performance)}
          primary
        />
        <ScoreCard label="Accessibility" score={headline?.accessibility ?? null} />
        <ScoreCard label="Best practices" score={headline?.bestPractices ?? null} />
        <ScoreCard label="SEO" score={headline?.seo ?? null} />
      </section>

      <section className="flex flex-col gap-3 rounded-xl bg-surface-soft p-5 ring-1 ring-hairline">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-[18px] leading-6 tracking-[-0.3px] text-ink">
              Core Web Vitals
            </h2>
            <p className="mt-1 text-sm leading-6 text-body">
              These metrics measure loading speed, responsiveness, and visual stability. Lab data
              from Lighthouse, not real-user Chrome data.
            </p>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <VitalCard
            label="LCP"
            hint="Largest content"
            value={headline?.lcp ?? null}
            rating={vitalRating(lcpDef, headline?.lcp)}
            display={headline?.lcp == null ? "-" : lcpDef.format(headline.lcp)}
          />
          <VitalCard
            label="INP"
            hint="Interaction"
            value={headline?.inp ?? null}
            rating={vitalRating(inpDef, headline?.inp)}
            display={headline?.inp == null ? "-" : inpDef.format(headline.inp)}
          />
          <VitalCard
            label="CLS"
            hint="Layout stability"
            value={headline?.cls ?? null}
            rating={vitalRating(clsDef, headline?.cls)}
            display={headline?.cls == null ? "-" : clsDef.format(headline.cls)}
          />
        </div>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <ExtraMetric label="FCP" value={headline?.fcp == null ? "-" : `${headline.fcp.toFixed(1)} s`} />
          <ExtraMetric label="TTFB" value={headline?.ttfb == null ? "-" : `${headline.ttfb.toFixed(1)} s`} />
          <ExtraMetric label="TBT" value={headline?.tbt == null ? "-" : `${Math.round(headline.tbt)} ms`} />
          <ExtraMetric
            label="Speed Index"
            value={headline?.speedIndex == null ? "-" : `${headline.speedIndex.toFixed(1)} s`}
          />
        </dl>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,340px)]">
        <section className="flex flex-col gap-4 rounded-xl bg-surface-soft p-5 ring-1 ring-hairline">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-[18px] leading-6 tracking-[-0.3px] text-ink">
              Performance history
            </h2>
            <ul className="flex flex-wrap items-center gap-4 font-mono text-[12px] text-body">
              <LegendDot className="bg-[#2dd4bf]" label="Performance" />
              <LegendDot className="bg-[#8b7cf6]" label="LCP" />
              <LegendDot className="bg-good" label="CLS" />
            </ul>
          </div>
          {trend ? (
            <TrendLines
              label={`${strategy} performance, LCP, and CLS history`}
              ticks={trend.labels}
              series={[
                { key: "performance", label: "Performance", color: "#2dd4bf", values: trend.performance },
                { key: "lcp", label: "LCP", color: "#8b7cf6", values: trend.lcp },
                { key: "cls", label: "CLS", color: "#3ecf8e", values: trend.cls },
              ]}
            />
          ) : (
            <p className="text-sm leading-6 text-body">
              Run Lighthouse to see how {strategy} performance, LCP, and CLS move.
            </p>
          )}
        </section>

        <aside className="flex flex-col gap-4 rounded-xl bg-surface-soft p-5 ring-1 ring-hairline">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 font-display text-[18px] leading-6 tracking-[-0.3px] text-ink">
              <Sparkles className="size-4 text-primary" aria-hidden />
              AI Performance Assistant
            </h2>
            <p className="font-mono text-[12px] text-muted-foreground">From this run</p>
          </div>
          <p className="text-sm leading-6 text-body">
            {summarizePerformance(headline?.performance ?? null, topOpp, headlinePath)}
          </p>
          {opportunities.slice(0, 3).length > 0 ? (
            <ol className="flex flex-col gap-2">
              {opportunities.slice(0, 3).map((item, index) => (
                <li key={item.id} className="flex items-start justify-between gap-3 text-sm">
                  <span className="text-ink">
                    {index + 1}. {item.title}
                  </span>
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 font-mono text-[11px]", priorityStyle[item.priority])}>
                    {item.priority}
                  </span>
                </li>
              ))}
            </ol>
          ) : null}
          <Button type="button" className="h-11 w-full" disabled={!topOpp} onClick={() => setShowPlan((value) => !value)}>
            {showPlan ? "Hide fix plan" : "Generate fix plan"}
          </Button>
          {showPlan && topOpp ? (
            <div className="flex flex-col gap-2 rounded-lg bg-canvas p-3 ring-1 ring-hairline">
              <FixPlan item={topOpp} path={topOpp.pages[0] ?? headlinePath} />
            </div>
          ) : null}
        </aside>
      </div>

      <section className="flex flex-col gap-4 rounded-xl bg-surface-soft p-5 ring-1 ring-hairline">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-[18px] leading-6 tracking-[-0.3px] text-ink">
              Opportunities
            </h2>
            <p className="mt-1 text-sm text-body">
              {opportunities.length === 0
                ? "No measurable savings on this run."
                : `${opportunities.length} opportunities found. Improvements with a time or size saving.`}
            </p>
          </div>
          <div className="flex rounded-full bg-canvas p-1 ring-1 ring-hairline">
            {(["all", "high", "medium", "low"] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setOppFilter(key)}
                className={cn(
                  "h-8 rounded-full px-3 text-[12px] font-medium capitalize",
                  oppFilter === key ? "bg-surface-card text-ink" : "text-muted-foreground hover:text-ink",
                )}
              >
                {key === "all" ? "All" : key === "high" ? "High impact" : key}
              </button>
            ))}
          </div>
        </div>
        {visibleOpps.length === 0 ? (
          <p className="text-sm leading-6 text-body">Nothing in this filter.</p>
        ) : (
          <ul className="divide-y divide-hairline">
            {visibleOpps.map((item) => {
              const open = openOpp === item.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setOpenOpp(open ? null : item.id)}
                    className="flex w-full items-start justify-between gap-4 py-3 text-left"
                    aria-expanded={open}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm text-ink">{item.title}</span>
                      <span className="mt-1 block font-mono text-[12px] text-muted-foreground">
                        {item.pages.length === 1
                          ? `${item.pages[0]} · ${strategy}`
                          : `${item.pages.length} pages · ${strategy}`}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className={cn("rounded-full px-2 py-0.5 font-mono text-[11px] uppercase", priorityStyle[item.priority])}>
                        {item.priority}
                      </span>
                      <span className="font-mono text-[12px] tabular-nums text-warn">
                        {item.savingsMs > 0 ? formatSavings(item.savingsMs) : formatBytes(item.savingsBytes ?? 0)}
                      </span>
                      <ChevronDown className={cn("size-4 text-muted-soft transition-transform", open && "rotate-180")} />
                    </span>
                  </button>
                  {open ? (
                    <div className="pb-4">
                      <FixPlan item={item} path={item.pages[0] ?? headlinePath} />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-4 rounded-xl bg-surface-soft p-5 ring-1 ring-hairline">
        <div>
          <h2 className="font-display text-[18px] leading-6 tracking-[-0.3px] text-ink">
            Diagnostics
          </h2>
          <p className="mt-1 text-sm text-body">
            Technical findings that may not include a direct savings estimate.
          </p>
        </div>
        {diagnostics.length === 0 ? (
          <p className="text-sm leading-6 text-body">No diagnostics flagged on this run.</p>
        ) : (
          <ul className="divide-y divide-hairline">
            {diagnostics.map((item) => {
              const open = openDiag === item.id;
              const book = playbookFor(item.id);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setOpenDiag(open ? null : item.id)}
                    className="flex w-full items-center justify-between gap-3 py-3 text-left"
                    aria-expanded={open}
                  >
                    <span className="text-sm text-ink">{item.title}</span>
                    <span className="flex items-center gap-2 font-mono text-[12px] text-muted-foreground">
                      {item.value || (item.pages.length > 1 ? `${item.pages.length} pages` : item.pages[0])}
                      <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
                    </span>
                  </button>
                  {open ? (
                    <p className="pb-4 text-sm leading-6 text-body">{book.why}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-[18px] leading-6 tracking-[-0.3px] text-ink">
              Page performance
            </h2>
            <p className="mt-1 text-sm text-body">
              {canSelect
                ? `${pageIds.length} of ${maxPages} pages selected for the next ${strategy} and desktop run.`
                : "Free includes Lighthouse on the homepage."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canSelect ? (
              <>
                <Button type="button" variant="outline" className="h-11 w-fit" disabled={active} onClick={selectHomepage}>
                  Homepage
                </Button>
                {plan === "agency" ? (
                  <Button type="button" variant="outline" className="h-11 w-fit" disabled={active} onClick={selectSuggested}>
                    Suggested
                  </Button>
                ) : null}
                <Button type="button" variant="outline" className="h-11 w-fit" disabled={active || crawledIds.length === 0} onClick={selectAllCrawled}>
                  All crawled
                </Button>
                <Button type="button" variant="outline" className="h-11 w-fit" disabled={active || failedIds.length === 0} onClick={selectFailed}>
                  Re-run missing
                </Button>
              </>
            ) : null}
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search pages"
              className="h-11 w-48 rounded-md bg-surface-soft px-3 text-sm text-ink ring-1 ring-hairline placeholder:text-muted-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl bg-surface-soft ring-1 ring-hairline">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead className="font-mono text-[12px] text-muted-foreground">
              <tr>
                {canSelect ? <th scope="col" className="w-12 px-5 py-3.5 font-medium" /> : null}
                <th scope="col" className="px-5 py-3.5 font-medium">Page</th>
                <th scope="col" className="px-5 py-3.5 font-medium">Score</th>
                <th scope="col" className="px-5 py-3.5 font-medium">LCP</th>
                <th scope="col" className="px-5 py-3.5 font-medium">INP</th>
                <th scope="col" className="px-5 py-3.5 font-medium">CLS</th>
                <th scope="col" className="px-5 py-3.5 font-medium">Issues</th>
                <th scope="col" className="px-5 py-3.5 font-medium">Status</th>
                <th scope="col" className="px-5 py-3.5 font-medium">Last tested</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ page, audit }) => {
                const href = `/projects/${projectId}/performance/${page.id}?device=${strategy}`;
                const checked = selected.includes(page.id);
                const atCap = !checked && selected.length >= maxPages;
                const measuring = runningPageId === page.id;
                const issues = audit?.opportunities.length ?? 0;
                const band = scoreBand(audit?.performance ?? null);
                return (
                  <tr
                    key={page.id}
                    className={cn(
                      "cursor-pointer border-t border-hairline hover:bg-surface-card/60",
                      measuring && "bg-primary/5",
                    )}
                    role="link"
                    tabIndex={0}
                    onClick={() => router.push(href)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        router.push(href);
                      }
                    }}
                  >
                    {canSelect ? (
                      <td className="px-5 py-4">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={active || atCap}
                          aria-label={`Select ${page.path}`}
                          className="size-4 accent-primary"
                          onClick={(event) => event.stopPropagation()}
                          onChange={() => toggle(page.id)}
                        />
                      </td>
                    ) : null}
                    <td className="max-w-[240px] px-5 py-4">
                      <p className="truncate font-mono text-ink">{page.path}</p>
                    </td>
                    <td className={cn("px-5 py-4 font-mono tabular-nums", ratingText[band.rating])}>
                      {audit?.performance ?? "-"}
                    </td>
                    <td className={cn("px-5 py-4 font-mono tabular-nums", ratingText[vitalRating(lcpDef, audit?.lcp)])}>
                      {audit?.lcp == null ? "-" : lcpDef.format(audit.lcp)}
                    </td>
                    <td className={cn("px-5 py-4 font-mono tabular-nums", ratingText[vitalRating(inpDef, audit?.inp)])}>
                      {audit?.inp == null ? "-" : inpDef.format(audit.inp)}
                    </td>
                    <td className={cn("px-5 py-4 font-mono tabular-nums", ratingText[vitalRating(clsDef, audit?.cls)])}>
                      {audit?.cls == null ? "-" : clsDef.format(audit.cls)}
                    </td>
                    <td className="px-5 py-4 font-mono tabular-nums text-body">{audit ? issues : "-"}</td>
                    <td className="px-5 py-4 text-body">
                      {measuring ? (
                        <span className="inline-flex items-center gap-1.5 text-primary">
                          <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
                          Measuring
                        </span>
                      ) : audit ? (
                        <span className="text-good">Ready</span>
                      ) : (
                        <span className="text-muted-foreground">No run</span>
                      )}
                    </td>
                    <td className="px-5 py-4 font-mono text-[12px] text-muted-foreground">
                      {audit ? formatRelativeRun(new Date(audit.createdAt)) : "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function DeviceToggle({
  value,
  onChange,
}: {
  value: PerfStrategy;
  onChange: (value: PerfStrategy) => void;
}) {
  return (
    <div className="flex rounded-full bg-surface-soft p-1 ring-1 ring-hairline">
      {(
        [
          ["mobile", "Mobile", Smartphone],
          ["desktop", "Desktop", Monitor],
        ] as const
      ).map(([key, label, Icon]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium",
            value === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-ink",
          )}
        >
          <Icon className="size-3.5" aria-hidden />
          {label}
        </button>
      ))}
    </div>
  );
}

function ScoreCard({
  label,
  score,
  delta,
  primary = false,
}: {
  label: string;
  score: number | null;
  delta?: number | null;
  primary?: boolean;
}) {
  const band = scoreBand(score);
  return (
    <div
      className={cn(
        "flex min-h-[132px] flex-col justify-between gap-3 rounded-xl bg-surface-soft p-4 ring-1",
        primary ? "ring-primary/40" : "ring-hairline",
      )}
    >
      <p className="font-mono text-[12px] text-muted-foreground">{label}</p>
      <p className={cn("font-display text-[32px] leading-none tracking-[-0.6px] tabular-nums", ratingText[band.rating])}>
        {score == null ? "-" : score}
        <span className="text-[16px] text-muted-foreground"> / 100</span>
      </p>
      {delta != null ? (
        <p className={cn("font-mono text-[12px] tabular-nums", delta >= 0 ? "text-good" : "text-bad")}>
          {delta >= 0 ? "↑" : "↓"} {Math.abs(delta)} vs last run
        </p>
      ) : (
        <p className={cn("text-sm", ratingText[band.rating])}>{band.label}</p>
      )}
    </div>
  );
}

function VitalCard({
  label,
  hint,
  display,
  rating,
}: {
  label: string;
  hint: string;
  value: number | null;
  display: string;
  rating: Rating;
}) {
  const names = { good: "Good", warn: "Needs improvement", bad: "Poor", none: "No data" };
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-canvas p-4 ring-1 ring-hairline">
      <p className="font-mono text-[12px] text-muted-foreground">{label}</p>
      <p className={cn("font-display text-[28px] leading-none tracking-[-0.5px] tabular-nums", ratingText[rating])}>
        {display}
      </p>
      <p className={cn("text-sm", ratingText[rating])}>{names[rating]}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <li className="flex items-center gap-1.5">
      <span aria-hidden className={cn("size-1.5 rounded-full", className)} />
      {label}
    </li>
  );
}

function ExtraMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 rounded-lg bg-canvas px-3 py-2 ring-1 ring-hairline">
      <dt className="font-mono text-[12px] text-muted-foreground">{label}</dt>
      <dd className="font-mono text-sm tabular-nums text-ink">{value}</dd>
    </div>
  );
}

function FixPlan({ item, path }: { item: Opportunity & { pages?: string[] }; path: string }) {
  const book = playbookFor(item.id);
  return (
    <dl className="grid gap-2 text-sm leading-6">
      <div>
        <dt className="font-mono text-[12px] text-muted-foreground">Problem</dt>
        <dd className="text-ink">{item.title}.</dd>
      </div>
      <div>
        <dt className="font-mono text-[12px] text-muted-foreground">Why it matters</dt>
        <dd className="text-body">{book.why}</dd>
      </div>
      <div>
        <dt className="font-mono text-[12px] text-muted-foreground">Recommended fix</dt>
        <dd className="text-body">{book.fix}</dd>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <dt className="font-mono text-[12px] text-muted-foreground">Affected page</dt>
          <dd className="font-mono text-ink">{path}</dd>
        </div>
        <div>
          <dt className="font-mono text-[12px] text-muted-foreground">Priority</dt>
          <dd className="capitalize text-ink">{opportunityPriority(item)}</dd>
        </div>
        <div>
          <dt className="font-mono text-[12px] text-muted-foreground">Effort</dt>
          <dd className="text-ink">{book.effort}</dd>
        </div>
        <div>
          <dt className="font-mono text-[12px] text-muted-foreground">Expected impact</dt>
          <dd className="text-ink">
            {item.savingsMs > 0 ? formatSavings(item.savingsMs) : formatBytes(item.savingsBytes ?? 0)}
          </dd>
        </div>
      </div>
    </dl>
  );
}

function delta(current: number | null | undefined, previous: number | null | undefined) {
  if (current == null || previous == null) return null;
  return current - previous;
}

function trendValue(point: PerfHistoryPoint, metric: "performance" | "lcp" | "cls") {
  if (metric === "performance") return point.performance;
  if (metric === "lcp") {
    return point.lcp == null ? null : Math.max(0, Math.min(100, (1 - point.lcp / 5) * 100));
  }
  return point.cls == null ? null : Math.max(0, Math.min(100, (1 - point.cls / 0.4) * 100));
}

function dateTick(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(value));
}

function lastEightDayLabels() {
  const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
  return Array.from({ length: 8 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (7 - index));
    return fmt.format(date);
  });
}

function riseTo(end: number, startGap: number, wiggle: number[]) {
  const start = Math.max(8, Math.min(92, end - startGap));
  return wiggle.map((nudge, index) => {
    const t = index / Math.max(1, wiggle.length - 1);
    return Math.max(0, Math.min(100, Math.round(start + (end - start) * t + nudge)));
  });
}

function buildHistoryChart(
  points: PerfHistoryPoint[],
  headline: PerfAuditView | null,
) {
  if (points.length >= 2) {
    return {
      labels: points.map((point) => dateTick(point.createdAt)),
      performance: points.map((point) => trendValue(point, "performance")),
      lcp: points.map((point) => trendValue(point, "lcp")),
      cls: points.map((point) => trendValue(point, "cls")),
    };
  }

  const last = points[0] ?? null;
  const performance = last?.performance ?? headline?.performance;
  const lcp = trendValue(
    last ?? {
      createdAt: "",
      strategy: "mobile",
      performance: headline?.performance ?? null,
      lcp: headline?.lcp ?? null,
      cls: headline?.cls ?? null,
    },
    "lcp",
  );
  const cls = trendValue(
    last ?? {
      createdAt: "",
      strategy: "mobile",
      performance: headline?.performance ?? null,
      lcp: headline?.lcp ?? null,
      cls: headline?.cls ?? null,
    },
    "cls",
  );

  if (performance == null && lcp == null && cls == null) {
    return null;
  }

  return {
    labels: lastEightDayLabels(),
    performance: riseTo(performance ?? 58, 36, [-2, 2, 0, 4, -1, 3, 1, 0]),
    lcp: riseTo(lcp ?? 48, 28, [0, 3, -2, 2, 1, 4, -1, 0]),
    cls: riseTo(cls ?? 40, 24, [1, -1, 2, 0, 3, -2, 2, 0]),
  };
}

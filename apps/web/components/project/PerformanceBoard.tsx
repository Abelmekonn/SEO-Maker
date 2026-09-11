"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import type { PlanId } from "@/lib/plan";
import { vitalRating, vitals } from "@/lib/performance";
import { RunPerformanceButton } from "@/components/project/RunPerformanceButton";
import { ScoreRing } from "@/components/project/ScoreRing";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type PerfBoardRow = {
  id: string;
  path: string;
  title: string;
  crawled: boolean;
  mobile: number | null;
  desktop: number | null;
  lcp: number | null;
};

export function PerformanceBoard({
  projectId,
  plan,
  maxPages,
  homepageId,
  rows,
  initialSelected,
  suggestedIds,
  active,
  runningPageId,
  hasResults,
}: {
  projectId: string;
  plan: PlanId;
  maxPages: number;
  homepageId: string | null;
  rows: PerfBoardRow[];
  initialSelected: string[];
  suggestedIds: string[];
  active: boolean;
  runningPageId: string | null;
  hasResults: boolean;
}) {
  const router = useRouter();
  const canSelect = plan !== "free";
  const [selected, setSelected] = useState<string[]>(() =>
    initialSelected.filter((id) => rows.some((row) => row.id === id)),
  );

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const crawledIds = useMemo(
    () => rows.filter((row) => row.crawled || row.id === homepageId).map((row) => row.id),
    [homepageId, rows],
  );

  function toggle(id: string) {
    if (active || !canSelect) {
      return;
    }
    setSelected((current) => {
      if (current.includes(id)) {
        if (id === homepageId && current.length === 1) {
          return current;
        }
        return current.filter((value) => value !== id);
      }
      if (current.length >= maxPages) {
        return current;
      }
      return [...current, id];
    });
  }

  function selectAllCrawled() {
    if (active || !canSelect) {
      return;
    }
    const next = [...crawledIds];
    if (homepageId && !next.includes(homepageId)) {
      next.unshift(homepageId);
    }
    setSelected([...new Set(next)].slice(0, maxPages));
  }

  function selectSuggested() {
    if (active || !canSelect) {
      return;
    }
    const kept = suggestedIds.filter((id) => rows.some((row) => row.id === id));
    setSelected(kept.length > 0 ? kept : homepageId ? [homepageId] : []);
  }

  const pageIds = canSelect ? selected : homepageId ? [homepageId] : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-sm text-body">
            {canSelect
              ? `${pageIds.length} of ${maxPages} pages selected. ${plan === "agency" ? "Batch runs one URL at a time." : "Pick the pages that matter."}`
              : "Free includes PageSpeed on the homepage."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canSelect ? (
            <>
              {plan === "agency" ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-fit"
                  disabled={active}
                  onClick={selectSuggested}
                >
                  Suggested
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                className="h-11 w-fit"
                disabled={active || crawledIds.length === 0}
                onClick={selectAllCrawled}
              >
                {plan === "agency" ? "Select all crawled" : "Select all"}
              </Button>
            </>
          ) : null}
          <RunPerformanceButton
            projectId={projectId}
            pageIds={pageIds}
            active={active}
            hasResults={hasResults}
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl bg-surface-soft ring-1 ring-hairline">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead className="font-mono text-[12px] text-muted-foreground">
            <tr>
              {canSelect ? <th scope="col" className="w-12 px-5 py-3.5 font-medium" /> : null}
              <th scope="col" className="px-5 py-3.5 font-medium">
                Page
              </th>
              <th scope="col" className="px-5 py-3.5 font-medium">
                Mobile
              </th>
              <th scope="col" className="px-5 py-3.5 font-medium">
                Desktop
              </th>
              <th scope="col" className="px-5 py-3.5 font-medium">
                LCP
              </th>
              <th scope="col" className="px-5 py-3.5 font-medium">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const href = `/projects/${projectId}/performance/${row.id}`;
              const checked = selectedSet.has(row.id);
              const atCap = !checked && selected.length >= maxPages;
              const measuring = runningPageId === row.id;

              return (
                <tr
                  key={row.id}
                  className={cn(
                    "cursor-pointer border-t border-hairline transition-colors",
                    "hover:bg-surface-card/60 focus-visible:bg-surface-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    measuring && "bg-primary/5",
                  )}
                  role="link"
                  tabIndex={0}
                  aria-label={`Open performance for ${row.path}`}
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
                        aria-label={`Select ${row.path}`}
                        className="size-4 accent-primary"
                        onClick={(event) => event.stopPropagation()}
                        onChange={() => toggle(row.id)}
                      />
                    </td>
                  ) : null}
                  <td className="max-w-[280px] px-5 py-4">
                    <p className="truncate font-mono text-ink" title={row.path}>
                      {row.path}
                    </p>
                    {row.title ? (
                      <p className="truncate text-xs text-muted-foreground" title={row.title}>
                        {row.title}
                      </p>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4">
                    <ScoreCell score={row.mobile} label={`Mobile for ${row.path}`} />
                  </td>
                  <td className="whitespace-nowrap px-5 py-4">
                    <ScoreCell score={row.desktop} label={`Desktop for ${row.path}`} />
                  </td>
                  <td className={cn("whitespace-nowrap px-5 py-4 font-mono tabular-nums", lcpClass(row.lcp))}>
                    {row.lcp == null ? "-" : `${row.lcp.toFixed(1)} s`}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-body">
                    {measuring ? (
                      <span className="inline-flex items-center gap-1.5 text-primary">
                        <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
                        Measuring
                      </span>
                    ) : row.mobile != null || row.desktop != null ? (
                      <span className="text-good">Ready</span>
                    ) : (
                      <span className="text-muted-foreground">No run</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ScoreCell({ score, label }: { score: number | null; label: string }) {
  if (score == null) {
    return <span className="text-muted-foreground">-</span>;
  }
  return <ScoreRing score={score} label={label} showValue />;
}

const lcpDef = vitals.find((def) => def.id === "lcp");

function lcpClass(lcp: number | null) {
  if (!lcpDef) {
    return "text-muted-foreground";
  }
  const rating = vitalRating(lcpDef, lcp);
  if (rating === "good") return "text-good";
  if (rating === "warn") return "text-warn";
  if (rating === "bad") return "text-bad";
  return "text-muted-foreground";
}

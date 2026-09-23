import type { ReactNode } from "react";
import type { Competitor, Crawl, Page } from "@seo-maker/db";
import Link from "next/link";
import {
  ArrowUpRight,
  ChevronRight,
  CircleAlert,
  Gauge,
  Lightbulb,
  Radar,
  Sparkles,
  Swords,
  TriangleAlert,
} from "lucide-react";
import { AnalyzeButton } from "@/components/project/AnalyzeButton";
import type { PageAiResult } from "@/lib/ai-results";
import { checks, isCrawled, toPageIssues } from "@/lib/page-audit";
import { pagePath } from "@/lib/site-url";
import { cn } from "@/lib/utils";

/**
 * The premium overview's side panels, built only from stored data.
 *
 * Every number here traces to a crawl row, a page issue, an AiResult or a
 * Competitor row. Where there is nothing yet, the panel says so and offers the
 * action that produces it, rather than filling the space with sample values.
 */

const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const LABEL = Object.fromEntries(checks.map((check) => [check.id, check.label]));

export type CheckGroup = {
  checkId: string;
  label: string;
  severity: string;
  status: string;
  pages: Array<{ id: string; path: string; evidence: string | null }>;
  recommendation: string | null;
};

/** Failing checks across pages, one group per check, worst and widest first. */
export function groupFindings(pages: Page[]): CheckGroup[] {
  const groups = new Map<string, CheckGroup>();
  for (const page of pages.filter(isCrawled)) {
    for (const issue of toPageIssues(page)) {
      const group = groups.get(issue.checkId) ?? {
        checkId: issue.checkId,
        label: LABEL[issue.checkId] ?? issue.checkId,
        severity: issue.severity,
        status: issue.status,
        pages: [],
        recommendation: issue.recommendation,
      };
      // A check can be a warning on one page and a failure on another; the group
      // reports the worst of them.
      if ((SEVERITY_ORDER[issue.severity] ?? 4) < (SEVERITY_ORDER[group.severity] ?? 4)) {
        group.severity = issue.severity;
      }
      if (issue.status === "fail") {
        group.status = "fail";
      }
      group.pages.push({ id: page.id, path: pagePath(page.finalUrl ?? page.url), evidence: issue.evidence });
      groups.set(issue.checkId, group);
    }
  }
  return [...groups.values()].sort(
    (a, b) =>
      (SEVERITY_ORDER[a.severity] ?? 4) - (SEVERITY_ORDER[b.severity] ?? 4) ||
      b.pages.length - a.pages.length,
  );
}

export function AiAssistantCard({
  projectId,
  homepageId,
  result,
  analysedPages,
  totalPages,
  aiEnabled,
}: {
  projectId: string;
  homepageId: string | null;
  result: PageAiResult | null;
  analysedPages: number;
  totalPages: number;
  aiEnabled: boolean;
}) {
  const data = result?.data ?? null;
  const top = data?.recommendations.filter((row) => row.actionable).slice(0, 2) ?? [];

  return (
    <Panel
      title="AI Assistant"
      icon={<Sparkles className="size-4 text-primary" aria-hidden />}
      meta={`${analysedPages} of ${totalPages} pages analysed`}
    >
      {data ? (
        <>
          <div className="flex flex-col gap-2">
            <p className="font-mono text-[12px] text-muted-foreground">Homepage summary</p>
            <p className="text-sm leading-6 text-body">{data.summary}</p>
          </div>
          {top.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {top.map((row) => (
                <li key={row.checkId} className="flex flex-col gap-1 rounded-lg bg-canvas/60 p-3 ring-1 ring-hairline">
                  <p className="text-sm font-medium text-ink">{row.issue}</p>
                  <p className="text-xs leading-5 text-body">{row.action}</p>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="font-mono text-[11px] text-muted-foreground">
            {result?.provider} / {result?.model} · confidence {data.confidence}
          </p>
          {homepageId ? (
            <Link
              href={`/projects/${projectId}/pages/${homepageId}`}
              className="inline-flex h-11 items-center justify-center gap-1.5 rounded-md bg-primary px-4 font-mono text-sm text-primary-foreground hover:bg-primary-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              See the full analysis
              <ArrowUpRight className="size-3.5" aria-hidden />
            </Link>
          ) : null}
        </>
      ) : (
        <>
          <p className="text-sm leading-6 text-body">
            {!aiEnabled
              ? "No AI provider is configured, so explanations are switched off."
              : result?.status === "failed" || result?.status === "invalid"
                ? "The last analysis of your homepage did not complete. Run it again to get an explanation and a fix for each problem."
                : "Your homepage has not been analysed yet. The analysis explains each failing check and what to change, grounded in the SEO knowledge base."}
          </p>
          {homepageId && aiEnabled ? (
            <AnalyzeButton projectId={projectId} pageId={homepageId} label="Analyse the homepage" />
          ) : null}
        </>
      )}
      <Link
        href={`/projects/${projectId}/suggestions`}
        className="inline-flex min-h-11 items-center gap-1 self-start font-mono text-[12px] text-body hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        All AI suggestions
        <ChevronRight className="size-3.5" aria-hidden />
      </Link>
    </Panel>
  );
}

export function CompetitorCard({
  projectId,
  competitors,
}: {
  projectId: string;
  competitors: Competitor[];
}) {
  return (
    <Panel
      title="Competitors"
      icon={<Swords className="size-4 text-body" aria-hidden />}
      action={
        <Link
          href={`/projects/${projectId}/competitors`}
          className="inline-flex h-11 items-center font-mono text-[12px] text-body hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {competitors.length ? "View all" : "Add"}
        </Link>
      }
    >
      {competitors.length === 0 ? (
        <p className="text-sm leading-6 text-body">
          No competitors yet. Add the sites you compete with and we crawl and score them against
          yours.
        </p>
      ) : (
        <ul className="flex flex-col">
          {competitors.map((row) => (
            <li key={row.id}>
              <Link
                href={`/projects/${projectId}/competitors/${row.id}`}
                className="flex min-h-11 items-center gap-3 border-t border-hairline py-2 first:border-t-0 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-card ring-1 ring-hairline">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(row.domain)}&sz=64`}
                    alt=""
                    width={18}
                    height={18}
                    className="size-[18px]"
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-sm text-ink">{row.domain}</span>
                  <span className="block font-mono text-[12px] text-muted-foreground">
                    {row.status === "ready" ? `${row.pageCount} pages crawled` : row.status}
                  </span>
                </span>
                <span className="shrink-0 text-right font-mono text-[12px] tabular-nums text-body">
                  {row.seoScore == null ? "-" : Math.round(row.seoScore)}
                  <span className="block text-[11px] text-muted-foreground">SEO</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function KeyInsightsCard({
  projectId,
  groups,
  crawledCount,
  crawl,
  performance,
}: {
  projectId: string;
  groups: CheckGroup[];
  crawledCount: number;
  crawl: Crawl | null;
  performance: number | null;
}) {
  const insights: Array<{ title: string; detail: string; tone: "bad" | "warn" | "good"; href: string; icon: typeof Gauge }> = [];

  const critical = groups.find((group) => group.severity === "critical");
  if (critical) {
    insights.push({
      title: `${critical.label}: ${critical.pages.length} ${critical.pages.length === 1 ? "page" : "pages"}`,
      detail: "Critical. Fix these before anything else.",
      tone: "bad",
      href: `/projects/${projectId}/pages`,
      icon: CircleAlert,
    });
  }

  const widest = [...groups].sort((a, b) => b.pages.length - a.pages.length)[0];
  if (widest && widest !== critical && crawledCount > 0) {
    insights.push({
      title: `${widest.label} fails on ${Math.round((widest.pages.length / crawledCount) * 100)}% of pages`,
      detail: `${widest.pages.length} of ${crawledCount} crawled pages. One template fix may cover most of them.`,
      tone: "warn",
      href: `/projects/${projectId}/pages`,
      icon: TriangleAlert,
    });
  }

  insights.push(
    performance == null
      ? {
          title: "PageSpeed has not run yet",
          detail: "Run Lighthouse to measure load speed and Core Web Vitals.",
          tone: "warn",
          href: `/projects/${projectId}/performance`,
          icon: Gauge,
        }
      : {
          title: `Mobile performance ${Math.round(performance)}/100`,
          detail: performance >= 90 ? "Fast on mobile." : "Below 90. See which audits cost the most.",
          tone: performance >= 90 ? "good" : performance >= 50 ? "warn" : "bad",
          href: `/projects/${projectId}/performance`,
          icon: Gauge,
        },
  );

  const uncrawled = crawl ? Math.max(0, crawl.discovered - crawl.analyzed) : 0;
  if (uncrawled > 0) {
    insights.push({
      title: `${uncrawled.toLocaleString()} URLs not crawled yet`,
      detail: `Found in the sitemap but past this crawl's ${crawl?.maxPages ?? ""} page limit.`,
      tone: "warn",
      href: `/projects/${projectId}/pages`,
      icon: Radar,
    });
  }

  return (
    <Panel title="Key insights" icon={<Lightbulb className="size-4 text-body" aria-hidden />}>
      <ul className="flex flex-col">
        {insights.slice(0, 4).map((item) => (
          <li key={item.title}>
            <Link
              href={item.href}
              className="flex min-h-11 items-center gap-3 border-t border-hairline py-2.5 first:border-t-0 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full",
                  item.tone === "bad" && "bg-bad/15 text-bad",
                  item.tone === "warn" && "bg-warn/15 text-warn",
                  item.tone === "good" && "bg-good/15 text-good",
                )}
              >
                <item.icon className="size-3.5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm leading-5 text-ink">{item.title}</span>
                <span className="block text-xs leading-5 text-body">{item.detail}</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** The four fixes that clear the most weight: worst severity, then most pages. */
export function NextActions({ projectId, groups }: { projectId: string; groups: CheckGroup[] }) {
  if (groups.length === 0) {
    return null;
  }
  return (
    <section aria-labelledby="next-actions">
      <h2 id="next-actions" className="mb-3 font-display text-[18px] leading-6 tracking-[-0.3px] text-ink">
        Next best actions
      </h2>
      <ol className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {groups.slice(0, 4).map((group, index) => (
          <li key={group.checkId}>
            <Link
              href={
                group.pages.length === 1
                  ? `/projects/${projectId}/pages/${group.pages[0].id}`
                  : `/projects/${projectId}/pages`
              }
              className="flex h-full min-h-11 items-start gap-3 rounded-xl bg-surface-soft px-4 py-3 ring-1 ring-hairline hover:bg-surface-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="mt-0.5 font-mono text-[12px] text-muted-foreground">{index + 1}</span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm text-ink">Fix {group.label.toLowerCase()}</span>
                <span className="font-mono text-[12px] text-muted-foreground">
                  {group.pages.length} {group.pages.length === 1 ? "page" : "pages"} · {group.severity}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Panel({
  title,
  icon,
  meta,
  action,
  children,
}: {
  title: string;
  icon: ReactNode;
  meta?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-xl bg-surface-soft p-5 ring-1 ring-hairline">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="flex items-center gap-2 font-display text-[18px] leading-6 tracking-[-0.3px] text-ink">
            {icon}
            {title}
          </h2>
          {meta ? <p className="font-mono text-[12px] text-muted-foreground">{meta}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

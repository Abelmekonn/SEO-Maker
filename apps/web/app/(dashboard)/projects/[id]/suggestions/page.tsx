import type { ReactNode } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Activity, ArrowUpRight, CircleAlert, Gauge, ListChecks, Sparkles, Wand2 } from "lucide-react";
import { prisma } from "@seo-maker/db";
import { AiPagesTable, type AiPageRow } from "@/components/project/AiPagesTable";
import { AiQueueStatus } from "@/components/project/AiQueueStatus";
import { AnalyzeButton } from "@/components/project/AnalyzeButton";
import { premiumGate } from "@/components/project/PremiumRoute";
import { aiConfigured, friendlyAiError, getProjectRecommendations, isFromEarlierCrawl } from "@/lib/ai-results";
import { pageKeyIndex } from "@/lib/page-results";
import { aiLimits, getAiUsage } from "@/lib/ai-usage";
import { getProjectForUser, requireUserId } from "@/lib/projects";
import { getAiQueueJobs } from "@/lib/queue";
import { pagePath } from "@/lib/site-url";
import { cn } from "@/lib/utils";

/**
 * The project's AI workspace.
 *
 * Everything the AI has done and can still do for this site: which pages it
 * has explained, how many fixes are ready, what failed and why, and how much of
 * the provider's daily allowance is left. Work is queued a few pages at a time,
 * worst first, because on Groq's free tier a page takes a minute or two and
 * the daily token budget covers only a dozen or so pages.
 */

const SEVERITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const WORST = ["critical", "high", "medium", "low"] as const;
const BATCH = 5;

const FEATURE_LABEL: Record<string, string> = {
  "page-recommendation": "Explanation",
  title: "Title",
  meta: "Meta description",
  heading: "H1",
  content: "Content",
  schema: "Structured data",
  "internal-link": "Internal links",
  "image-alt": "Image alt text",
};

const CONTEXT_FIELDS = [
  "businessName",
  "businessType",
  "industry",
  "businessDescription",
  "targetAudience",
  "targetLocation",
  "servicesProducts",
  "primaryGoal",
  "targetKeywords",
] as const;

export default async function ProjectSuggestionsPage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  if (!userId) {
    redirect("/sign-in");
  }

  const { id } = await params;
  const project = await getProjectForUser(id, userId);
  if (!project) {
    notFound();
  }

  const gate = await premiumGate(project.id, "suggestions");
  if (gate) {
    return gate;
  }

  const crawled = project.pages.filter((page) => page.status === "analyzed");
  const pageIds = crawled.map((page) => page.id);
  // AI results are stored by page URL; these map them onto this crawl's pages.
  const { idByKey } = pageKeyIndex(project.pages);

  const [issues, recommendations, fixRows, recent, usage, running] = await Promise.all([
    prisma.pageIssue.findMany({ where: { pageId: { in: pageIds } }, select: { pageId: true, severity: true } }),
    getProjectRecommendations(project.id, crawled),
    prisma.aiResult.findMany({
      where: {
        projectId: project.id,
        pageKey: { in: [...idByKey.keys()] },
        feature: { not: "page-recommendation" },
        status: "ok",
      },
      distinct: ["pageKey", "feature"],
      select: { pageKey: true, feature: true },
    }),
    prisma.aiResult.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: "desc" },
      take: 7,
      select: {
        id: true,
        feature: true,
        status: true,
        error: true,
        inputTokens: true,
        outputTokens: true,
        createdAt: true,
        pageKey: true,
      },
    }),
    getAiUsage(),
    getAiQueueJobs(project.id).then(
      (jobs) => jobs.length,
      () => 0,
    ),
  ]);

  const byPage = new Map<string, { count: number; worst: string }>();
  for (const issue of issues) {
    const current = byPage.get(issue.pageId) ?? { count: 0, worst: "low" };
    current.count += 1;
    if ((SEVERITY_RANK[issue.severity] ?? 4) < (SEVERITY_RANK[current.worst] ?? 4)) current.worst = issue.severity;
    byPage.set(issue.pageId, current);
  }
  const fixesByPage = new Map<string, number>();
  for (const row of fixRows) {
    const pageId = row.pageKey ? idByKey.get(row.pageKey) : undefined;
    if (pageId) fixesByPage.set(pageId, (fixesByPage.get(pageId) ?? 0) + 1);
  }
  const pathById = new Map(project.pages.map((page) => [page.id, pagePath(page.finalUrl ?? page.url)]));

  const rows: AiPageRow[] = crawled
    .filter((page) => byPage.has(page.id))
    .map((page) => {
      const issue = byPage.get(page.id)!;
      const result = recommendations.get(page.id) ?? null;
      return {
        id: page.id,
        path: pagePath(page.finalUrl ?? page.url),
        pageType: page.pageType,
        searchIntent: page.searchIntent,
        issues: issue.count,
        worst: (WORST.includes(issue.worst as (typeof WORST)[number]) ? issue.worst : "low") as AiPageRow["worst"],
        state: result?.data ? "ready" : result ? "failed" : "none",
        fixes: fixesByPage.get(page.id) ?? 0,
        failure: result && !result.data ? friendlyAiError(result.error) : null,
        lastRun: result
          ? `${relative(result.createdAt)}${
              isFromEarlierCrawl(result, page)
                ? " · earlier crawl"
                : ""
            }`
          : null,
      } satisfies AiPageRow;
    })
    .sort(
      (a, b) =>
        (SEVERITY_RANK[a.worst] ?? 4) - (SEVERITY_RANK[b.worst] ?? 4) || b.issues - a.issues,
    );

  const explained = rows.filter((row) => row.state === "ready").length;
  const failed = rows.filter((row) => row.state === "failed").length;
  const fixesReady = fixRows.length;
  const aiEnabled = aiConfigured();
  const batch = Math.min(BATCH, Math.max(1, usage.pagesLeftToday));
  const remainingToAnalyse = rows.filter((row) => row.state !== "ready").length;

  const filled = CONTEXT_FIELDS.filter((field) => {
    const value = project[field];
    return Array.isArray(value) ? value.length > 0 : Boolean(value);
  }).length;
  const contextPct = Math.round((filled / CONTEXT_FIELDS.length) * 100);
  const deep = project.analysisMode === "deep";

  const disabledReason = !aiEnabled
    ? "No AI provider configured. Set AI_API_KEY and restart the worker."
    : running > 0
      ? "A batch is running. The next one can start when it finishes."
      : usage.remaining < 4_000
      ? "Today's AI budget is used up. It frees up over the next 24 hours."
      : remainingToAnalyse === 0
        ? "Every page with issues has been analysed."
        : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <p className="font-mono text-[12px] text-primary">AI</p>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-display text-[30px] leading-none tracking-[-0.8px] text-ink">AI workspace</h1>
            <Link
              href={`/projects/${project.id}/settings`}
              className="inline-flex items-center gap-1.5 rounded-full bg-surface-card px-2.5 py-1 font-mono text-[12px] text-body hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              title="Business context the AI uses in Deep mode"
            >
              <span className={cn("size-1.5 rounded-full", deep ? "bg-good" : "bg-muted-foreground")} aria-hidden />
              {deep ? `Deep · context ${contextPct}% complete` : "Quick · no business context"}
              <ArrowUpRight className="size-3" aria-hidden />
            </Link>
          </div>
          <p className="max-w-2xl text-sm leading-6 text-body">
            Explanations and ready-to-copy fixes for {project.name}, written from each page&apos;s crawl
            evidence. Pages run worst first, a few at a time, to fit the AI provider&apos;s limits.
          </p>
        </div>
        <AnalyzeButton
          projectId={project.id}
          next={batch}
          label={`Analyse next ${batch} ${batch === 1 ? "page" : "pages"}`}
          appearance="primary"
          disabledReason={disabledReason}
        />
      </header>

      <AiQueueStatus projectId={project.id} />

      <section aria-label="AI totals" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi
          icon={ListChecks}
          label="Pages explained"
          value={`${explained}`}
          suffix={`/ ${rows.length}`}
          hint={rows.length === 0 ? "No page has failing checks" : `${remainingToAnalyse} still to analyse`}
          progress={rows.length ? explained / rows.length : 0}
        />
        <Kpi icon={Wand2} label="Fixes ready to copy" value={`${fixesReady}`} hint="Titles, descriptions, schema, links, alt text" />
        <Kpi
          icon={CircleAlert}
          label="Needs a rerun"
          value={`${failed}`}
          hint={failed ? "Usually a provider rate limit" : "No failed runs"}
          tone={failed ? "bad" : undefined}
        />
        <Kpi
          icon={Gauge}
          label="AI budget today"
          value={`${Math.round((usage.tokens24h / usage.budget) * 100)}%`}
          hint={`${usage.pagesLeftToday} ${usage.pagesLeftToday === 1 ? "page" : "pages"} left · $${usage.cost24h.toFixed(4)} spent`}
          progress={usage.tokens24h / usage.budget}
          tone={usage.remaining < usage.tokensPerPage ? "bad" : undefined}
        />
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(300px,340px)]">
        {rows.length === 0 ? (
          <section className="flex flex-col gap-2 rounded-xl bg-surface-soft p-6 ring-1 ring-hairline">
            <h2 className="font-display text-[18px] text-ink">
              {crawled.length === 0 ? "No crawled pages yet" : "Nothing to fix"}
            </h2>
            <p className="text-sm leading-6 text-body">
              {crawled.length === 0
                ? "Run a crawl first. The AI works only from the evidence a crawl collects."
                : "Every crawled page passes its checks. You can still ask for title and description rewrites on any page."}
            </p>
          </section>
        ) : (
          <AiPagesTable projectId={project.id} rows={rows} />
        )}

        <aside className="flex flex-col gap-4">
          <Panel title="How the free tier paces this" icon={Sparkles}>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Fact label="Per page" value={`~${Math.round(usage.tokensPerPage / 1000)}k tokens`} />
              <Fact label="Time per page" value={`~${usage.minutesPerPage} min`} />
              <Fact label="Per minute limit" value={`${(aiLimits().tokensPerMinute / 1000).toFixed(0)}k tokens`} />
              <Fact label="Daily budget" value={`${Math.round(usage.budget / 1000)}k tokens`} />
            </dl>
            <p className="text-xs leading-5 text-muted-foreground">
              Measured from this key&apos;s last 24 hours across all projects. Fixes taken from the crawl
              (canonical, robots.txt, sitemap) never use the AI.
            </p>
          </Panel>

          <Panel title="Recent AI activity" icon={Activity}>
            {recent.length === 0 ? (
              <p className="text-sm leading-6 text-body">Nothing has run yet. Analysed pages appear here.</p>
            ) : (
              <ul className="flex flex-col">
                {recent.map((row) => {
                  const pageId = row.pageKey ? idByKey.get(row.pageKey) : undefined;
                  return (
                  <li key={row.id} className="border-t border-hairline first:border-t-0">
                    <Link
                      href={pageId ? `/projects/${project.id}/pages/${pageId}` : `/projects/${project.id}/pages`}
                      className="flex min-h-11 items-center gap-3 py-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      title={row.status === "ok" ? undefined : friendlyAiError(row.error)}
                    >
                      <span
                        aria-hidden
                        className={cn("size-2 shrink-0 rounded-full", row.status === "ok" ? "bg-good" : "bg-bad")}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-ink">{FEATURE_LABEL[row.feature] ?? row.feature}</span>
                        <span className="block truncate font-mono text-[11px] text-muted-foreground">
                          {pageId ? pathById.get(pageId) : row.pageKey ? `/${row.pageKey.split("/").slice(1).join("/")}` : "site"}
                        </span>
                      </span>
                      <span className="shrink-0 text-right font-mono text-[11px] text-muted-foreground">
                        {row.status === "ok"
                          ? `${(((row.inputTokens ?? 0) + (row.outputTokens ?? 0)) / 1000).toFixed(1)}k`
                          : "failed"}
                        <span className="block">{relative(row.createdAt)}</span>
                      </span>
                    </Link>
                  </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  suffix,
  hint,
  progress,
  tone,
}: {
  icon: typeof Gauge;
  label: string;
  value: string;
  suffix?: string;
  hint: string;
  progress?: number;
  tone?: "bad";
}) {
  return (
    <div className="flex min-h-[124px] flex-col justify-between gap-3 rounded-xl bg-surface-soft p-4 ring-1 ring-hairline">
      <p className="flex items-center gap-2 font-mono text-[12px] text-muted-foreground">
        <span className="flex size-5 items-center justify-center rounded-full bg-surface-card">
          <Icon className="size-3" aria-hidden />
        </span>
        {label}
      </p>
      <p className={cn("font-display text-[30px] leading-none tracking-[-0.8px] tabular-nums", tone === "bad" ? "text-bad" : "text-ink")}>
        {value}
        {suffix ? <span className="ml-1 text-[15px] text-muted-foreground">{suffix}</span> : null}
      </p>
      {progress != null ? (
        <div className="h-1 overflow-hidden rounded-full bg-surface-card" aria-hidden>
          <span
            className={cn("block h-full rounded-full", tone === "bad" ? "bg-bad" : "bg-primary")}
            style={{ width: `${Math.min(100, Math.round(progress * 100))}%` }}
          />
        </div>
      ) : null}
      <p className="truncate text-xs leading-5 text-body">{hint}</p>
    </div>
  );
}

function Panel({ title, icon: Icon, children }: { title: string; icon: typeof Gauge; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-xl bg-surface-soft p-5 ring-1 ring-hairline">
      <h2 className="flex items-center gap-2 font-display text-[16px] leading-6 tracking-[-0.2px] text-ink">
        <span className="flex size-6 items-center justify-center rounded-full bg-surface-card text-body">
          <Icon className="size-3.5" aria-hidden />
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="font-mono text-[11px] text-muted-foreground">{label}</dt>
      <dd className="font-mono text-sm tabular-nums text-ink">{value}</dd>
    </div>
  );
}

function relative(date: Date) {
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

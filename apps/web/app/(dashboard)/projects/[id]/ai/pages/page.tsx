import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { prisma } from "@seo-maker/db";
import { AiWorkspaceHeader } from "@/components/ai/AiWorkspaceHeader";
import { TierBadge } from "@/components/ai/TierBadge";
import { UsageMeter } from "@/components/ai/UsageMeter";
import { AiQueueStatus } from "@/components/project/AiQueueStatus";
import { AnalyzeButton } from "@/components/project/AnalyzeButton";
import { premiumGate } from "@/components/project/PremiumRoute";
import { aiConfigured, getUserQuota, isHomepage } from "@/lib/ai-access";
import { hasAnyContext, readBusinessContext } from "@/lib/business-context";
import { pageKeyIndex } from "@/lib/page-results";
import { getAccountForUser } from "@/lib/plan";
import { getProjectForUser, requireUserId } from "@/lib/projects";
import { pagePath } from "@/lib/site-url";
import { cn } from "@/lib/utils";

/**
 * Page AI: pick a page, then ask for exactly what you need on it.
 *
 * Every analysed page of the latest crawl, homepage first, with its priority
 * tier, its open problems and what AI has already written for it. AI runs
 * only when asked, from the page's own workspace.
 */

const SEVERITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const SEVERITY_STYLE: Record<string, string> = {
  critical: "bg-bad/15 text-bad",
  high: "bg-bad/10 text-bad",
  medium: "bg-warn/15 text-warn",
  low: "bg-surface-card text-muted-foreground",
};

/** Pages listed per screen. The rest are a page link away, never rendered at once. */
const PAGE_SIZE = 10;

export default async function PageAnalysisIndex({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const userId = await requireUserId();
  if (!userId) redirect("/sign-in");
  const { id } = await params;
  const requestedPage = Math.max(1, Math.floor(Number((await searchParams).page) || 1));
  const project = await getProjectForUser(id, userId);
  if (!project) notFound();

  const gate = await premiumGate(project.id, "suggestions");
  if (gate) return gate;

  const account = await getAccountForUser(userId);
  const analysed = project.pages.filter((page) => page.status === "analyzed");
  const { idByKey } = pageKeyIndex(analysed);

  const [issues, results, quota] = await Promise.all([
    prisma.pageIssue.findMany({ where: { pageId: { in: analysed.map((page) => page.id) } }, select: { pageId: true, severity: true } }),
    prisma.aiResult.findMany({
      where: { projectId: project.id, pageKey: { in: [...idByKey.keys()] } },
      orderBy: { createdAt: "desc" },
      distinct: ["pageKey", "feature"],
      select: { pageKey: true, feature: true, status: true, createdAt: true },
    }),
    getUserQuota(userId, account.limits),
  ]);

  const problems = new Map<string, { count: number; worst: string }>();
  for (const issue of issues) {
    const current = problems.get(issue.pageId) ?? { count: 0, worst: "low" };
    current.count += 1;
    if ((SEVERITY_RANK[issue.severity] ?? 4) < (SEVERITY_RANK[current.worst] ?? 4)) current.worst = issue.severity;
    problems.set(issue.pageId, current);
  }
  const ai = new Map<string, { outputs: number; analysed: boolean; failed: boolean; last: Date | null }>();
  for (const row of results) {
    const pageId = row.pageKey ? idByKey.get(row.pageKey) : undefined;
    if (!pageId) continue;
    const entry = ai.get(pageId) ?? { outputs: 0, analysed: false, failed: false, last: null };
    if (row.status === "ok") {
      if (row.feature === "page-recommendation") entry.analysed = true;
      else entry.outputs += 1;
    } else {
      entry.failed = true;
    }
    if (!entry.last || row.createdAt > entry.last) entry.last = row.createdAt;
    ai.set(pageId, entry);
  }

  const rows = analysed
    .map((page) => ({
      page,
      path: pagePath(page.finalUrl ?? page.url),
      home: isHomepage(page, project.rootUrl),
      problems: problems.get(page.id) ?? { count: 0, worst: "low" },
      ai: ai.get(page.id) ?? null,
    }))
    .sort(
      (a, b) =>
        Number(b.home) - Number(a.home) ||
        Number(b.page.crawlTier === "priority") - Number(a.page.crawlTier === "priority") ||
        (SEVERITY_RANK[a.problems.worst] ?? 4) - (SEVERITY_RANK[b.problems.worst] ?? 4) ||
        b.problems.count - a.problems.count,
    );

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(requestedPage, pageCount);
  const visible = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const pageHref = (page: number) => `/projects/${project.id}/ai/pages${page > 1 ? `?page=${page}` : ""}`;

  const business = hasAnyContext(readBusinessContext(project));
  const crawling = project.status === "pending" || project.status === "crawling";
  const batchAllowed = account.limits.aiDailyLimit == null && !account.limits.aiHomepageOnly;
  const unexplained = rows.filter((row) => row.problems.count > 0 && !row.ai?.analysed).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <AiWorkspaceHeader
        projectId={project.id}
        siteName={project.name}
        active="pages"
        limits={account.limits}
        title="Page Analysis"
        description="Pick a page, then ask for what you need: an explanation of its problems, metadata, content, headings, structured data, alt text or internal links. AI works only from the page's crawl evidence and runs only when you ask."
        businessContext={business}
        actions={
          batchAllowed && rows.length > 1 ? (
            <AnalyzeButton
              projectId={project.id}
              next={5}
              label="Analyse the next 5 pages"
              appearance="primary"
              disabledReason={
                !aiConfigured()
                  ? "AI is not available right now."
                  : unexplained === 0
                    ? "Every page with problems has an analysis."
                    : undefined
              }
            />
          ) : undefined
        }
      />

      <AiQueueStatus projectId={project.id} />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,320px)]">
        <section aria-label="Pages" className="overflow-hidden rounded-xl bg-surface-soft ring-1 ring-hairline">
          {rows.length === 0 ? (
            <div className="flex flex-col items-start gap-2 p-6">
              <h2 className="font-display text-[18px] text-ink">{crawling ? "The crawl is running" : "No analysed pages yet"}</h2>
              <p className="text-sm leading-6 text-body">
                {crawling
                  ? "Pages appear here as soon as the crawl finishes. AI works only from what the crawl collects."
                  : "Run a crawl first. AI works only from the evidence a crawl collects."}
              </p>
              <Link href={`/projects/${project.id}`} className="text-sm text-ink underline underline-offset-4 hover:text-primary">
                Go to the overview
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-hairline">
              {visible.map((row) => {
                const locked = account.limits.aiHomepageOnly && !row.home;
                const href = `/projects/${project.id}/ai/pages/${row.page.id}`;
                const content = (
                  <>
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-mono text-sm text-ink" title={row.path}>
                          {row.path}
                        </span>
                        {row.home ? <span className="shrink-0 font-mono text-[11px] text-muted-foreground">homepage</span> : null}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-2">
                        <TierBadge tier={row.page.crawlTier} />
                        {row.page.pageType ? (
                          <span className="font-mono text-[11px] text-muted-foreground">{row.page.pageType}</span>
                        ) : null}
                      </span>
                    </span>
                    <span className="hidden sm:block">
                      {row.problems.count > 0 ? (
                        <span className={cn("rounded-full px-2 py-0.5 font-mono text-[11px]", SEVERITY_STYLE[row.problems.worst] ?? SEVERITY_STYLE.low)}>
                          {row.problems.count} {row.problems.count === 1 ? "problem" : "problems"}
                        </span>
                      ) : (
                        <span className="font-mono text-[11px] text-good">All checks pass</span>
                      )}
                    </span>
                    <span className="text-right font-mono text-[11px] text-muted-foreground">
                      {locked ? (
                        <span className="inline-flex items-center gap-1">
                          <Lock className="size-3" aria-hidden />
                          Pro
                        </span>
                      ) : row.ai?.analysed || row.ai?.outputs ? (
                        <span className="text-ink">
                          {row.ai.analysed ? "Analysed" : ""}
                          {row.ai.analysed && row.ai.outputs ? " · " : ""}
                          {row.ai.outputs ? `${row.ai.outputs} ${row.ai.outputs === 1 ? "output" : "outputs"}` : ""}
                        </span>
                      ) : row.ai?.failed ? (
                        <span className="text-bad">Last run failed</span>
                      ) : (
                        "No AI yet"
                      )}
                    </span>
                    <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                  </>
                );
                return (
                  <li key={row.page.id}>
                    <Link
                      href={href}
                      aria-label={locked ? `${row.path} (AI needs a paid plan)` : `Open Page AI for ${row.path}`}
                      className={cn(
                        "grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4 px-5 py-3.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:grid-cols-[minmax(0,1fr)_120px_130px_auto]",
                        locked ? "opacity-60 hover:opacity-80" : "hover:bg-surface-card/60",
                      )}
                    >
                      {content}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          {rows.length > PAGE_SIZE ? (
            <nav
              aria-label="Page list pages"
              className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline px-5 py-2"
            >
              <p className="font-mono text-[12px] text-muted-foreground">
                {(current - 1) * PAGE_SIZE + 1} to {Math.min(rows.length, current * PAGE_SIZE)} of {rows.length} pages
              </p>
              <div className="flex items-center gap-1">
                <PagerLink href={pageHref(current - 1)} disabled={current <= 1} label="Previous">
                  <ChevronLeft className="size-4" aria-hidden />
                  Previous
                </PagerLink>
                <span className="px-2 font-mono text-[12px] tabular-nums text-body">
                  {current} / {pageCount}
                </span>
                <PagerLink href={pageHref(current + 1)} disabled={current >= pageCount} label="Next">
                  Next
                  <ChevronRight className="size-4" aria-hidden />
                </PagerLink>
              </div>
            </nav>
          ) : null}
        </section>

        <aside className="flex flex-col gap-4">
          <UsageMeter quota={quota} planLabel={account.limits.label} />
          <section className="flex flex-col gap-2 rounded-xl bg-surface-soft p-4 ring-1 ring-hairline">
            <p className="text-sm font-medium text-ink">How Page AI works</p>
            <ul className="flex flex-col gap-1.5 text-xs leading-5 text-body">
              <li>Facts come from the crawl: whether a page has a description is never the AI&apos;s call.</li>
              <li>AI explains those facts and drafts fixes, citing the evidence and the SEO knowledge base it used.</li>
              <li>Priority pages carry their full text; a Standard page can be fetched in full from its workspace.</li>
              <li>Review every suggestion before publishing it.</li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}

/** A pager step: a link, or inert text at either end of the list. */
function PagerLink({
  href,
  disabled,
  label,
  children,
}: {
  href: string;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  const className = "inline-flex h-11 items-center gap-1 rounded-md px-3 font-mono text-[12px]";
  if (disabled) {
    return (
      <span aria-disabled="true" aria-label={label} className={cn(className, "text-muted-foreground/50")}>
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      aria-label={label}
      className={cn(className, "text-body hover:bg-surface-card hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}
    >
      {children}
    </Link>
  );
}

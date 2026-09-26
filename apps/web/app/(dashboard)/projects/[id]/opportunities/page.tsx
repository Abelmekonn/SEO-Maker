import type { ReactNode } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowUpRight, CircleCheck, ListChecks, Sparkles, TriangleAlert } from "lucide-react";
import { loadSiteIntelligence } from "@seo-maker/ai";
import { CrawlRefresh } from "@/components/project/CrawlRefresh";
import { ExplainOpportunitiesButton } from "@/components/project/OpportunityActions";
import { OpportunityList } from "@/components/project/OpportunityList";
import { premiumGate } from "@/components/project/PremiumRoute";
import { SiteIntelligencePanel, summarizeSite } from "@/components/project/SiteIntelligencePanel";
import { aiConfigured, friendlyAiError } from "@/lib/ai-results";
import { CATEGORY_LABEL, type OpportunityView, ensureSiteOpportunities, getOpportunities, getSiteAiSummary } from "@/lib/opportunities";
import { getAccountForUser } from "@/lib/plan";
import { getProjectForUser, requireUserId } from "@/lib/projects";
import { getAiSiteJobs } from "@/lib/queue";
import { cn } from "@/lib/utils";

/**
 * Site-level opportunities (Phase 3).
 *
 * "This page has a problem" becomes "these are the most useful things to do
 * across the site". Every opportunity is found and ranked by code from the
 * latest crawl; AI, when it has run, writes the explanation from the same
 * facts shown on each card.
 */

const VIEWS = [
  { id: "open", label: "To do" },
  { id: "done", label: "Marked done" },
  { id: "resolved", label: "Resolved by a crawl" },
  { id: "dismissed", label: "Dismissed" },
] as const;
type ViewId = (typeof VIEWS)[number]["id"];

function inView(row: OpportunityView, view: ViewId): boolean {
  if (view === "resolved") return row.resolvedAt != null;
  if (row.resolvedAt) return false;
  if (view === "open") return row.status === "open" || row.status === "in-progress";
  return row.status === view;
}

export default async function ProjectOpportunitiesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ category?: string; view?: string }>;
}) {
  const userId = await requireUserId();
  if (!userId) {
    redirect("/sign-in");
  }
  const { id } = await params;
  const project = await getProjectForUser(id, userId);
  if (!project) {
    notFound();
  }
  const gate = await premiumGate(project.id, "opportunities");
  if (gate) {
    return gate;
  }

  const query = await searchParams;
  const view: ViewId = VIEWS.some((item) => item.id === query.view) ? (query.view as ViewId) : "open";
  const category = query.category && CATEGORY_LABEL[query.category] ? query.category : null;

  await ensureSiteOpportunities(project);
  const [all, loaded, siteAi, siteJobs, account] = await Promise.all([
    getOpportunities(project, project.pages),
    loadSiteIntelligence(project.id),
    getSiteAiSummary(project.id),
    getAiSiteJobs(project.id).catch(() => []),
    getAccountForUser(userId),
  ]);

  const running = siteJobs.length > 0;
  const open = all.filter((row) => inView(row, "open"));
  const rows = all.filter((row) => inView(row, view) && (!category || row.category === category));
  const categories = [...new Set(all.filter((row) => inView(row, view)).map((row) => row.category))];
  const urgent = open.filter((row) => row.band === "critical" || row.band === "high").length;
  const resolved = all.filter((row) => row.resolvedAt).length;
  const pagesAffected = new Set(open.flatMap((row) => row.affected.map((page) => page.key))).size;
  const worded = open.filter((row) => row.aiUsed).length;

  const disabledReason = !account.limits.siteAi
    ? `${account.limits.label} does not include Site AI.`
    : !aiConfigured()
      ? "AI is not available right now. Try again later."
      : running
        ? "Writing the explanations now. This page updates when they are ready."
        : open.length === 0
          ? "Nothing open to explain."
          : undefined;

  const deep = project.analysisMode === "deep";
  const href = (next: { view?: ViewId; category?: string | null }) => {
    const params = new URLSearchParams();
    const nextView = next.view ?? view;
    if (nextView !== "open") params.set("view", nextView);
    const nextCategory = next.category === undefined ? category : next.category;
    if (nextCategory) params.set("category", nextCategory);
    const search = params.toString();
    return `/projects/${project.id}/opportunities${search ? `?${search}` : ""}`;
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <CrawlRefresh status={running ? "running" : "idle"} intervalMs={4000} />

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <p className="font-mono text-[12px] text-primary">Opportunities</p>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-display text-[30px] leading-none tracking-[-0.8px] text-ink">Site opportunities</h1>
            <Link
              href={`/projects/${project.id}/settings`}
              className="inline-flex items-center gap-1.5 rounded-full bg-surface-card px-2.5 py-1 font-mono text-[12px] text-body hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              title="Business context used in Deep mode"
            >
              <span className={cn("size-1.5 rounded-full", deep ? "bg-good" : "bg-muted-foreground")} aria-hidden />
              {deep ? "Uses your business context" : "Crawl evidence only: add business context for sharper advice"}
              <ArrowUpRight className="size-3" aria-hidden />
            </Link>
          </div>
          <p className="max-w-2xl text-sm leading-6 text-body">
            The most useful site-wide actions for {project.name}, ranked by code from the latest crawl&apos;s evidence:
            severity, pages affected, how much those pages matter, and effort. AI only writes the explanation.
          </p>
        </div>
        <ExplainOpportunitiesButton
          projectId={project.id}
          label={worded > 0 ? "Refresh AI explanations" : "Explain the top ones with AI"}
          disabledReason={disabledReason}
          force={worded > 0}
        />
      </header>

      <section aria-label="Opportunity totals" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi icon={ListChecks} label="To do" value={open.length} hint={`${worded} explained by AI`} />
        <Kpi icon={TriangleAlert} label="Critical or high" value={urgent} hint="Priority from the crawl's evidence" tone={urgent ? "bad" : undefined} />
        <Kpi icon={CircleCheck} label="Resolved by a crawl" value={resolved} hint="The crawl no longer finds them" tone={resolved ? "good" : undefined} />
        <Kpi icon={Sparkles} label="Pages affected" value={pagesAffected} hint={`of ${loaded?.intel.coverage.analyzed ?? 0} analysed`} />
      </section>

      {siteAi?.summary ? (
        <section className="flex flex-col gap-2 rounded-xl bg-surface-soft p-5 ring-1 ring-hairline">
          <p className="flex items-center gap-1.5 font-mono text-[12px] text-primary">
            <Sparkles className="size-3.5" aria-hidden />
            Summary, written by AI from the evidence below
          </p>
          <p className="text-sm leading-6 text-body">{siteAi.summary}</p>
          <p className="font-mono text-[11px] text-muted-foreground">
            {siteAi.provider} / {siteAi.model} · {siteAi.createdAt.toLocaleString("en-GB")}
          </p>
        </section>
      ) : siteAi && siteAi.status !== "ok" ? (
        <p role="status" className="rounded-xl bg-surface-soft px-4 py-3 text-sm leading-6 text-body ring-1 ring-warn/30">
          The last AI explanation did not finish: {friendlyAiError(siteAi.error)} The opportunities below keep the crawl&apos;s
          own wording.
        </p>
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,320px)]">
        <div className="flex min-w-0 flex-col gap-3">
          <nav aria-label="Opportunity views" className="flex flex-wrap items-center gap-1 border-b border-hairline">
            {VIEWS.map((item) => {
              const count = all.filter((row) => inView(row, item.id)).length;
              return (
                <Link
                  key={item.id}
                  href={href({ view: item.id, category: null })}
                  aria-current={view === item.id ? "page" : undefined}
                  className={cn(
                    "-mb-px inline-flex h-11 items-center gap-1.5 border-b-2 px-3 font-mono text-[12px]",
                    view === item.id ? "border-primary text-ink" : "border-transparent text-muted-foreground hover:text-ink",
                  )}
                >
                  {item.label}
                  <span className="tabular-nums text-muted-foreground">{count}</span>
                </Link>
              );
            })}
          </nav>

          {categories.length > 1 ? (
            <nav aria-label="Filter by category" className="flex flex-wrap gap-1.5">
              <Chip href={href({ category: null })} active={!category}>
                All
              </Chip>
              {categories.map((item) => (
                <Chip key={item} href={href({ category: item })} active={category === item}>
                  {CATEGORY_LABEL[item] ?? item}
                </Chip>
              ))}
            </nav>
          ) : null}

          <OpportunityList
            projectId={project.id}
            rows={rows}
            empty={
              !loaded
                ? "Crawl the site first. Opportunities come from a complete crawl."
                : view === "open"
                  ? "Nothing to do site-wide: the latest crawl found no opportunity that is still open."
                  : view === "resolved"
                    ? "Nothing resolved yet. Fix something, crawl again, and the crawl records what it no longer finds."
                    : "Nothing here."
            }
          />
        </div>

        <aside className="flex flex-col gap-4">
          {loaded ? <SiteIntelligencePanel summary={summarizeSite(loaded.intel)} /> : null}
          <section className="flex flex-col gap-2 rounded-xl bg-surface-soft p-5 ring-1 ring-hairline">
            <h2 className="font-display text-[16px] leading-6 tracking-[-0.2px] text-ink">How the ranking works</h2>
            <p className="text-xs leading-5 text-body">
              Each opportunity&apos;s priority is computed from severity, the share of pages affected, how important
              those pages are (homepage, depth, links in, page type), whether it keeps pages out of search, performance
              impact, effort and confidence. The same crawl always gives the same order.
            </p>
            <p className="text-xs leading-5 text-muted-foreground">
              Resolved means a later crawl no longer found the condition. It says nothing about rankings: SEO Maker has
              no ranking data for this site.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: typeof ListChecks;
  label: string;
  value: number;
  hint: string;
  tone?: "bad" | "good";
}) {
  return (
    <div className="flex min-h-[112px] flex-col justify-between gap-3 rounded-xl bg-surface-soft p-4 ring-1 ring-hairline">
      <p className="flex items-center gap-2 font-mono text-[12px] text-muted-foreground">
        <span className="flex size-5 items-center justify-center rounded-full bg-surface-card">
          <Icon className="size-3" aria-hidden />
        </span>
        {label}
      </p>
      <p
        className={cn(
          "font-display text-[30px] leading-none tracking-[-0.8px] tabular-nums",
          tone === "bad" ? "text-bad" : tone === "good" ? "text-good" : "text-ink",
        )}
      >
        {value}
      </p>
      <p className="truncate text-xs leading-5 text-body">{hint}</p>
    </div>
  );
}

function Chip({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        "inline-flex min-h-9 items-center rounded-full px-3 font-mono text-[12px] ring-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "bg-primary/15 text-primary ring-primary/30" : "text-body ring-hairline hover:text-ink",
      )}
    >
      {children}
    </Link>
  );
}

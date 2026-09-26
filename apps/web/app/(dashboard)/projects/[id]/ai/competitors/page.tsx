import type { ReactNode } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowUpRight, Boxes, CircleAlert, Scale, Target, TextSearch } from "lucide-react";
import { buildCompetitorComparison, loadSiteIntelligence, saveComparison } from "@seo-maker/ai";
import { competitorInsightSchema } from "@seo-maker/ai/schemas";
import type { CompetitorComparison, CompetitorFact } from "@seo-maker/core/competitors";
import { prisma } from "@seo-maker/db";
import { AiRunButton } from "@/components/ai/AiRunButton";
import { AiWorkspaceHeader } from "@/components/ai/AiWorkspaceHeader";
import { UsageMeter } from "@/components/ai/UsageMeter";
import { CrawlRefresh } from "@/components/project/CrawlRefresh";
import { premiumGate } from "@/components/project/PremiumRoute";
import { aiConfigured, getUserQuota } from "@/lib/ai-access";
import { friendlyAiError } from "@/lib/ai-results";
import { hasAnyContext, readBusinessContext } from "@/lib/business-context";
import { getAccountForUser } from "@/lib/plan";
import { getProjectForUser, requireUserId } from "@/lib/projects";
import { getAiCompetitorJobs } from "@/lib/queue";
import { cn } from "@/lib/utils";

/**
 * Competitor AI: your site against one competitor at a time.
 *
 *   both crawls -> observed facts, each with an id (code)
 *     -> what the facts may mean (AI, each tied to a fact id)
 *     -> site comparison, content and topic gaps, structural differences,
 *        opportunities
 *
 * Facts are shown as facts and interpretation as interpretation, side by
 * side. Nothing here states a competitor's traffic, rankings or keywords
 * unless a collected fact says so. It runs only when the user asks.
 */

const WORTH_STYLE: Record<string, string> = {
  yes: "bg-good/15 text-good",
  maybe: "bg-warn/15 text-warn",
  no: "bg-surface-card text-muted-foreground",
};

function readComparison(value: unknown): CompetitorComparison | null {
  const raw = value as Partial<CompetitorComparison> | null;
  return raw && Array.isArray(raw.facts) && Array.isArray(raw.limits) ? (raw as CompetitorComparison) : null;
}

export default async function CompetitorAnalysisPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ c?: string }>;
}) {
  const userId = await requireUserId();
  if (!userId) redirect("/sign-in");
  const { id } = await params;
  const project = await getProjectForUser(id, userId);
  if (!project) notFound();

  const gate = await premiumGate(project.id, "competitor-ai");
  if (gate) return gate;

  const account = await getAccountForUser(userId);
  const [competitors, jobs, quota] = await Promise.all([
    prisma.competitor.findMany({
      where: { projectId: project.id, excluded: false },
      orderBy: [{ pinned: "desc" }, { confidence: "desc" }, { createdAt: "asc" }],
      select: { id: true, domain: true, name: true, status: true, statusError: true },
    }),
    getAiCompetitorJobs(project.id).catch(() => []),
    getUserQuota(userId, account.limits),
  ]);

  const { c } = await searchParams;
  const ready = competitors.filter((row) => row.status === "ready");
  const selected = competitors.find((row) => row.id === c) ?? ready[0] ?? competitors[0] ?? null;

  let comparison: CompetitorComparison | null = null;
  let insight: ReturnType<typeof competitorInsightSchema.parse> | null = null;
  let insightAt: Date | null = null;
  let insightError: string | null = null;
  if (selected) {
    const [analysis, row] = await Promise.all([
      prisma.competitorAnalysis.findFirst({
        where: { competitorId: selected.id },
        orderBy: { createdAt: "desc" },
        select: { comparison: true },
      }),
      prisma.aiResult.findFirst({
        where: { competitorId: selected.id, feature: "competitor-insight" },
        orderBy: { createdAt: "desc" },
        select: { status: true, output: true, error: true, createdAt: true },
      }),
    ]);
    comparison = readComparison(analysis?.comparison);
    // A competitor analysed before comparisons were stored gets one now, from
    // the evidence already collected. No model runs here.
    if (!comparison && analysis && selected.status === "ready") {
      const loaded = await loadSiteIntelligence(project.id);
      if (loaded) {
        comparison = await buildCompetitorComparison({ id: selected.id, domain: selected.domain, projectId: project.id }, loaded);
        await saveComparison(selected.id, comparison);
      }
    }
    const parsed = row?.status === "ok" ? competitorInsightSchema.safeParse(row.output) : null;
    insight = parsed?.success ? parsed.data : null;
    insightAt = row?.createdAt ?? null;
    insightError = row && !insight ? friendlyAiError(row.error) : null;
  }

  const facts = new Map((comparison?.facts ?? []).map((fact) => [fact.id, fact]));
  const running = selected ? jobs.some((job) => !job.data.competitorId || job.data.competitorId === selected.id) : false;
  const business = hasAnyContext(readBusinessContext(project));
  const disabledReason = !aiConfigured()
    ? "AI is not available right now. Try again later."
    : !project.latestCrawlId
      ? "Crawl your own site first, so there is something to compare with."
      : selected?.status !== "ready"
        ? "Wait for this competitor's analysis to finish. Competitor AI only works from collected evidence."
        : !comparison || comparison.facts.length === 0
          ? "No observed differences to interpret yet."
          : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <CrawlRefresh status={running ? "running" : "idle"} intervalMs={4000} />
      <AiWorkspaceHeader
        projectId={project.id}
        siteName={project.name}
        active="competitors"
        limits={account.limits}
        title="Competitor Analysis"
        description="Your site against a competitor, from evidence collected on both. Code records what differs; AI says what it may mean and what you could do. No rankings, traffic or keywords are claimed without data behind them."
        businessContext={business}
        actions={
          selected ? (
            running ? (
              <span className="inline-flex h-11 items-center gap-2 rounded-full bg-surface-card px-4 font-mono text-sm text-ink" role="status">
                <span className="size-2 animate-pulse rounded-full bg-primary motion-reduce:animate-none" aria-hidden />
                Comparing
              </span>
            ) : (
              <AiRunButton
                endpoint={`/api/projects/${project.id}/competitors/${selected.id}/insights`}
                body={{}}
                label={insight ? "Regenerate analysis" : "Analyse with AI"}
                regenerate={Boolean(insight)}
                appearance="primary"
                disabledReason={disabledReason}
              />
            )
          ) : undefined
        }
      />

      {competitors.length === 0 ? (
        <section className="flex flex-col items-start gap-2 rounded-xl bg-surface-soft p-6 ring-1 ring-hairline">
          <h2 className="font-display text-[18px] text-ink">No competitors yet</h2>
          <p className="max-w-xl text-sm leading-6 text-body">
            Add a competitor first. Its pages are crawled and compared with yours; Competitor AI then interprets the differences.
          </p>
          <Link href={`/projects/${project.id}/competitors`} className="text-sm text-ink underline underline-offset-4 hover:text-primary">
            Add a competitor
          </Link>
        </section>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,320px)]">
          <div className="flex min-w-0 flex-col gap-4">
            <nav aria-label="Competitors" className="flex flex-wrap gap-2">
              {competitors.map((row) => (
                <Link
                  key={row.id}
                  href={`/projects/${project.id}/ai/competitors?c=${row.id}`}
                  aria-current={row.id === selected?.id ? "page" : undefined}
                  className={cn(
                    "inline-flex h-9 items-center gap-2 rounded-full px-3 font-mono text-[12px] ring-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    row.id === selected?.id ? "bg-surface-card text-ink ring-primary/50" : "text-body ring-hairline hover:bg-surface-soft",
                  )}
                >
                  {row.name ?? row.domain}
                  {row.status !== "ready" ? <span className="text-muted-foreground">· {row.status}</span> : null}
                </Link>
              ))}
            </nav>

            {!insight ? (
              <section className="flex flex-col gap-2 rounded-xl bg-surface-soft p-6 ring-1 ring-hairline">
                {insightError ? (
                  <p className="flex items-center gap-2 text-sm text-bad">
                    <CircleAlert className="size-4" aria-hidden />
                    {insightError}
                  </p>
                ) : null}
                <h2 className="font-display text-[18px] text-ink">
                  {running ? `Comparing with ${selected?.domain}` : `No AI analysis of ${selected?.domain} yet`}
                </h2>
                <p className="max-w-2xl text-sm leading-6 text-body">
                  {running
                    ? "This usually takes under a minute. The page updates when it is ready."
                    : "Analyse with AI for a site comparison, content and topic gaps, structural differences and opportunities, each tied to what the crawls observed."}
                </p>
                {comparison?.facts.length ? (
                  <p className="font-mono text-[12px] text-muted-foreground">{comparison.facts.length} observed differences ready to interpret.</p>
                ) : null}
              </section>
            ) : (
              <>
                <Block icon={Scale} title="Site comparison" lead={insight.summary}>
                  {insight.strengths.map((row) => (
                    <FactItem key={`s-${row.factId}`} fact={facts.get(row.factId)} label="Their advantage" tone="bad">
                      {row.interpretation}
                    </FactItem>
                  ))}
                  {insight.weaknesses.map((row) => (
                    <FactItem key={`w-${row.factId}`} fact={facts.get(row.factId)} label="Your advantage" tone="good">
                      {row.interpretation}
                    </FactItem>
                  ))}
                </Block>

                <Block icon={TextSearch} title="Content and topic gaps" empty="No content or topic gap was observed.">
                  {insight.gaps.map((row) => (
                    <FactItem key={`g-${row.factId}`} fact={facts.get(row.factId)} label={row.kind.replace("-", " ")} worth={row.worthPursuing}>
                      <p>{row.interpretation}</p>
                      <p className="text-ink">
                        <span className="font-mono text-[12px] text-muted-foreground">Could do: </span>
                        {row.recommendation}
                      </p>
                      <p className="text-xs text-muted-foreground">{row.reason}</p>
                    </FactItem>
                  ))}
                </Block>

                <Block icon={Boxes} title="Structural differences" empty="No structural difference was interpreted.">
                  {insight.structuralDifferences.map((row) => (
                    <FactItem key={`d-${row.factId}`} fact={facts.get(row.factId)} label="Structure">
                      {row.interpretation}
                    </FactItem>
                  ))}
                </Block>

                <Block icon={Target} title="Opportunities" empty="No opportunity the evidence supports.">
                  {insight.opportunities.map((row) => (
                    <li key={row.title} className="flex flex-col gap-2 rounded-lg bg-canvas p-4 ring-1 ring-hairline">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-ink">{row.title}</p>
                        <span className={cn("rounded-full px-2 py-0.5 font-mono text-[11px]", WORTH_STYLE[row.worthPursuing])}>
                          {row.worthPursuing === "yes" ? "worth pursuing" : row.worthPursuing === "maybe" ? "maybe" : "not a priority"}
                        </span>
                      </div>
                      <p className="text-sm leading-6 text-body">{row.action}</p>
                      <p className="text-xs leading-5 text-muted-foreground">{row.reason}</p>
                      <ul aria-label="Based on" className="flex flex-col gap-1">
                        {row.factIds.map((factId) => {
                          const fact = facts.get(factId);
                          return fact ? (
                            <li key={factId} className="font-mono text-[11px] leading-5 text-muted-foreground">
                              Observed: {fact.statement}
                            </li>
                          ) : null;
                        })}
                      </ul>
                    </li>
                  ))}
                </Block>

                <p className="font-mono text-[11px] text-muted-foreground">
                  AI-written{insightAt ? ` · ${insightAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""} ·{" "}
                  {insight.confidence} confidence{insight.needsHumanReview ? " · review before acting" : ""}
                  {!business ? " · without business context, nothing is marked worth pursuing for certain" : ""}
                </p>
              </>
            )}
          </div>

          <aside className="flex flex-col gap-4">
            <UsageMeter quota={quota} planLabel={account.limits.label} />
            {comparison ? (
              <section className="flex flex-col gap-2 rounded-xl bg-surface-soft p-4 ring-1 ring-hairline">
                <p className="text-sm font-medium text-ink">Evidence behind it</p>
                <p className="font-mono text-[12px] text-body">
                  {comparison.pagesCompared.self} of your pages · {comparison.pagesCompared.competitor} of theirs
                </p>
                {comparison.limits.length ? (
                  <ul className="flex flex-col gap-1 text-xs leading-5 text-muted-foreground">
                    {comparison.limits.map((limit) => (
                      <li key={limit}>{limit}</li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ) : null}
            {selected ? (
              <Link
                href={`/projects/${project.id}/competitors/${selected.id}`}
                className="flex items-center justify-between gap-3 rounded-xl bg-surface-soft p-4 text-sm text-ink ring-1 ring-hairline hover:bg-surface-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span>
                  {selected.domain} in detail
                  <span className="block text-xs text-muted-foreground">Scores, pages and every observed fact.</span>
                </span>
                <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            ) : null}
          </aside>
        </div>
      )}
    </div>
  );
}

function Block({
  icon: Icon,
  title,
  lead,
  empty,
  children,
}: {
  icon: typeof Scale;
  title: string;
  lead?: string;
  empty?: string;
  children: ReactNode[];
}) {
  const items = children.flat().filter(Boolean);
  return (
    <section className="flex flex-col gap-3 rounded-xl bg-surface-soft p-5 ring-1 ring-hairline">
      <h2 className="flex items-center gap-2 font-display text-[18px] leading-6 tracking-[-0.2px] text-ink">
        <span className="flex size-7 items-center justify-center rounded-full bg-surface-card text-body">
          <Icon className="size-3.5" aria-hidden />
        </span>
        {title}
      </h2>
      {lead ? <p className="text-sm leading-7 text-ink">{lead}</p> : null}
      {items.length ? <ul className="flex flex-col gap-2">{items}</ul> : empty ? <p className="text-sm text-muted-foreground">{empty}</p> : null}
    </section>
  );
}

function FactItem({
  fact,
  label,
  tone,
  worth,
  children,
}: {
  fact: CompetitorFact | undefined;
  label: string;
  tone?: "good" | "bad";
  worth?: string;
  children: ReactNode;
}) {
  return (
    <li className="grid gap-3 rounded-lg bg-canvas p-4 ring-1 ring-hairline md:grid-cols-2">
      <div className="flex flex-col gap-1">
        <p className="font-mono text-[11px] text-muted-foreground">Observed</p>
        <p className="text-sm leading-6 text-ink">{fact?.statement ?? "A difference the crawls recorded."}</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-muted-foreground">
          <span className={cn(tone === "good" && "text-good", tone === "bad" && "text-bad")}>{label}</span>
          {worth ? <span className={cn("rounded-full px-2 py-0.5", WORTH_STYLE[worth])}>{worth === "yes" ? "worth pursuing" : worth === "maybe" ? "maybe" : "not a priority"}</span> : null}
          <span>· AI interpretation</span>
        </p>
        <div className="flex flex-col gap-1.5 text-sm leading-6 text-body">{children}</div>
      </div>
    </li>
  );
}

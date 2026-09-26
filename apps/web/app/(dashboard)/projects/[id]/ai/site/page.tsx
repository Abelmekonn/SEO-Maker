import type { ReactNode } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowUpRight, Boxes, CircleAlert, FileText, Layers, Link2, ListOrdered, TriangleAlert } from "lucide-react";
import { loadSiteIntelligence } from "@seo-maker/ai";
import type { SiteStrategy } from "@seo-maker/ai/schemas";
import { prisma } from "@seo-maker/db";
import { AiRunButton } from "@/components/ai/AiRunButton";
import { AiWorkspaceHeader } from "@/components/ai/AiWorkspaceHeader";
import { UsageMeter } from "@/components/ai/UsageMeter";
import { CrawlRefresh } from "@/components/project/CrawlRefresh";
import { premiumGate } from "@/components/project/PremiumRoute";
import { aiConfigured, getUserQuota } from "@/lib/ai-access";
import { hasAnyContext, readBusinessContext } from "@/lib/business-context";
import { getAccountForUser } from "@/lib/plan";
import { getProjectForUser, requireUserId } from "@/lib/projects";
import { getAiSiteJobs } from "@/lib/queue";
import { getSiteStrategy } from "@/lib/site-strategy";

/**
 * Site AI: a strategy for the whole site.
 *
 *   Site Intelligence (sections, page types, links, coverage)
 *     + the opportunities code found + business context + knowledge
 *     -> content opportunities, topic structure, internal-link strategy,
 *        site architecture, content strategy
 *
 * Every recommendation cites the evidence it rests on, shown beside it, and
 * names only pages the crawl found. It runs when the user asks, never after
 * a crawl on its own.
 */

const dateFmt = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default async function SiteStrategyPage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  if (!userId) redirect("/sign-in");
  const { id } = await params;
  const project = await getProjectForUser(id, userId);
  if (!project) notFound();

  const gate = await premiumGate(project.id, "site-ai");
  if (gate) return gate;

  const account = await getAccountForUser(userId);
  const [strategy, jobs, loaded, quota] = await Promise.all([
    getSiteStrategy(project.id),
    getAiSiteJobs(project.id).catch(() => []),
    loadSiteIntelligence(project.id),
    getUserQuota(userId, account.limits),
  ]);
  const running = jobs.some((job) => (job.data.task ?? "opportunities") === "strategy");
  const data = strategy?.data ?? null;

  // Opportunity ids the strategy cites, in words.
  const oppKeys = data ? [...new Set(allRefs(data).filter((ref) => ref.startsWith("opp:")).map((ref) => ref.slice(4)))] : [];
  const opportunities = oppKeys.length
    ? await prisma.opportunity.findMany({ where: { projectId: project.id, key: { in: oppKeys } }, select: { key: true, title: true } })
    : [];
  const oppTitle = new Map(opportunities.map((row) => [row.key, row.title]));
  const refLabel = (ref: string) => {
    if (ref === "coverage") return "Crawl coverage";
    if (ref === "site") return "Site summary";
    if (ref === "links") return "Link structure";
    if (ref === "architecture") return "Site architecture";
    if (ref.startsWith("section:")) return `Section ${ref.slice(8)}`;
    if (ref.startsWith("page:")) return `Page ${ref.slice(5)}`;
    if (ref.startsWith("opp:")) return oppTitle.get(ref.slice(4)) ?? "Site opportunity";
    return ref;
  };

  const business = hasAnyContext(readBusinessContext(project));
  const intel = loaded?.intel ?? null;
  const disabledReason = !aiConfigured()
    ? "AI is not available right now. Try again later."
    : !loaded
      ? "Crawl the site first. Site AI works from a complete crawl."
      : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <CrawlRefresh status={running ? "running" : "idle"} intervalMs={4000} />
      <AiWorkspaceHeader
        projectId={project.id}
        siteName={project.name}
        active="site"
        limits={account.limits}
        title="Site Strategy"
        description="What to write, how to organise it and how to link it, for the whole site. Built from the crawl's Site Intelligence and the opportunities code found, never from page bodies or guesses."
        businessContext={business}
        actions={
          running ? (
            <span className="inline-flex h-11 items-center gap-2 rounded-full bg-surface-card px-4 font-mono text-sm text-ink" role="status">
              <span className="size-2 animate-pulse rounded-full bg-primary motion-reduce:animate-none" aria-hidden />
              Writing the strategy
            </span>
          ) : (
            <AiRunButton
              endpoint={`/api/projects/${project.id}/ai/site`}
              body={{ task: "strategy" }}
              label={data ? "Regenerate site insights" : "Generate site insights"}
              regenerate={Boolean(data)}
              appearance="primary"
              disabledReason={disabledReason}
            />
          )
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,320px)]">
        <div className="flex min-w-0 flex-col gap-4">
          {!loaded ? (
            <Empty title="No complete crawl yet">
              Site AI reasons over a finished crawl of the site. Run one from the{" "}
              <Link href={`/projects/${project.id}`} className="text-ink underline underline-offset-4">
                overview
              </Link>
              , then come back.
            </Empty>
          ) : !strategy ? (
            <Empty title={running ? "Writing your site strategy" : "No site strategy yet"}>
              {running
                ? "This usually takes under a minute. The page updates when it is ready."
                : "Generate site insights to get content opportunities, a topic structure, an internal-link strategy, architecture recommendations and a content strategy for this site."}
            </Empty>
          ) : !data ? (
            <section role="alert" className="flex flex-col gap-2 rounded-xl bg-surface-soft p-6 ring-1 ring-hairline">
              <p className="flex items-center gap-2 text-sm font-medium text-ink">
                <CircleAlert className="size-4 text-bad" aria-hidden />
                The last run did not produce a strategy
              </p>
              <p className="text-sm leading-6 text-body">{strategy.error}</p>
              <p className="text-xs text-muted-foreground">It was not counted toward your allowance. Nothing unverified was stored.</p>
            </section>
          ) : (
            <>
              <section className="flex flex-col gap-3 rounded-xl bg-surface-soft p-5 ring-1 ring-hairline">
                <p className="font-mono text-[12px] text-muted-foreground">Summary · {dateFmt.format(new Date(strategy.createdAt))}</p>
                <p className="text-sm leading-7 text-ink">{data.summary}</p>
                {!data.evidenceSufficient ? (
                  <p className="flex items-start gap-2 rounded-lg bg-warn/10 px-3 py-2 text-xs leading-5 text-warn">
                    <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    The crawl covered too little of the site for firm site-wide conclusions. Treat this as a starting point, and
                    crawl more of the site for a fuller picture.
                  </p>
                ) : null}
                <p className="font-mono text-[11px] text-muted-foreground">
                  AI-written · {data.confidence} confidence · grounded in {data.groundedIn.length} sources
                  {data.needsHumanReview ? " · review before acting" : ""}
                </p>
              </section>

              <Block icon={FileText} title="Content opportunities" empty="No content opportunity the evidence supports.">
                {data.contentOpportunities.map((row) => (
                  <Item key={row.title} title={row.title} refs={row.evidenceRefs.map(refLabel)}>
                    <p>{row.rationale}</p>
                    <p className="text-ink">
                      <span className="font-mono text-[12px] text-muted-foreground">Do: </span>
                      {row.action}
                    </p>
                  </Item>
                ))}
              </Block>

              <Block icon={Boxes} title="Topic structure" lead={data.topicStructure.assessment} empty="No topic clusters the evidence supports.">
                {data.topicStructure.clusters.map((row) => (
                  <Item key={row.name} title={row.name} refs={row.evidenceRefs.map(refLabel)}>
                    <p>{row.note}</p>
                    {row.pages.length ? <PageChips projectId={project.id} paths={row.pages} /> : null}
                  </Item>
                ))}
              </Block>

              <Block icon={Link2} title="Internal-link strategy" empty="No internal-link change the evidence supports.">
                {data.internalLinkStrategy.map((row) => (
                  <Item key={row.recommendation} title={row.recommendation} refs={row.evidenceRefs.map(refLabel)}>
                    <p>{row.rationale}</p>
                    {row.examplePages.length ? <PageChips projectId={project.id} paths={row.examplePages} /> : null}
                  </Item>
                ))}
              </Block>

              <Block icon={Layers} title="Site architecture" empty="No architecture change the evidence supports.">
                {data.architectureRecommendations.map((row) => (
                  <Item key={row.recommendation} title={row.recommendation} refs={row.evidenceRefs.map(refLabel)}>
                    <p>{row.rationale}</p>
                  </Item>
                ))}
              </Block>

              <Block icon={ListOrdered} title="Content strategy" lead={data.contentStrategy.focus} empty="No priorities the evidence supports.">
                {data.contentStrategy.priorities.map((row, index) => (
                  <Item key={row.priority} title={`${index + 1}. ${row.priority}`} refs={row.evidenceRefs.map(refLabel)}>
                    <p>{row.rationale}</p>
                  </Item>
                ))}
              </Block>
            </>
          )}
        </div>

        <aside className="flex flex-col gap-4">
          <UsageMeter quota={quota} planLabel={account.limits.label} />
          {intel ? (
            <section className="flex flex-col gap-3 rounded-xl bg-surface-soft p-4 ring-1 ring-hairline">
              <p className="text-sm font-medium text-ink">What the strategy is built from</p>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 font-mono text-[12px]">
                <dt className="text-muted-foreground">Pages analysed</dt>
                <dd className="text-right tabular-nums text-ink">{intel.coverage.analyzed}</dd>
                <dt className="text-muted-foreground">URLs known</dt>
                <dd className="text-right tabular-nums text-ink">{intel.coverage.discovered ?? "–"}</dd>
                <dt className="text-muted-foreground">Sections</dt>
                <dd className="text-right tabular-nums text-ink">{intel.topics.length}</dd>
                <dt className="text-muted-foreground">Orphan pages</dt>
                <dd className="text-right tabular-nums text-ink">{intel.links.orphans.length}</dd>
              </dl>
              <p className="text-xs leading-5 text-muted-foreground">
                Page titles, headings and link structure only; no page text is sent. The AI cannot see rankings, traffic or
                keyword volumes, and does not claim them.
              </p>
            </section>
          ) : null}
          <Link
            href={`/projects/${project.id}/opportunities`}
            className="flex items-center justify-between gap-3 rounded-xl bg-surface-soft p-4 text-sm text-ink ring-1 ring-hairline hover:bg-surface-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span>
              Ranked site opportunities
              <span className="block text-xs text-muted-foreground">Scored by code; AI can explain each one.</span>
            </span>
            <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </Link>
        </aside>
      </div>
    </div>
  );
}

function allRefs(data: SiteStrategy): string[] {
  return [
    ...data.contentOpportunities.flatMap((row) => row.evidenceRefs),
    ...data.topicStructure.clusters.flatMap((row) => row.evidenceRefs),
    ...data.internalLinkStrategy.flatMap((row) => row.evidenceRefs),
    ...data.architectureRecommendations.flatMap((row) => row.evidenceRefs),
    ...data.contentStrategy.priorities.flatMap((row) => row.evidenceRefs),
  ];
}

function Empty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 rounded-xl bg-surface-soft p-6 ring-1 ring-hairline">
      <h2 className="font-display text-[18px] text-ink">{title}</h2>
      <p className="max-w-2xl text-sm leading-6 text-body">{children}</p>
    </section>
  );
}

function Block({
  icon: Icon,
  title,
  lead,
  empty,
  children,
}: {
  icon: typeof FileText;
  title: string;
  lead?: string;
  empty: string;
  children: ReactNode[];
}) {
  return (
    <section className="flex flex-col gap-3 rounded-xl bg-surface-soft p-5 ring-1 ring-hairline">
      <h2 className="flex items-center gap-2 font-display text-[18px] leading-6 tracking-[-0.2px] text-ink">
        <span className="flex size-7 items-center justify-center rounded-full bg-surface-card text-body">
          <Icon className="size-3.5" aria-hidden />
        </span>
        {title}
      </h2>
      {lead ? <p className="text-sm leading-6 text-body">{lead}</p> : null}
      {children.length ? <ul className="flex flex-col gap-2">{children}</ul> : <p className="text-sm text-muted-foreground">{empty}</p>}
    </section>
  );
}

function Item({ title, refs, children }: { title: string; refs: string[]; children: ReactNode }) {
  return (
    <li className="flex flex-col gap-2 rounded-lg bg-canvas p-4 ring-1 ring-hairline">
      <p className="text-sm font-medium text-ink">{title}</p>
      <div className="flex flex-col gap-1.5 text-sm leading-6 text-body">{children}</div>
      <ul aria-label="Evidence" className="flex flex-wrap gap-1.5">
        {refs.map((ref) => (
          <li key={ref} className="rounded-md bg-surface-card px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
            {ref}
          </li>
        ))}
      </ul>
    </li>
  );
}

function PageChips({ projectId, paths }: { projectId: string; paths: string[] }) {
  return (
    <ul aria-label="Pages" className="flex flex-wrap gap-1.5">
      {paths.map((path) => (
        <li key={path}>
          <Link
            href={`/projects/${projectId}/pages?q=${encodeURIComponent(path)}`}
            className="inline-flex rounded-full px-2 py-0.5 font-mono text-[11px] text-ink ring-1 ring-hairline hover:bg-surface-card"
          >
            {path}
          </Link>
        </li>
      ))}
    </ul>
  );
}

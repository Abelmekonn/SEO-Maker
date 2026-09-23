import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { prisma } from "@seo-maker/db";
import { PageHeader } from "@/components/dashboard/shell";
import { AnalyzeButton } from "@/components/project/AnalyzeButton";
import { aiConfigured, getProjectRecommendations } from "@/lib/ai-results";
import { UpgradePrompt } from "@/components/project/UpgradePrompt";
import { premiumGate } from "@/components/project/PremiumRoute";
import { getAccountForUser } from "@/lib/plan";
import { getProjectForUser, requireUserId } from "@/lib/projects";
import { pagePath } from "@/lib/site-url";
import { cn } from "@/lib/utils";

/**
 * Project-wide AI analysis (Phase 1).
 *
 * Lists only pages that have something to explain — a page with no failing
 * checks has nothing for the model to say, and padding the list with clean
 * pages would hide the work. Each row links to the page detail, where the full
 * recommendation and its provenance live.
 */
export default async function ProjectSuggestionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
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

  const gate = await premiumGate(project.id, "suggestions");
  if (gate) {
    return gate;
  }

  const pageIds = project.pages.map((page) => page.id);

  const account = await getAccountForUser(userId);
  const planAllowsAi = account.limits.ai;

  const [issueCounts, results] = await Promise.all([
    prisma.pageIssue.groupBy({
      by: ["pageId"],
      where: { pageId: { in: pageIds } },
      _count: { pageId: true },
    }),
    getProjectRecommendations(project.id, pageIds),
  ]);

  const issuesByPage = new Map(issueCounts.map((row) => [row.pageId, row._count.pageId]));

  const rows = project.pages
    .map((page) => ({
      page,
      issues: issuesByPage.get(page.id) ?? 0,
      result: results.get(page.id) ?? null,
    }))
    .filter((row) => row.issues > 0)
    .sort((a, b) => b.issues - a.issues);

  const analysed = rows.filter((row) => row.result?.data).length;
  const failed = rows.filter((row) => row.result && !row.result.data).length;
  const aiEnabled = aiConfigured();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-8">
      <PageHeader
        title="AI Suggestions"
        description={`${project.name}. Explanations grounded in each page's crawl evidence and the SEO knowledge base.`}
        actions={
          !planAllowsAi ? null : (
          <AnalyzeButton
            projectId={project.id}
            label={analysed > 0 ? "Re-analyse all" : "Analyse pages"}
            appearance="primary"
            disabledReason={
              aiEnabled
                ? undefined
                : "No AI provider configured. Set AI_API_KEY in .env and restart the worker."
            }
            force={analysed > 0}
          />
          )
        }
      />

      {!planAllowsAi ? (
        <UpgradePrompt
          title="AI explanations are a paid feature"
          body="Every problem on your pages is already found and listed under Pages - that does not change on any plan. Upgrade to get the explanation of why each one matters and what to change, grounded in the SEO knowledge base."
          planLabel={account.limits.label}
        />
      ) : null}

      {project.pages.length === 0 ? (
        <Empty
          title="No pages yet"
          body="Run a crawl first. Analysis works from the evidence a crawl collects."
        />
      ) : rows.length === 0 ? (
        <Empty
          title="Nothing to analyse"
          body="Every crawled page passes its checks, so there is nothing for the model to explain."
        />
      ) : (
        <>
          <dl className="grid gap-4 sm:grid-cols-3">
            <Stat label="Pages with issues" value={rows.length} />
            <Stat label="Analysed" value={analysed} />
            <Stat label="Failed runs" value={failed} tone={failed > 0 ? "bad" : "default"} />
          </dl>

          <section aria-label="Pages" className="rounded-lg bg-surface-soft ring-1 ring-hairline">
            <ul className="divide-y divide-hairline">
              {rows.map(({ page, issues, result }) => {
                const live = page.finalUrl ?? page.url;
                return (
                  <li key={page.id} className="flex flex-col gap-3 px-6 py-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-col gap-1">
                        <Link
                          href={`/projects/${project.id}/pages/${page.id}`}
                          className="inline-flex items-center gap-1.5 break-all font-mono text-sm text-ink hover:text-brand-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {pagePath(live)}
                          <ArrowUpRight className="size-3.5 shrink-0" aria-hidden />
                        </Link>
                        <p className="font-mono text-[12px] text-muted-foreground">
                          {issues} {issues === 1 ? "issue" : "issues"}
                          {page.pageType ? ` · ${page.pageType}` : ""}
                        </p>
                      </div>
                      <Badge result={result} />
                    </div>

                    {result?.data ? (
                      <p className="max-w-3xl text-sm leading-6 text-body">
                        {result.data.summary}
                      </p>
                    ) : result ? (
                      <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                        {result.status === "invalid"
                          ? "The model's output did not match the contract and was rejected rather than stored."
                          : "The last run did not finish. Nothing was stored."}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>

          <p className="text-xs leading-5 text-muted-foreground">
            Analysis runs on its own queue and does not block crawling. Results appear here once
            the worker finishes — refresh to pick them up.
          </p>
        </>
      )}
    </div>
  );
}

function Badge({ result }: { result: { status: string; data: unknown } | null }) {
  if (!result) {
    return (
      <span className="shrink-0 rounded-full bg-surface-card px-2.5 py-1 font-mono text-[11px] leading-5 text-muted-foreground">
        Not analysed
      </span>
    );
  }
  if (result.data) {
    return (
      <span className="shrink-0 rounded-full bg-good/15 px-2.5 py-1 font-mono text-[11px] leading-5 text-good">
        Analysed
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded-full bg-bad/15 px-2.5 py-1 font-mono text-[11px] leading-5 text-bad">
      {result.status === "invalid" ? "Rejected" : "Failed"}
    </span>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "bad";
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-surface-soft p-6 ring-1 ring-hairline">
      <dt className="font-mono text-[12px] text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "font-display text-[40px] leading-none tracking-[-1px] tabular-nums",
          tone === "bad" && value > 0 ? "text-bad" : "text-ink",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-hairline bg-surface-soft/50 p-8">
      <Sparkles className="size-5 text-muted-foreground" aria-hidden />
      <h2 className="text-sm font-medium text-ink">{title}</h2>
      <p className="max-w-lg text-sm leading-6 text-body">{body}</p>
    </div>
  );
}

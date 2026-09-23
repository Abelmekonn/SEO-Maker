import Link from "next/link";
import type { Competitor, GeoOpportunity } from "@seo-maker/db";
import {
  ArrowUpRight,
  BadgeCheck,
  Bot,
  Eye,
  Info,
  Lightbulb,
  MessageSquare,
  Quote,
  Sparkles,
  Users,
} from "lucide-react";
import {
  MetricCard,
  Panel,
  SeverityBadge,
  TrendFrame,
} from "@/components/project/geo/board-primitives";
import { cn } from "@/lib/utils";

/**
 * The AI Visibility board.
 *
 * The layout is complete: every panel this feature will have is here, in the
 * place it will occupy. What is missing is the data, because nothing measures
 * it yet — no provider is connected, no prompts have been run, and no responses
 * are stored.
 *
 * So each panel renders its real shape with an explicit "not tracked yet"
 * state instead of a sample number. A placeholder metric on a page like this is
 * indistinguishable from a measurement, and this is the one screen in the
 * product that reports what an assistant actually said.
 *
 * The GEO Opportunities strip at the bottom is the exception: those findings
 * are real, deterministic, and already produced by the analysis.
 */

const PLATFORMS = [
  { key: "chatgpt", label: "ChatGPT", operator: "OpenAI" },
  { key: "perplexity", label: "Perplexity", operator: "Perplexity" },
  { key: "google-ai", label: "Google AI", operator: "Google" },
  { key: "gemini", label: "Gemini", operator: "Google" },
];

const PROMPT_COLUMNS = [
  "Prompt",
  "Brand mentioned",
  "Cited",
  "Correctly represented",
  "Top competitors",
  "Sources",
];

export function AiVisibilityBoard({
  projectId,
  domain,
  competitors,
  opportunities,
  configured,
}: {
  projectId: string;
  domain: string;
  competitors: Competitor[];
  opportunities: GeoOpportunity[];
  configured: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <section
        aria-label="Visibility metrics"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"
      >
        <MetricCard
          icon={Eye}
          label="AI visibility rate"
          hint="Share of tracked prompts naming this site"
          ring
        />
        <MetricCard
          icon={MessageSquare}
          label="Brand mentions"
          hint="Answers that name this business"
        />
        <MetricCard
          icon={Quote}
          label="Citations"
          hint="Answers citing a page as a source"
        />
        <MetricCard
          icon={BadgeCheck}
          label="Correct representation"
          hint="Mentions that describe the business accurately"
        />
        <MetricCard
          icon={Users}
          label="Competitors mentioned"
          hint="Rival brands appearing in the same answers"
        />
      </section>

      {/*
        Two rows of two on the left, rail on the right.

        `flex-1 min-w-0` rather than `w-full` for the growing panel: a flex
        child at 100% overflows first and is only pulled back by shrink, which
        happens to look right but collapses the moment a table inside refuses to
        shrink. `shrink-0` on the fixed panels, because a width alone does not
        hold under pressure.
      */}
      <div className="flex flex-col gap-4 xl:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex flex-col gap-4 lg:flex-row">
            <Panel
              title="Visibility trends"
              tabs={["AI visibility", "Mentions", "Citations", "Competitors"]}
              className="min-w-0 flex-1"
            >
              <TrendFrame
                title="No visibility history"
                body="A trend needs prompts run on more than one day. Nothing is recorded yet, so there is nothing to plot."
              />
            </Panel>

              <Panel title="Visibility by platform" className="lg:w-[340px] lg:shrink-0">
                <ul className="flex h-full flex-col gap-3">
                  {PLATFORMS.map((platform) => (
                    <li key={platform.key} className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-2">
                          <Bot
                            className="size-3.5 shrink-0 text-muted-soft"
                            aria-hidden
                          />
                          <span className="truncate text-[12px] font-medium text-ink">
                            {platform.label}
                          </span>
                        </span>
                        <span className="shrink-0 font-mono text-[12px] text-muted-soft">
                          Not tracked
                        </span>
                      </div>
                      <span className="h-1.5 rounded-full bg-surface-card" />
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-[11px] leading-4 text-muted-soft">
                  Each platform answers differently, so visibility is measured per
                  platform rather than averaged into one figure.
                </p>
              </Panel>
          </div>
          <div className="flex flex-col gap-4 lg:flex-row">
            <Panel
              title="AI responses & citations"
              tabs={PLATFORMS.map((platform) => platform.label)}
              className="min-w-0 flex-1"
            >
              {/* The table has six columns and will not fit a narrow rail, so
                  it scrolls inside its panel rather than stretching the row. */}
              <div className="overflow-x-auto rounded-lg ring-1 ring-hairline">
                <table className="w-full min-w-[640px] border-collapse text-left">
                  <thead>
                    <tr className="bg-canvas">
                      {PROMPT_COLUMNS.map((column) => (
                        <th
                          key={column}
                          scope="col"
                          className="px-3 py-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-soft"
                        >
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td
                        colSpan={PROMPT_COLUMNS.length}
                        className="px-3 py-8 text-center"
                      >
                        <p className="text-[12px] font-medium text-ink">
                          No prompts have been run
                        </p>
                        <p className="mx-auto mt-1 max-w-md text-[11px] leading-4 text-muted-soft">
                          Each row will be one real question put to one
                          assistant, with the answer it gave and the sources it
                          cited.
                        </p>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel title="AI competitors" className="lg:w-[340px] lg:shrink-0">
              {competitors.length === 0 ? (
                <p className="rounded-lg bg-canvas px-4 py-3 text-[12px] leading-5 text-muted-soft ring-1 ring-hairline">
                  No competitors tracked yet.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {competitors.slice(0, 6).map((competitor) => (
                    <CompetitorLine
                      key={competitor.id}
                      domain={competitor.domain}
                    />
                  ))}
                  <CompetitorLine domain={domain} self />
                </ul>
              )}
              <p className="mt-1 text-[11px] leading-4 text-muted-soft">
                Mentions and citations for each domain need prompt runs. Their
                SEO scores are on the Competitors page and are a different
                measurement.
              </p>
            </Panel>
          </div>
        </div>
        <OverviewRail
          configured={configured}
          projectId={projectId}
          className="xl:w-[340px] xl:shrink-0"
        />
      </div>
      <section className="flex flex-col gap-3 rounded-xl bg-surface-soft p-5 ring-1 ring-hairline">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-[13px] font-semibold text-ink">
              GEO opportunities
            </h2>
            <span className="rounded-full bg-surface-card px-2 py-0.5 text-[11px] font-medium leading-4 text-muted-soft">
              Rule-based
            </span>
          </div>
          <Link
            href={`/projects/${projectId}/ai-search/opportunities`}
            className="rounded-md text-[12px] font-medium text-muted-foreground hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            View all
            <ArrowUpRight className="ml-0.5 inline size-3" aria-hidden />
          </Link>
        </div>

        {opportunities.length === 0 ? (
          <p className="rounded-lg bg-canvas px-4 py-3 text-[12px] leading-5 text-muted-soft ring-1 ring-hairline">
            No findings from the last analysis. These come from the readiness
            checks, not from prompt runs, so they are available without a
            provider.
          </p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {opportunities.slice(0, 6).map((row) => (
              <li
                key={row.id}
                className="flex flex-col gap-2 rounded-lg bg-canvas px-4 py-3 ring-1 ring-hairline"
              >
                <div className="flex items-center gap-2">
                  <SeverityBadge severity={row.severity} />
                  <span className="font-mono text-[11px] tabular-nums text-muted-soft">
                    {Math.round(row.priority)}
                  </span>
                </div>
                <p className="text-[12px] font-medium leading-5 text-ink">
                  {row.title}
                </p>
                <p className="line-clamp-2 text-[11px] leading-4 text-muted-soft">
                  {row.recommendedAction}
                </p>
                <Link
                  href={`/projects/${projectId}/ai-search/opportunities`}
                  className="mt-auto rounded-md text-[11px] font-medium text-muted-foreground hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  View details
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}




function OverviewRail({
  configured,
  projectId,
  className,
}: {
  configured: boolean;
  projectId: string;
  className?: string;
}) {
  return (
    <section className={cn("flex min-w-0 flex-col gap-4 rounded-xl bg-surface-soft p-5 ring-1 ring-hairline", className)}>
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 shrink-0 text-primary" aria-hidden />
        <h2 className="text-[13px] font-semibold text-ink">
          AI visibility overview
        </h2>
      </div>

      <p className="text-[13px] leading-6 text-body">
        {configured
          ? "A provider is connected, but no prompts have been run for this project yet."
          : "Nothing is tracked yet. Measuring this means putting real questions to assistants and recording what comes back, which needs a provider."}
      </p>

      {/* The caveat is permanent, not a placeholder: it stays true once the
          numbers are real. */}
      <div className="flex gap-2 rounded-lg bg-canvas px-3 py-2.5 ring-1 ring-hairline">
        <Info
          className="mt-0.5 size-3.5 shrink-0 text-muted-soft"
          aria-hidden
        />
        <p className="text-[11px] leading-4 text-muted-soft">
          AI answers vary by question, platform and time. Visibility here is
          what was observed on the prompts that were run — not a guarantee of
          placement, and not a ranking.
        </p>
      </div>

      <div className="flex flex-col gap-2 border-t border-hairline pt-3">
        <p className="text-[11px] uppercase tracking-wide text-muted-soft">
          Available now
        </p>
        <RailLink
          href={`/projects/${projectId}/ai-search/readiness`}
          icon={Lightbulb}
          title="AI readiness"
          body="Measured from your own site, no provider needed."
        />
        <RailLink
          href={`/projects/${projectId}/ai-search/opportunities`}
          icon={ArrowUpRight}
          title="GEO opportunities"
          body="Findings you can act on today."
        />
      </div>
    </section>
  );
}

function RailLink({
  href,
  icon: Icon,
  title,
  body,
}: {
  href: string;
  icon: typeof Eye;
  title: string;
  body: string;
}) {
  return (
    <Link
      href={href}
      className="flex gap-2.5 rounded-lg px-2 py-2 hover:bg-surface-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-soft" aria-hidden />
      <span className="min-w-0">
        <span className="block text-[12px] font-medium text-ink">{title}</span>
        <span className="block text-[11px] leading-4 text-muted-soft">
          {body}
        </span>
      </span>
    </Link>
  );
}

function CompetitorLine({
  domain,
  self = false,
}: {
  domain: string;
  self?: boolean;
}) {
  return (
    <li
      className={cn(
        "flex items-center justify-between gap-3 rounded-lg px-3 py-2 ring-1",
        self ? "bg-primary/10 ring-primary/30" : "bg-canvas ring-hairline",
      )}
    >
      <span className="min-w-0 truncate font-mono text-[12px] text-ink">
        {domain}
        {self ? (
          <span className="ml-1.5 text-[11px] text-primary">You</span>
        ) : null}
      </span>
      <span className="shrink-0 font-mono text-[11px] text-muted-soft">
        Not tracked
      </span>
    </li>
  );
}



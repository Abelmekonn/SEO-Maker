import Link from "next/link";
import type { GeoOpportunity, Page } from "@seo-maker/db";
import {
  ArrowUpRight,
  Bot,
  Globe2,
  Lightbulb,
  MessageSquare,
  Quote,
  ShieldCheck,
  Users,
} from "lucide-react";
import { MetricCard, NotTracked, Panel, SeverityBadge, TrendFrame } from "@/components/project/geo/board-primitives";
import { ScoreRing } from "@/components/project/ScoreRing";
import type { DimensionRow } from "@/lib/geo";
import { pagePath } from "@/lib/site-url";

/**
 * The AI Citations board.
 *
 * Citations can only be counted by asking assistants questions and reading what
 * they answer. No provider is connected and no prompt has ever been run, so
 * every count here is absent rather than zero.
 *
 * Two things on this page are real: the pages that would be cited, which come
 * from the crawl, and the citation-readiness signal, which is measured from the
 * site itself and needs no provider.
 */

const PLATFORMS = ["ChatGPT", "Perplexity", "Google AI", "Gemini"];

export function AiCitationsBoard({
  projectId,
  pages,
  citation,
  opportunities,
}: {
  projectId: string;
  pages: Page[];
  citation: DimensionRow | undefined;
  opportunities: GeoOpportunity[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Citation metrics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={MessageSquare}
          label="Total mentions"
          denominator="prompts"
          hint="Answers that name this business"
          ring
        />
        <MetricCard
          icon={Quote}
          label="Total citations"
          denominator="prompts"
          hint="Answers linking to a page here as a source"
          ring
        />
        <MetricCard
          icon={Globe2}
          label="Cited domains"
          hint="Distinct domains cited alongside yours"
        />
        <MetricCard
          icon={Users}
          label="Competitors mentioned"
          hint="Rival brands named in the same answers"
        />
      </section>

      <div className="flex flex-col gap-4 xl:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex flex-col gap-4 lg:flex-row">
            <Panel
              title="Mentions & citations trend"
              tabs={["Mentions", "Citations"]}
              className="min-w-0 flex-1"
            >
              <TrendFrame
                title="No citation history"
                body="A trend needs prompts run on more than one day. Nothing has been recorded, so there is nothing to plot."
              />
            </Panel>

            <Panel title="Citations by platform" className="lg:w-[340px] lg:shrink-0">
              <div className="flex items-center gap-4">
                <ScoreRing score={null} size={72} strokeWidth={6} label="Citations by platform" />
                <div className="min-w-0">
                  <p className="font-display text-[24px] leading-none text-muted-soft">&mdash;</p>
                  <p className="mt-1 text-[11px] leading-4 text-muted-soft">citations recorded</p>
                </div>
              </div>
              <ul className="flex flex-col gap-2.5">
                {PLATFORMS.map((platform) => (
                  <li key={platform} className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <Bot className="size-3.5 shrink-0 text-muted-soft" aria-hidden />
                      <span className="truncate text-[12px] font-medium text-ink">{platform}</span>
                    </span>
                    <NotTracked />
                  </li>
                ))}
              </ul>
            </Panel>
          </div>

          <div className="flex flex-col gap-4 lg:flex-row">
            <Panel
              title="Top cited pages"
              className="min-w-0 flex-1"
              action={
                <Link
                  href={`/projects/${projectId}/pages`}
                  className="rounded-md text-[12px] font-medium text-muted-foreground hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  All pages
                </Link>
              }
            >
              {pages.length === 0 ? (
                <p className="rounded-lg bg-canvas px-4 py-3 text-[12px] leading-5 text-muted-soft ring-1 ring-hairline">
                  No pages crawled yet.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg ring-1 ring-hairline">
                  <table className="w-full min-w-[520px] border-collapse text-left">
                    <thead>
                      <tr className="bg-canvas">
                        {["Page", "Mentions", "Citations", "Platforms"].map((column) => (
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
                      {pages.map((page) => (
                        <tr key={page.id} className="border-t border-hairline">
                          <td className="max-w-[240px] px-3 py-2.5">
                            <Link
                              href={`/projects/${projectId}/pages/${page.id}`}
                              className="block truncate font-mono text-[12px] text-ink hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              {pagePath(page.url)}
                            </Link>
                          </td>
                          <td className="px-3 py-2.5">
                            <NotTracked />
                          </td>
                          <td className="px-3 py-2.5">
                            <NotTracked />
                          </td>
                          <td className="px-3 py-2.5">
                            <NotTracked />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {/* These are the pages an assistant would have to choose from, not
                  pages anything has actually cited. */}
              <p className="text-[11px] leading-4 text-muted-soft">
                The pages most likely to be reached, ranked by depth and internal links. Whether any
                has been cited needs prompt runs.
              </p>
            </Panel>

            <Panel title="Citation readiness" className="lg:w-[340px] lg:shrink-0">
              {citation?.value == null ? (
                <>
                  <div className="flex items-center gap-4">
                    <ScoreRing score={null} size={72} strokeWidth={6} label="Citation readiness" />
                    <p className="text-[11px] leading-4 text-muted-soft">Not measured</p>
                  </div>
                  <p className="text-[12px] leading-5 text-muted-soft">
                    {citation?.reason ?? "The analysis has not scored this signal yet."}
                  </p>
                </>
              ) : (
                <div className="flex items-center gap-4">
                  <ScoreRing
                    score={citation.value}
                    size={72}
                    strokeWidth={6}
                    label="Citation readiness"
                    centerValue
                    showValue
                  />
                  <p className="text-[11px] leading-4 text-muted-soft">
                    How quotable and verifiable these pages are.
                  </p>
                </div>
              )}
              <p className="border-t border-hairline pt-3 text-[11px] leading-4 text-muted-soft">
                Measured from your own site, so it is available without a provider. It is a
                diagnostic of what an assistant would have to work with — not a prediction that one
                will cite you.
              </p>
            </Panel>
          </div>
        </div>

        <Panel title="Example citations" className="xl:w-[340px] xl:shrink-0">
          <div className="rounded-lg bg-canvas px-4 py-5 ring-1 ring-hairline">
            <p className="text-[12px] font-medium text-ink">No answers recorded</p>
            <p className="mt-1 text-[11px] leading-5 text-muted-soft">
              Each card here will be one real answer from one assistant: the question asked, the
              passage that names this business, and the source it linked to.
            </p>
          </div>
          <ul className="flex flex-col gap-2">
            {PLATFORMS.map((platform) => (
              <li
                key={platform}
                className="flex items-center justify-between gap-2 rounded-lg bg-canvas px-3 py-2.5 ring-1 ring-hairline"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Bot className="size-3.5 shrink-0 text-muted-soft" aria-hidden />
                  <span className="truncate text-[12px] text-ink">{platform}</span>
                </span>
                <NotTracked />
              </li>
            ))}
          </ul>
          <p className="text-[11px] leading-4 text-muted-soft">
            Quoted passages are stored verbatim, so this list can only ever contain text an
            assistant actually produced.
          </p>
        </Panel>
      </div>

      <Panel
        title="Citation insights"
        action={
          <Link
            href={`/projects/${projectId}/ai-search/opportunities`}
            className="rounded-md text-[12px] font-medium text-muted-foreground hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            View all
            <ArrowUpRight className="ml-0.5 inline size-3" aria-hidden />
          </Link>
        }
      >
        {opportunities.length === 0 ? (
          <div className="flex gap-2.5 rounded-lg bg-canvas px-4 py-3 ring-1 ring-hairline">
            <Lightbulb className="mt-0.5 size-4 shrink-0 text-muted-soft" aria-hidden />
            <p className="text-[12px] leading-5 text-muted-soft">
              No findings from the last analysis. Insights here come from the readiness checks, not
              from prompt runs, so they appear without a provider.
            </p>
          </div>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {opportunities.slice(0, 4).map((row) => (
              <li
                key={row.id}
                className="flex flex-col gap-2 rounded-lg bg-canvas px-4 py-3 ring-1 ring-hairline"
              >
                <div className="flex items-center gap-2">
                  <ShieldCheck className="size-3.5 shrink-0 text-muted-soft" aria-hidden />
                  <SeverityBadge severity={row.severity} />
                </div>
                <p className="text-[12px] font-medium leading-5 text-ink">{row.title}</p>
                <p className="line-clamp-3 text-[11px] leading-4 text-muted-soft">
                  {row.recommendedAction}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

import type { ReactNode } from "react";
import type { Page, PerformanceAudit, Project } from "@seo-maker/db";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import {
  HBarList,
  ScoreSpark,
  SegmentBar,
  SemiGauge,
  StatusColumns,
} from "@/components/project/OverviewCharts";
import { CrawlRefresh } from "@/components/project/CrawlRefresh";
import { StatusBadge } from "@/components/project/StatusBadge";
import { UrlIntakeForm } from "@/components/project/UrlIntakeForm";
import { Button } from "@/components/ui/button";
import { failedChecks, isCrawled } from "@/lib/page-audit";
import { scoreRating } from "@/lib/performance";
import { cn } from "@/lib/utils";

type ProjectRow = Project & {
  pages: Array<Page & { performance: PerformanceAudit[] }>;
};

const dateFmt = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export function ProjectsHome({
  firstName,
  planLabel,
  maxProjects,
  maxPages,
  canUseDeep = true,
  projects,
}: {
  firstName: string | null;
  planLabel: string;
  maxProjects: number;
  maxPages: number;
  canUseDeep?: boolean;
  projects: ProjectRow[];
}) {
  const sites = projects.map(toSite);
  const analyzed = sites.filter((site) => site.status === "analyzed").length;
  const pending = sites.filter((site) => site.status === "pending" || site.status === "crawling").length;
  const failed = sites.filter((site) => site.status === "failed").length;
  const mobileScores = sites.map((site) => site.mobile);
  const knownMobile = mobileScores.filter((score): score is number => score != null);
  const avgMobile =
    knownMobile.length > 0
      ? Math.round(knownMobile.reduce((sum, score) => sum + score, 0) / knownMobile.length)
      : null;
  const analyzedPct = sites.length === 0 ? 0 : Math.round((analyzed / sites.length) * 100);
  const live = sites.find((site) => site.status === "pending" || site.status === "crawling");

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      {live ? <CrawlRefresh status={live.status} /> : null}

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 max-w-2xl flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-[28px] leading-[1.2] tracking-[-0.5px] text-ink">
              {firstName ? `${firstName}, your websites` : "Your websites"}
            </h1>
            <span className="inline-flex rounded-full bg-surface-card px-2.5 py-1 font-mono text-[12px] leading-4 text-ink">
              {planLabel}
            </span>
          </div>
          <p className="text-sm leading-6 text-body">
            {sitesCopy(sites)} {planLabel} includes {maxProjects === 1 ? "1 project" : `${maxProjects} projects`} and {maxPages === 1 ? "the homepage" : `${maxPages} pages`}.
          </p>
        </div>
        {sites.length > 0 ? (
          <Button asChild className="h-11 w-fit">
            <Link href="/projects/new">Add a website</Link>
          </Button>
        ) : null}
      </header>

      {sites.length === 0 ? (
        <section
          aria-label="Add a website"
          className="flex max-w-xl flex-col gap-6 rounded-lg bg-surface-soft p-6 ring-1 ring-hairline"
        >
          <div className="flex flex-col gap-1">
            <h2 className="font-display text-[20px] leading-6 tracking-[-0.3px] text-ink">
              Add your first website
            </h2>
            <p className="text-sm leading-6 text-body">
              Paste the homepage URL. We crawl it and this dashboard will list that site here.
            </p>
          </div>
          <UrlIntakeForm canUseDeep={canUseDeep} planLabel={planLabel} />
        </section>
      ) : (
        <>
          <section aria-label="Charts" className="grid gap-4 lg:grid-cols-3">
            <Card>
              <div className="flex flex-col gap-1">
                <h2 className="font-mono text-[12px] text-muted-foreground">Crawl health</h2>
                <p className="text-sm leading-6 text-body">
                  {analyzed} of {sites.length} {sites.length === 1 ? "site is" : "sites are"} analyzed.
                </p>
              </div>
              <SemiGauge
                label="Analyzed"
                value={analyzedPct}
                rating={scoreRating(analyzedPct)}
              />
              <SegmentBar
                label={`${analyzed} analyzed, ${pending} in progress, ${failed} failed`}
                segments={[
                  { key: "analyzed", value: analyzed, className: "bg-good" },
                  { key: "pending", value: pending, className: "bg-primary" },
                  { key: "failed", value: failed, className: "bg-bad" },
                ]}
              />
            </Card>

            <Card>
              <div className="flex flex-col gap-1">
                <h2 className="font-mono text-[12px] text-muted-foreground">Site status</h2>
                <p className="text-sm leading-6 text-body">How each added website is doing.</p>
              </div>
              <StatusColumns
                label={`${analyzed} analyzed, ${pending} in progress, ${failed} failed`}
                items={[
                  { key: "analyzed", label: "Analyzed", value: analyzed, className: "bg-good" },
                  { key: "pending", label: "In progress", value: pending, className: "bg-primary" },
                  { key: "failed", label: "Failed", value: failed, className: "bg-bad" },
                ]}
              />
            </Card>

            <Card>
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 flex-col gap-1">
                  <h2 className="font-mono text-[12px] text-muted-foreground">PageSpeed</h2>
                  <p className="font-display text-[32px] leading-none tracking-[-1px] tabular-nums text-ink">
                    {avgMobile ?? "-"}
                  </p>
                  <p className="text-xs leading-5 text-body">
                    {avgMobile == null
                      ? "Run PageSpeed on a site to chart scores"
                      : "Average mobile score across your sites"}
                  </p>
                </div>
                <ScoreSpark
                  values={mobileScores}
                  label="Mobile PageSpeed scores for each website you added"
                />
              </div>
              <HBarList
                label="Mobile score by website"
                items={sites.map((site) => ({
                  key: site.id,
                  label: site.host,
                  value: site.mobile,
                }))}
              />
            </Card>
          </section>

          <section
            aria-labelledby="sites-table"
            className="overflow-hidden rounded-lg bg-surface-soft ring-1 ring-hairline"
          >
            <header className="flex flex-wrap items-center justify-between gap-3 px-6 py-5">
              <div className="flex min-w-0 flex-col gap-1">
                <h2
                  id="sites-table"
                  className="font-display text-[20px] leading-6 tracking-[-0.3px] text-ink"
                >
                  Websites you added
                </h2>
                <p className="font-mono text-[12px] text-muted-foreground">
                  {sites.length === 1
                    ? "1 site in your workspace"
                    : `${sites.length} sites in your workspace`}
                </p>
              </div>
            </header>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-t border-hairline text-left">
                <caption className="sr-only">
                  Websites you added, with crawl status, word count, and mobile score
                </caption>
                <thead>
                  <tr className="border-b border-hairline font-mono text-[12px] text-muted-foreground">
                    <th className="px-6 py-3 font-medium">Website</th>
                    <th className="px-6 py-3 font-medium">Address</th>
                    <th className="px-6 py-3 font-medium">Added</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium">Words</th>
                    <th className="px-6 py-3 font-medium">Mobile</th>
                    <th className="px-6 py-3 font-medium">Issues</th>
                    <th className="px-6 py-3 font-medium">
                      <span className="sr-only">Open</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sites.map((site) => (
                    <tr key={site.id} className="border-b border-hairline last:border-b-0">
                      <td className="px-6 py-4">
                        <Link
                          href={`/projects/${site.id}`}
                          className="text-sm font-medium text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {site.name}
                        </Link>
                        <p className="font-mono text-[12px] text-muted-foreground">{site.host}</p>
                      </td>
                      <td className="max-w-[220px] px-6 py-4">
                        <p className="truncate font-mono text-[12px] text-body" title={site.rootUrl}>
                          {site.rootUrl}
                        </p>
                      </td>
                      <td className="px-6 py-4 font-mono text-[12px] tabular-nums text-body">
                        {dateFmt.format(site.createdAt)}
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={site.status} />
                      </td>
                      <td className="px-6 py-4 font-mono text-sm tabular-nums text-ink">
                        {site.words == null ? "-" : site.words.toLocaleString()}
                      </td>
                      <td
                        className={cn(
                          "px-6 py-4 font-mono text-sm tabular-nums",
                          site.mobile == null ? "text-muted-foreground" : scoreText(site.mobile),
                        )}
                      >
                        {site.mobile ?? "-"}
                      </td>
                      <td className="px-6 py-4 font-mono text-sm tabular-nums text-ink">
                        {site.issues == null ? "-" : site.issues}
                      </td>
                      <td className="px-6 py-4">
                        <Link
                          href={`/projects/${site.id}`}
                          className="inline-flex h-11 items-center gap-1 font-mono text-sm text-body hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          Open
                          <ArrowUpRight className="size-3.5" aria-hidden />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col justify-between gap-6 rounded-lg bg-surface-soft p-6 ring-1 ring-hairline">
      {children}
    </div>
  );
}

function toSite(project: ProjectRow) {
  const homepage = project.pages[0] ?? null;
  const mobile =
    homepage?.performance.find((audit) => audit.strategy === "mobile")?.performance ?? null;
  const crawled = homepage ? isCrawled(homepage) : false;

  return {
    id: project.id,
    name: project.name,
    rootUrl: project.rootUrl,
    host: hostnameOf(project.rootUrl),
    status: project.status,
    createdAt: project.createdAt,
    words: homepage?.wordCount ?? null,
    mobile,
    issues: crawled && homepage ? failedChecks(homepage).length : null,
  };
}

function sitesCopy(sites: ReturnType<typeof toSite>[]) {
  if (sites.length === 0) {
    return "You have not added a website yet. Paste a URL to put your first site on this dashboard.";
  }

  const hosts = sites.map((site) => site.host);
  if (hosts.length === 1) {
    return `You added 1 website: ${hosts[0]}. Open it to see the crawl and PageSpeed.`;
  }

  if (hosts.length === 2) {
    return `You added 2 websites: ${hosts[0]} and ${hosts[1]}.`;
  }

  const last = hosts[hosts.length - 1];
  return `You added ${hosts.length} websites: ${hosts.slice(0, -1).join(", ")}, and ${last}.`;
}

function hostnameOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function scoreText(score: number) {
  const rating = scoreRating(score);
  if (rating === "good") return "text-good";
  if (rating === "warn") return "text-warn";
  if (rating === "bad") return "text-bad";
  return "text-ink";
}

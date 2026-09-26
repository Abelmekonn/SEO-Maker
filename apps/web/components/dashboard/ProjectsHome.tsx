import type { ReactNode } from "react";
import type { Crawl, Page, Project } from "@seo-maker/db";
import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  Check,
  CircleAlert,
  FileSearch,
  Globe,
  History,
  Lock,
  Plus,
  Radar,
  Wrench,
  Zap,
} from "lucide-react";
import { CrawlRefresh } from "@/components/project/CrawlRefresh";
import { DeleteProjectButton } from "@/components/project/DeleteProjectButton";
import { GoPremiumButton } from "@/components/project/PremiumGate";
import { SearchTrigger } from "@/components/layout/SearchTrigger";
import type { QuotaView } from "@/lib/ai-access";
import { StatusBadge } from "@/components/project/StatusBadge";
import { checks, failedChecks, isCrawled, siteSeoScore } from "@/lib/page-audit";
import type { PlanId, PlanLimits } from "@/lib/plan";
import { scoreRating } from "@/lib/performance";
import { cn } from "@/lib/utils";

/**
 * The workspace dashboard: everything that is not about one site.
 *
 * Adding a site lives on /projects/new. This screen answers "what have I run,
 * how are my sites doing, and what does my plan cover" across all of them.
 */

type ProjectRow = Project & {
  /** Only the first page (the homepage) carries its latest run per device. */
  pages: Array<Page & { performance: Array<{ strategy: string; performance: number | null }> }>;
};

type CrawlRow = Crawl & { project: { id: string; name: string; rootUrl: string } };

const dateFmt = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" });
const CHECK_LABEL = Object.fromEntries(checks.map((check) => [check.id, check.label]));

export function ProjectsHome({
  firstName,
  plan,
  planLabel,
  maxProjects,
  maxPages,
  projects,
  crawls,
  limits,
  quota,
}: {
  limits: PlanLimits;
  quota: QuotaView;
  firstName: string | null;
  plan: PlanId;
  planLabel: string;
  maxProjects: number;
  maxPages: number;
  canUseDeep: boolean;
  projects: ProjectRow[];
  crawls: CrawlRow[];
}) {
  const premium = plan !== "free";
  const sites = projects.map(toSite);
  const live = sites.find((site) => site.status === "pending" || site.status === "crawling" || site.status === "discovering");
  const atLimit = sites.length >= maxProjects;

  const pagesAudited = sites.reduce((sum, site) => sum + site.crawled, 0);
  const openProblems = sites.reduce((sum, site) => sum + site.problems, 0);
  const scored = sites.map((site) => site.score).filter((score): score is number => score != null);
  const avgScore =
    scored.length > 0 ? Math.round(scored.reduce((sum, score) => sum + score, 0) / scored.length) : null;

  // Most common failing checks across every site's latest crawl.
  const problemCounts = new Map<string, number>();
  for (const project of projects) {
    for (const page of project.pages.filter(isCrawled)) {
      for (const check of failedChecks(page)) {
        problemCounts.set(check.id, (problemCounts.get(check.id) ?? 0) + 1);
      }
    }
  }
  const topProblems = [...problemCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topMax = topProblems[0]?.[1] ?? 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      {live ? <CrawlRefresh status={live.status} /> : null}

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <p className="font-mono text-[12px] text-primary">Workspace</p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-[32px] leading-none tracking-[-0.8px] text-ink">
              {firstName ? `Welcome back, ${firstName}` : "Your workspace"}
            </h1>
            <span className="inline-flex rounded-full bg-surface-card px-2.5 py-1 font-mono text-[12px] leading-4 text-ink">
              {planLabel}
            </span>
          </div>
          <p className="text-sm leading-6 text-body">
            Every site you audit, every crawl you have run, and what your plan covers.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/quick-search"
            className="inline-flex h-11 items-center gap-2 rounded-md px-4 font-mono text-sm text-ink ring-1 ring-hairline transition-colors hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Zap className="size-4" aria-hidden />
            Quick Search
          </Link>
          {atLimit && !premium ? (
            <GoPremiumButton label="Add more websites" />
          ) : (
            <Link
              href="/projects/new"
              className="inline-flex h-11 items-center gap-2 rounded-md bg-primary px-4 font-mono text-sm text-primary-foreground transition-colors hover:bg-primary-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Plus className="size-4" aria-hidden />
              Add a website
            </Link>
          )}
        </div>
      </header>

      <SearchTrigger className="max-w-xl" />

      <section aria-label="Workspace totals" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi
          icon={Globe}
          label="Websites"
          value={`${sites.length}`}
          suffix={`/ ${maxProjects}`}
          hint={atLimit ? "Plan limit reached" : `${maxProjects - sites.length} left on ${planLabel}`}
          progress={maxProjects > 0 ? sites.length / maxProjects : 0}
        />
        <Kpi
          icon={FileSearch}
          label="Pages audited"
          value={pagesAudited.toLocaleString()}
          hint={maxPages === 1 ? "Your homepage, fully analyzed" : `Up to ${maxPages} per site`}
        />
        <Kpi
          icon={CircleAlert}
          label="Open problems"
          value={openProblems.toLocaleString()}
          hint={
            pagesAudited === 0
              ? "Appears after the first crawl"
              : openProblems === 0
                ? "Nothing failing right now"
                : "Failing checks on latest crawls"
          }
          tone={pagesAudited === 0 ? undefined : openProblems > 0 ? "bad" : "good"}
        />
        <Kpi
          icon={Activity}
          label="Average SEO score"
          value={avgScore == null ? "-" : `${avgScore}`}
          suffix={avgScore == null ? undefined : "/100"}
          hint={scored.length === 0 ? "Appears after the first crawl" : `Across ${scored.length} ${scored.length === 1 ? "site" : "sites"}`}
          tone={avgScore == null ? undefined : ratingTone(avgScore)}
        />
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(300px,340px)]">
        <div className="flex min-w-0 flex-col gap-4">
          {sites.length === 0 ? <EmptyWorkspace /> : null}

          <Card
            title="Recent crawls"
            icon={History}
            meta={crawls.length > 0 ? `${crawls.length} most recent runs across your sites` : undefined}
          >
            {crawls.length === 0 ? (
              <p className="px-5 pb-5 text-sm leading-6 text-body">
                Every crawl you run shows up here, with its score and problem count, so you can
                see how each site changed over time.
              </p>
            ) : (
              <ol className="divide-y divide-hairline border-t border-hairline">
                {crawls.map((crawl, index) => {
                  const previous = crawls
                    .slice(index + 1)
                    .find((row) => row.projectId === crawl.projectId && row.seoScore != null);
                  const score = crawl.seoScore == null ? null : Math.round(crawl.seoScore);
                  const delta =
                    score != null && previous?.seoScore != null
                      ? score - Math.round(previous.seoScore)
                      : null;
                  return (
                    <li key={crawl.id}>
                      <Link
                        href={`/projects/${crawl.project.id}`}
                        className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-5 py-3.5 hover:bg-surface-card/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto]"
                      >
                        <Favicon host={hostnameOf(crawl.project.rootUrl)} />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-ink">
                            {hostnameOf(crawl.project.rootUrl)}
                          </p>
                          <p className="font-mono text-[12px] text-muted-foreground">
                            {formatRelative(crawl.startedAt)} · {crawl.analyzed.toLocaleString()}{" "}
                            {crawl.analyzed === 1 ? "page" : "pages"}
                          </p>
                        </div>
                        <div className="hidden text-right sm:block">
                          <p className="font-mono text-[11px] text-muted-foreground">Problems</p>
                          <p className="font-mono text-sm tabular-nums text-ink">{crawl.issueCount}</p>
                        </div>
                        <div className="hidden w-20 text-right sm:block">
                          <p className="font-mono text-[11px] text-muted-foreground">SEO</p>
                          <p className="font-mono text-sm tabular-nums">
                            <span className={score == null ? "text-muted-foreground" : ratingText(score)}>
                              {score ?? "-"}
                            </span>
                            {delta ? (
                              <span className={cn("ml-1.5 text-[11px]", delta > 0 ? "text-good" : "text-bad")}>
                                {delta > 0 ? `+${delta}` : delta}
                              </span>
                            ) : null}
                          </p>
                        </div>
                        <StatusBadge status={crawl.status} />
                      </Link>
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>

          {sites.length > 0 ? (
            <Card title="Websites" icon={Globe} meta={`${sites.length} in your workspace`}>
              <div className="relative overflow-x-auto border-t border-hairline">
                <table className="w-full min-w-[640px] text-left">
                  <caption className="sr-only">
                    Your websites with status, SEO score, mobile score and open problems
                  </caption>
                  <thead>
                    <tr className="border-b border-hairline font-mono text-[12px] text-muted-foreground">
                      <th className="px-5 py-3 font-medium">Website</th>
                      <th className="px-5 py-3 font-medium">Added</th>
                      <th className="px-5 py-3 font-medium">Status</th>
                      <th className="px-5 py-3 font-medium">SEO</th>
                      <th className="px-5 py-3 font-medium">Mobile</th>
                      <th className="px-5 py-3 font-medium">Problems</th>
                      <th className="px-5 py-3 font-medium">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sites.map((site) => (
                      <tr key={site.id} className="border-b border-hairline last:border-b-0">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <Favicon host={site.host} />
                            <div className="min-w-0">
                              <Link
                                href={`/projects/${site.id}`}
                                className="text-sm font-medium text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                {site.name}
                              </Link>
                              <p className="truncate font-mono text-[12px] text-muted-foreground">{site.host}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3 font-mono text-[12px] tabular-nums text-body">
                          {dateFmt.format(site.createdAt)}
                        </td>
                        <td className="px-5 py-3">
                          <StatusBadge status={site.status} />
                        </td>
                        <td className={cn("px-5 py-3 font-mono text-sm tabular-nums", site.score == null ? "text-muted-foreground" : ratingText(site.score))}>
                          {site.score ?? "-"}
                        </td>
                        <td className={cn("px-5 py-3 font-mono text-sm tabular-nums", site.mobile == null ? "text-muted-foreground" : ratingText(site.mobile))}>
                          {site.mobile ?? "-"}
                        </td>
                        <td className="px-5 py-3 font-mono text-sm tabular-nums text-ink">{site.problems}</td>
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <Link
                              href={`/projects/${site.id}`}
                              className="inline-flex h-11 items-center gap-1 px-2 font-mono text-[12px] text-body hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              Open
                              <ArrowUpRight className="size-3.5" aria-hidden />
                            </Link>
                            <DeleteProjectButton projectId={site.id} siteName={site.host} redirectTo="/dashboard" />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : null}
        </div>

        <aside className="flex flex-col gap-4">
          <PlanCard
            premium={premium}
            planLabel={planLabel}
            used={sites.length}
            maxProjects={maxProjects}
            limits={limits}
            quota={quota}
          />

          <Card title="Most common problems" icon={Radar}>
            {topProblems.length === 0 ? (
              <p className="px-5 pb-5 text-sm leading-6 text-body">
                Once a crawl finishes, the checks that fail most often across your sites are
                ranked here.
              </p>
            ) : (
              <ul className="flex flex-col gap-3 px-5 pb-5">
                {topProblems.map(([id, count]) => (
                  <li key={id} className="flex flex-col gap-1.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate text-sm text-ink">{CHECK_LABEL[id] ?? id}</p>
                      <p className="shrink-0 font-mono text-[12px] tabular-nums text-body">
                        {count} {count === 1 ? "page" : "pages"}
                      </p>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface-card">
                      <span
                        className="block h-full rounded-full bg-warn"
                        style={{ width: `${topMax ? (count / topMax) * 100 : 0}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}

function EmptyWorkspace() {
  const steps = [
    { icon: Globe, title: "Add a website", body: "Paste its address. The crawl starts right away." },
    { icon: FileSearch, title: "Read the problems", body: "Every check that fails, ranked by severity." },
    { icon: Wrench, title: "Fix and re-crawl", body: "Run it again and watch the score move here." },
  ];
  return (
    <section
      aria-labelledby="empty-title"
      className="relative overflow-hidden rounded-xl bg-surface-soft p-6 ring-1 ring-hairline sm:p-8"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 right-0 size-72 rounded-full bg-primary/10 blur-3xl"
      />
      <div className="relative flex flex-col gap-6">
        <div className="flex max-w-lg flex-col gap-2">
          <h2 id="empty-title" className="font-display text-[22px] leading-7 tracking-[-0.4px] text-ink">
            No websites yet
          </h2>
          <p className="text-sm leading-6 text-body">
            Add your first site and this dashboard fills with its crawls, scores and problems.
          </p>
        </div>
        <ol className="grid gap-3 sm:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.title} className="flex flex-col gap-2 rounded-lg bg-canvas/60 p-4 ring-1 ring-hairline">
              <span className="flex items-center gap-2 font-mono text-[12px] text-muted-foreground">
                <span className="flex size-6 items-center justify-center rounded-full bg-surface-card text-ink">
                  <step.icon className="size-3.5" aria-hidden />
                </span>
                Step {index + 1}
              </span>
              <p className="text-sm font-medium text-ink">{step.title}</p>
              <p className="text-xs leading-5 text-body">{step.body}</p>
            </li>
          ))}
        </ol>
        <Link
          href="/projects/new"
          className="inline-flex h-11 w-fit items-center gap-2 rounded-md bg-primary px-4 font-mono text-sm text-primary-foreground transition-colors hover:bg-primary-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus className="size-4" aria-hidden />
          Add your first website
        </Link>
      </div>
    </section>
  );
}

function PlanCard({
  premium,
  planLabel,
  used,
  maxProjects,
  limits,
  quota,
}: {
  premium: boolean;
  planLabel: string;
  used: number;
  maxProjects: number;
  limits: PlanLimits;
  quota: QuotaView;
}) {
  const features = [
    { label: limits.maxPages === 1 ? "Homepage Deep Analysis" : `Up to ${limits.maxPages} pages per crawl`, on: true },
    { label: "Quick Search", on: true },
    { label: limits.maxPages === 1 ? "Homepage performance" : "Performance", on: limits.performance },
    { label: limits.aiHomepageOnly ? "Page AI on your homepage" : "Page AI on every page", on: limits.ai },
    { label: "Site AI", on: limits.siteAi },
    { label: "Competitor AI", on: limits.competitorAi },
    {
      label: limits.recrawlsPerSite == null ? "Unlimited re-crawls" : `${limits.recrawlsPerSite} re-crawl per site`,
      on: true,
    },
  ];
  const ai = quota.daily.limit != null && quota.weekly.limit != null ? quota : null;
  const pct = maxProjects > 0 ? Math.min(100, (used / maxProjects) * 100) : 0;

  return (
    <section
      aria-labelledby="plan-title"
      className="flex flex-col gap-5 rounded-xl bg-surface-soft p-5 ring-1 ring-hairline"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="font-mono text-[12px] text-muted-foreground">Your plan</p>
          <h2 id="plan-title" className="font-display text-[22px] leading-none tracking-[-0.4px] text-ink">
            {planLabel}
          </h2>
        </div>
        {premium ? (
          <span className="rounded-full bg-good/15 px-2.5 py-1 font-mono text-[11px] text-good">Premium</span>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between font-mono text-[12px]">
          <span className="text-body">Websites used</span>
          <span className="tabular-nums text-ink">
            {used} of {maxProjects}
          </span>
        </div>
        <div
          role="progressbar"
          aria-label="Websites used"
          aria-valuemin={0}
          aria-valuemax={maxProjects}
          aria-valuenow={used}
          className="h-1.5 overflow-hidden rounded-full bg-surface-card"
        >
          <span
            className={cn("block h-full rounded-full", pct >= 100 ? "bg-primary" : "bg-good")}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <ul className="flex flex-col gap-2.5">
        {features.map((feature) => (
          <li
            key={feature.label}
            className={cn("flex items-center gap-2 text-sm", feature.on ? "text-ink" : "text-muted-foreground")}
          >
            {feature.on ? (
              <Check className="size-3.5 shrink-0 text-good" aria-hidden />
            ) : (
              <Lock className="size-3.5 shrink-0" aria-hidden />
            )}
            {feature.label}
            <span className="sr-only">{feature.on ? "(included)" : "(premium)"}</span>
          </li>
        ))}
      </ul>

      {ai ? (
        <div className="flex flex-col gap-1.5 rounded-lg bg-canvas/60 p-3 ring-1 ring-hairline">
          <p className="font-mono text-[12px] text-muted-foreground">AI recommendations left</p>
          <p className="flex items-baseline justify-between font-mono text-[12px]">
            <span className="text-body">Today</span>
            <span className="tabular-nums text-ink">
              {ai.daily.remaining} of {ai.daily.limit}
            </span>
          </p>
          <p className="flex items-baseline justify-between font-mono text-[12px]">
            <span className="text-body">This week</span>
            <span className="tabular-nums text-ink">
              {ai.weekly.remaining} of {ai.weekly.limit}
            </span>
          </p>
        </div>
      ) : null}

      {premium ? null : <GoPremiumButton className="w-full" />}
    </section>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  suffix,
  hint,
  tone,
  progress,
}: {
  icon: typeof Globe;
  label: string;
  value: string;
  suffix?: string;
  hint: string;
  tone?: "good" | "warn" | "bad";
  progress?: number;
}) {
  return (
    <div className="flex min-h-[132px] flex-col justify-between gap-3 rounded-xl bg-surface-soft p-4 ring-1 ring-hairline">
      <p className="flex items-center gap-2 font-mono text-[12px] text-muted-foreground">
        <span className="flex size-5 items-center justify-center rounded-full bg-surface-card">
          <Icon className="size-3" aria-hidden />
        </span>
        {label}
      </p>
      <p
        className={cn(
          "font-display text-[32px] leading-none tracking-[-0.8px] tabular-nums",
          tone === "good" ? "text-good" : tone === "warn" ? "text-warn" : tone === "bad" ? "text-bad" : "text-ink",
        )}
      >
        {value}
        {suffix ? <span className="ml-1 text-[16px] text-muted-foreground">{suffix}</span> : null}
      </p>
      {progress != null ? (
        <div className="h-1 overflow-hidden rounded-full bg-surface-card" aria-hidden>
          <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.min(100, progress * 100)}%` }} />
        </div>
      ) : null}
      <p className="truncate text-xs leading-5 text-body">{hint}</p>
    </div>
  );
}

function Card({
  title,
  icon: Icon,
  meta,
  children,
}: {
  title: string;
  icon: typeof Globe;
  meta?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col overflow-hidden rounded-xl bg-surface-soft ring-1 ring-hairline">
      <header className="flex flex-wrap items-center justify-between gap-2 px-5 py-4">
        <h2 className="flex items-center gap-2 font-display text-[18px] leading-6 tracking-[-0.3px] text-ink">
          <span className="flex size-6 items-center justify-center rounded-full bg-surface-card text-body">
            <Icon className="size-3.5" aria-hidden />
          </span>
          {title}
        </h2>
        {meta ? <p className="font-mono text-[12px] text-muted-foreground">{meta}</p> : null}
      </header>
      {children}
    </section>
  );
}

function Favicon({ host }: { host: string }) {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-card ring-1 ring-hairline">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`}
        alt=""
        width={18}
        height={18}
        className="size-[18px]"
      />
    </span>
  );
}

function toSite(project: ProjectRow) {
  const crawled = project.pages.filter(isCrawled);
  const homepage = project.pages[0] ?? null;
  const mobile =
    homepage?.performance.find((audit) => audit.strategy === "mobile")?.performance ?? null;

  return {
    id: project.id,
    name: project.name,
    host: hostnameOf(project.rootUrl),
    status: project.status,
    createdAt: project.createdAt,
    crawled: crawled.length,
    score: siteSeoScore(project.pages),
    mobile: mobile == null ? null : Math.round(mobile),
    problems: crawled.reduce((sum, page) => sum + failedChecks(page).length, 0),
  };
}

function hostnameOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function ratingTone(score: number): "good" | "warn" | "bad" | undefined {
  const rating = scoreRating(score);
  return rating === "none" ? undefined : rating;
}

function ratingText(score: number) {
  const rating = scoreRating(score);
  if (rating === "good") return "text-good";
  if (rating === "warn") return "text-warn";
  if (rating === "bad") return "text-bad";
  return "text-ink";
}

function formatRelative(date: Date) {
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} ${days === 1 ? "day" : "days"} ago`;
  return dateFmt.format(date);
}

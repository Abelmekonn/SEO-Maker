import Link from "next/link";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  FileSearch,
  Gauge,
  Globe,
  ListChecks,
  Lock,
  Radar,
  Zap,
} from "lucide-react";
import { GoPremiumButton } from "@/components/project/PremiumGate";
import { UrlIntakeForm } from "@/components/project/UrlIntakeForm";
import { checks } from "@/lib/page-audit";
import type { PlanLimits, PlanId } from "@/lib/plan";
import { cn } from "@/lib/utils";

/** The add-a-website screen. The route handles auth and data; this renders it. */
export function NewProjectView({
  plan,
  limits,
  projects,
  url,
}: {
  plan: PlanId;
  limits: PlanLimits;
  projects: Array<{ id: string; name: string }>;
  url?: string;
}) {
  const account = { plan, limits };
  const premium = account.plan !== "free";
  const { maxProjects, maxPages, label: planLabel } = account.limits;
  const atLimit = projects.length >= maxProjects;
  const existing = projects[0] ?? null;

  const steps = [
    {
      icon: Radar,
      title: "We crawl the site",
      body:
        maxPages === 1
          ? "The homepage is fetched and parsed, including robots.txt and the sitemap."
          : `Up to ${maxPages} pages are fetched, starting with the homepage.`,
    },
    {
      icon: ListChecks,
      title: `${checks.length} checks run on every page`,
      body: "Status, titles, headings, canonicals, schema, indexability and more.",
    },
    {
      icon: FileSearch,
      title: "You get the exact error and fix",
      body: "Each problem comes with the evidence the crawler saw, and AI recommendations when you ask for them.",
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 font-mono text-[12px] text-muted-foreground">
        <Link href="/dashboard" className="hover:text-ink">
          Workspace
        </Link>
        <ChevronRight className="size-3" aria-hidden />
        <span className="text-ink">New website</span>
      </nav>

      <div className="grid flex-1 grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
        <section
          aria-labelledby="new-title"
          className="relative flex flex-col overflow-hidden rounded-2xl bg-surface-soft ring-1 ring-hairline"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -top-40 -right-24 size-[420px] rounded-full bg-primary/10 blur-3xl"
          />
          <div className="relative flex flex-1 flex-col gap-8 p-6 sm:p-10">
            <div className="flex max-w-2xl flex-col gap-3">
              <p className="font-mono text-[12px] text-primary">New website</p>
              <h1
                id="new-title"
                className="font-display text-[34px] leading-[1.1] tracking-[-1px] text-ink sm:text-[44px]"
              >
                What site should we audit?
              </h1>
              <p className="max-w-xl text-base leading-7 text-body">
                Paste an address and we find every SEO problem on it: what is broken, how badly,
                and where.
              </p>
            </div>

            {atLimit ? (
              <LimitNotice
                premium={premium}
                planLabel={planLabel}
                maxProjects={maxProjects}
                existing={existing ? { id: existing.id, name: existing.name } : null}
              />
            ) : (
              <UrlIntakeForm
                initialUrl={url ?? ""}
                canUseDeep={account.limits.deepMode}
                maxPages={maxPages}
              />
            )}
          </div>

          <div className="relative border-t border-hairline px-6 py-5 sm:px-10">
            <p className="mb-3 font-mono text-[12px] text-muted-foreground">
              Checked on every page
            </p>
            <ul className="flex flex-wrap gap-2">
              {checks.map((check) => (
                <li
                  key={check.id}
                  className="rounded-full bg-canvas/70 px-3 py-1 font-mono text-[12px] text-body ring-1 ring-hairline"
                >
                  {check.label}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <aside className="flex flex-col gap-4">
          <section
            aria-labelledby="next-title"
            className="flex flex-col gap-5 rounded-2xl bg-surface-soft p-6 ring-1 ring-hairline"
          >
            <h2 id="next-title" className="font-display text-[18px] leading-6 tracking-[-0.3px] text-ink">
              What happens next
            </h2>
            <ol className="relative flex flex-col gap-5">
              <span aria-hidden className="absolute top-4 bottom-4 left-4 w-px bg-hairline" />
              {steps.map((step) => (
                <li key={step.title} className="relative flex gap-4">
                  <span className="z-10 flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-card text-ink ring-4 ring-surface-soft">
                    <step.icon className="size-3.5" aria-hidden />
                  </span>
                  <div className="flex flex-col gap-1 pt-1">
                    <p className="text-sm font-medium text-ink">{step.title}</p>
                    <p className="text-xs leading-5 text-body">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section
            aria-labelledby="plan-title"
            className="flex flex-col gap-4 rounded-2xl bg-surface-soft p-6 ring-1 ring-hairline"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 id="plan-title" className="font-display text-[18px] leading-6 tracking-[-0.3px] text-ink">
                {planLabel} plan
              </h2>
              <span className="font-mono text-[12px] tabular-nums text-body">
                {projects.length} of {maxProjects} sites
              </span>
            </div>
            <ul className="flex flex-col gap-2.5 text-sm">
              <PlanLine on label={maxPages === 1 ? "Homepage Deep Analysis" : `${maxPages} pages per crawl`} icon={Gauge} />
              <PlanLine on label="Quick Search" />
              <PlanLine on={account.limits.performance} label={maxPages === 1 ? "Homepage performance" : "Performance"} />
              <PlanLine
                on={account.limits.ai}
                label={
                  account.limits.aiDailyLimit != null
                    ? `Page AI: ${account.limits.aiDailyLimit} a day, ${account.limits.aiWeeklyLimit} a week`
                    : "Page AI on every page"
                }
              />
              <PlanLine on={account.limits.siteAi} label="Site AI" />
              <PlanLine on={account.limits.competitorAi} label="Competitor AI" />
              <PlanLine
                on
                label={
                  account.limits.recrawlsPerSite == null
                    ? "Unlimited re-crawls"
                    : `${account.limits.recrawlsPerSite} re-crawl per site`
                }
              />
            </ul>
            {premium ? null : <GoPremiumButton className="w-full" />}
          </section>

          {projects.length > 0 ? (
            <section
              aria-labelledby="recent-title"
              className="flex flex-col gap-2 rounded-2xl bg-surface-soft p-6 ring-1 ring-hairline"
            >
              <h2 id="recent-title" className="font-display text-[18px] leading-6 tracking-[-0.3px] text-ink">
                Your websites
              </h2>
              <ul className="flex flex-col">
                {projects.slice(0, 4).map((project) => (
                  <li key={project.id}>
                    <Link
                      href={`/projects/${project.id}`}
                      className="flex min-h-11 items-center gap-3 border-t border-hairline py-2 text-sm text-ink first:border-t-0 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Globe className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{project.name}</span>
                      <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function PlanLine({ on, label, icon: Icon }: { on: boolean; label: string; icon?: typeof Gauge }) {
  const Mark = on ? (Icon ?? Check) : Lock;
  return (
    <li className={cn("flex items-center gap-2", on ? "text-ink" : "text-muted-foreground")}>
      <Mark className={cn("size-3.5 shrink-0", on && "text-good")} aria-hidden />
      {label}
      <span className="sr-only">{on ? "(included)" : "(premium)"}</span>
    </li>
  );
}

function LimitNotice({
  premium,
  planLabel,
  maxProjects,
  existing,
}: {
  premium: boolean;
  planLabel: string;
  maxProjects: number;
  existing: { id: string; name: string } | null;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-xl bg-canvas/70 p-5 ring-1 ring-hairline">
      <div className="flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-card">
          <Lock className="size-4 text-muted-foreground" aria-hidden />
        </span>
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-ink">
            {premium ? "You have reached your plan's website limit" : "You have used your free website"}
          </p>
          <p className="text-sm leading-6 text-body">
            {planLabel} includes {maxProjects === 1 ? "1 website" : `${maxProjects} websites`}.
            {premium
              ? " Remove a website or contact us for a larger plan."
              : " Go premium to audit more sites and every page on them."}{" "}
            Quick Search still works for any URL.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {premium ? null : <GoPremiumButton />}
        <Link
          href="/quick-search"
          className="inline-flex h-11 items-center gap-1.5 rounded-md px-4 font-mono text-sm text-ink ring-1 ring-hairline hover:bg-surface-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Zap className="size-3.5" aria-hidden />
          Quick Search
        </Link>
        {existing ? (
          <Link
            href={`/projects/${existing.id}`}
            className="inline-flex h-11 items-center gap-1.5 rounded-md px-4 font-mono text-sm text-ink ring-1 ring-hairline hover:bg-surface-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Open {existing.name}
            <ArrowUpRight className="size-3.5" aria-hidden />
          </Link>
        ) : null}
      </div>
    </div>
  );
}

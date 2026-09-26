import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { CircleAlert, CircleCheck, FileCode2, ShieldCheck, TriangleAlert } from "lucide-react";
import type { RobotsAudit } from "@seo-maker/core/robots";
import { foundSitemapUrl, recommendRobots, recommendSitemap } from "@seo-maker/core/site";
import type { SitemapAudit } from "@seo-maker/core/sitemap";
import { prisma } from "@seo-maker/db";
import { GeneratedFile } from "@/components/project/GeneratedFile";
import { premiumGate } from "@/components/project/PremiumRoute";
import { getProjectForUser, requireUserId } from "@/lib/projects";
import { cn } from "@/lib/utils";

/**
 * sitemap.xml and robots.txt from crawl evidence (Phase 3.4).
 *
 * Deterministic, never AI: every URL in the generated sitemap is a page this
 * crawl fetched and found indexable and canonical to itself, and both files
 * are read back with the crawler's own parsers before they are offered.
 */

function readAudit<T>(value: unknown): T | null {
  return value && typeof value === "object" && "found" in value ? (value as T) : null;
}

const STATUS = {
  ok: { label: "Looks right", className: "bg-good/10 text-good", icon: CircleCheck },
  missing: { label: "Not found on the site", className: "bg-bad/10 text-bad", icon: CircleAlert },
  "needs-changes": { label: "Needs changes", className: "bg-warn/10 text-warn", icon: TriangleAlert },
} as const;

const SEVERITY_STYLE: Record<string, string> = {
  critical: "text-bad",
  high: "text-bad",
  medium: "text-warn",
  low: "text-body",
};

export default async function ProjectToolsPage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  if (!userId) {
    redirect("/sign-in");
  }
  const { id } = await params;
  const project = await getProjectForUser(id, userId);
  if (!project) {
    notFound();
  }
  const gate = await premiumGate(project.id, "tools");
  if (gate) {
    return gate;
  }

  const crawl = project.latestCrawlId
    ? await prisma.crawl.findUnique({
        where: { id: project.latestCrawlId },
        select: { robotsAudit: true, sitemapAudit: true, discovered: true, startedAt: true },
      })
    : null;

  if (!crawl) {
    return (
      <div className="flex flex-col gap-4">
        <Header />
        <p className="rounded-xl bg-surface-soft p-6 text-sm leading-6 text-body ring-1 ring-hairline">
          Crawl the site first. These files are built only from what a crawl finds.
        </p>
      </div>
    );
  }

  const sitemapAudit = readAudit<SitemapAudit>(crawl.sitemapAudit);
  const robotsAudit = readAudit<RobotsAudit>(crawl.robotsAudit);
  const sitemap = recommendSitemap({
    rootUrl: project.rootUrl,
    pages: project.pages,
    audit: sitemapAudit,
    discovered: crawl.discovered,
  });
  const foundSitemap = foundSitemapUrl(sitemapAudit);
  let origin = project.rootUrl;
  try {
    origin = new URL(project.rootUrl).origin;
  } catch {
    // rootUrl is validated on creation; keep it as is if it somehow is not a URL.
  }
  const sitemapUrl = foundSitemap ?? `${origin}/sitemap.xml`;
  const robots = recommendRobots({ audit: robotsAudit, sitemapUrl });

  const exclusionReasons = new Map<string, number>();
  for (const row of sitemap.generated.excluded) {
    const reason = row.reason.startsWith("Canonical points to") ? "Canonical points elsewhere" : row.reason;
    exclusionReasons.set(reason, (exclusionReasons.get(reason) ?? 0) + 1);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <Header />

      <Card
        icon={FileCode2}
        title="sitemap.xml"
        status={sitemap.status}
        intro={
          sitemap.status === "missing"
            ? "The crawl found no sitemap. This one lists the pages it fetched that belong in search."
            : `The crawl read your sitemap at ${foundSitemap ?? "the declared address"}. Below is what to change in it, and a file generated from this crawl.`
        }
      >
        <p className="text-sm leading-6 text-body">{sitemap.coverageNote}</p>

        {sitemap.remove.length > 0 ? (
          <Listing title={`Remove or replace in your current sitemap (${sitemap.remove.length})`}>
            {sitemap.remove.slice(0, 50).map((row) => (
              <li key={row.url} className="flex flex-col gap-0.5 py-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <span className="truncate font-mono text-[12px] text-ink">{row.url}</span>
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                  {row.reason}
                  {row.replaceWith ? ` → ${row.replaceWith}` : ""}
                </span>
              </li>
            ))}
          </Listing>
        ) : null}

        {sitemap.add.length > 0 ? (
          <Listing title={`Add to your current sitemap (${sitemap.add.length})`}>
            {sitemap.add.slice(0, 50).map((url) => (
              <li key={url} className="truncate py-1.5 font-mono text-[12px] text-ink">
                {url}
              </li>
            ))}
          </Listing>
        ) : null}

        {sitemap.generated.validation.ok ? (
          <>
            <Validated>
              Read back with the crawler&apos;s own sitemap parser: {sitemap.generated.urls.length} URLs, all from this crawl.
            </Validated>
            <GeneratedFile filename="sitemap.xml" content={sitemap.generated.xml} mime="application/xml" label="Generated from this crawl" />
          </>
        ) : (
          <p className="rounded-lg bg-warn/10 px-3 py-2 text-sm leading-6 text-warn">
            No file is offered: {sitemap.generated.validation.errors.join(" ")}
          </p>
        )}

        {exclusionReasons.size > 0 ? (
          <details className="rounded-lg bg-canvas/60 px-3 py-2 ring-1 ring-hairline">
            <summary className="cursor-pointer font-mono text-[12px] text-muted-foreground hover:text-ink">
              {sitemap.generated.excluded.length} crawled pages left out, and why
            </summary>
            <ul className="mt-2 flex flex-col gap-1">
              {[...exclusionReasons.entries()].map(([reason, count]) => (
                <li key={reason} className="flex justify-between gap-3 text-xs text-body">
                  <span>{reason}</span>
                  <span className="font-mono tabular-nums text-ink">{count}</span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </Card>

      <Card
        icon={ShieldCheck}
        title="robots.txt"
        status={robots.status}
        intro={
          robots.file
            ? "The crawl could not read a robots.txt. This minimal file allows crawling and declares the sitemap."
            : "SEO Maker keeps the audit of your robots.txt, not its text, so it suggests lines to add rather than a replacement that would drop your own rules."
        }
      >
        {robots.findings.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {robots.findings.map((finding) => (
              <li key={finding.message} className="flex items-start gap-2 text-sm leading-6">
                <span className={cn("shrink-0 font-mono text-[11px] leading-6", SEVERITY_STYLE[finding.severity])}>{finding.severity}</span>
                <span className="text-body">{finding.message}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm leading-6 text-body">robots.txt was found, parses cleanly and declares a sitemap.</p>
        )}

        {robots.file || robots.additions.length > 0 ? (
          <>
            {robots.validation.ok ? (
              <Validated>Read back with the crawler&apos;s own robots.txt parser: no warnings.</Validated>
            ) : (
              <p className="rounded-lg bg-warn/10 px-3 py-2 text-sm leading-6 text-warn">{robots.validation.errors.join(" ")}</p>
            )}
            <GeneratedFile
              filename="robots.txt"
              content={robots.file ?? `${robots.additions.join("\n")}\n`}
              mime="text/plain"
              label={robots.file ? "Serve this at /robots.txt" : "Add these lines to your robots.txt"}
            />
          </>
        ) : null}
        <p className="text-xs leading-5 text-muted-foreground">
          The Sitemap line points to {sitemapUrl},{" "}
          {foundSitemap ? "the sitemap the crawl found." : "where the generated sitemap should be published. Publish it there first."}
        </p>
      </Card>
    </div>
  );
}

function Header() {
  return (
    <header className="flex flex-col gap-2">
      <p className="font-mono text-[12px] text-primary">Tools</p>
      <h1 className="font-display text-[30px] leading-none tracking-[-0.8px] text-ink">Sitemap and robots.txt</h1>
      <p className="max-w-2xl text-sm leading-6 text-body">
        Built from this crawl&apos;s evidence, never by AI. Every URL is a page the crawl fetched and found indexable and
        canonical to itself.
      </p>
    </header>
  );
}

function Card({
  icon: Icon,
  title,
  status,
  intro,
  children,
}: {
  icon: typeof FileCode2;
  title: string;
  status: keyof typeof STATUS;
  intro: string;
  children: ReactNode;
}) {
  const badge = STATUS[status];
  return (
    <section aria-label={title} className="flex flex-col gap-4 rounded-xl bg-surface-soft p-5 ring-1 ring-hairline sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Icon className="size-4 text-body" aria-hidden />
        <h2 className="font-mono text-[15px] text-ink">{title}</h2>
        <span className={cn("ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[11px] leading-5", badge.className)}>
          <badge.icon className="size-3" aria-hidden />
          {badge.label}
        </span>
      </div>
      <p className="text-sm leading-6 text-body">{intro}</p>
      {children}
    </section>
  );
}

function Listing({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="font-mono text-[12px] text-muted-foreground">{title}</p>
      <ul className="flex max-h-64 flex-col divide-y divide-hairline overflow-auto rounded-lg bg-canvas/60 px-3 ring-1 ring-hairline">{children}</ul>
    </div>
  );
}

function Validated({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-1.5 text-sm leading-6 text-good">
      <CircleCheck className="size-3.5 shrink-0" aria-hidden />
      {children}
    </p>
  );
}

import type { Crawl } from "@seo-maker/db";
import { type CrawlComparison, isImprovement } from "@seo-maker/core/crawl";
import type { RobotsAudit } from "@seo-maker/core/robots";
import type { SitemapAudit } from "@seo-maker/core/sitemap";

/**
 * Crawl reliability, site-wide audits and run-over-run movement.
 *
 * All three were unbuildable before: failures were never stored, robots.txt
 * and the sitemap were reduced to two booleans, and a re-crawl overwrote the
 * previous run so there was nothing to compare with.
 */

export function CrawlHealth({
  crawl,
  comparison,
}: {
  crawl: Crawl | null;
  comparison: CrawlComparison | null;
}) {
  if (!crawl) {
    return null;
  }

  const robots = crawl.robotsAudit as RobotsAudit | null;
  const sitemap = crawl.sitemapAudit as SitemapAudit | null;
  const plan = crawl.seedPlan as { sections?: string[]; deferred?: number } | null;

  return (
    <section className="flex flex-col gap-5 rounded-xl bg-surface-soft p-5 ring-1 ring-hairline sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-lg text-ink">This crawl</h2>
        <p className="font-mono text-xs text-muted-foreground">
          {crawl.finishedAt
            ? new Date(crawl.finishedAt).toLocaleString()
            : `${crawl.status}…`}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <Stat label="Known pages" value={crawl.discovered} />
        <Stat label="Analyzed" value={crawl.analyzed} />
        <Stat label="Failed" value={crawl.failed} tone={crawl.failed > 0 ? "warn" : undefined} />
        <Stat label="Skipped" value={crawl.skipped} />
        <Stat label="Requests" value={crawl.requests} />
      </dl>

      {plan?.sections?.length ? (
        <p className="text-sm leading-6 text-body">
          This crawl fetched pages across{" "}
          <span className="font-mono text-ink">{plan.sections.length}</span> sections of the site
          {plan.deferred ? (
            <>
              {" "}
              — <span className="font-mono text-ink">{plan.deferred.toLocaleString()}</span> other
              known {plan.deferred === 1 ? "page was" : "pages were"} not chosen for it and kept their last results
            </>
          ) : null}
          .
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {robots ? <RobotsCard audit={robots} /> : null}
        {sitemap ? <SitemapCard audit={sitemap} /> : null}
      </div>

      {comparison ? <Comparison comparison={comparison} /> : null}
    </section>
  );
}

function RobotsCard({ audit }: { audit: RobotsAudit }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-canvas p-4 ring-1 ring-hairline">
      <h3 className="text-sm font-medium text-ink">robots.txt</h3>
      {!audit.found ? (
        <p className="text-sm text-body">Not reachable, so nothing restricts crawling.</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm text-body">
          <li>
            {audit.disallowCount} disallow and {audit.allowCount} allow rules apply to us
            {audit.appliedAgent ? ` (user-agent ${audit.appliedAgent})` : ""}.
          </li>
          <li>
            {audit.hasSitemapDirective
              ? `Declares ${audit.sitemaps.length} sitemap${audit.sitemaps.length === 1 ? "" : "s"}.`
              : "Declares no sitemap."}
          </li>
          {audit.crawlDelay != null ? <li>Crawl-delay: {audit.crawlDelay}s.</li> : null}
          {audit.warnings.length > 0 ? (
            <li className="text-ink">
              {audit.warnings.length} syntax problem
              {audit.warnings.length === 1 ? "" : "s"}, first on line {audit.warnings[0].line}.
            </li>
          ) : null}
          {audit.blockedSitemapUrls.length > 0 ? (
            <li className="text-ink">
              Blocks {audit.blockedSitemapUrls.length} URL
              {audit.blockedSitemapUrls.length === 1 ? "" : "s"} the sitemap advertises.
            </li>
          ) : null}
        </ul>
      )}
    </div>
  );
}

function SitemapCard({ audit }: { audit: SitemapAudit }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-canvas p-4 ring-1 ring-hairline">
      <h3 className="text-sm font-medium text-ink">Sitemap</h3>
      {!audit.found ? (
        <p className="text-sm text-body">No readable sitemap was found.</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm text-body">
          <li>
            {audit.urlCount.toLocaleString()} URLs across {audit.documents.length} document
            {audit.documents.length === 1 ? "" : "s"}
            {audit.valid ? "" : ", and at least one did not parse cleanly"}.
          </li>
          <li>
            {audit.sampledCount} checked in this crawl.
          </li>
          {audit.redirectingUrls.length > 0 ? (
            <li className="text-ink">
              {audit.redirectingUrls.length} listed URL
              {audit.redirectingUrls.length === 1 ? "" : "s"} redirect elsewhere.
            </li>
          ) : null}
          {audit.brokenUrls.length > 0 ? (
            <li className="text-ink">{audit.brokenUrls.length} listed URLs are broken.</li>
          ) : null}
          {audit.noindexUrls.length > 0 ? (
            <li className="text-ink">
              {audit.noindexUrls.length} listed URLs send noindex, which contradicts the sitemap.
            </li>
          ) : null}
          {audit.issueCount === 0 ? <li>No problems found.</li> : null}
        </ul>
      )}
    </div>
  );
}

function Comparison({ comparison }: { comparison: CrawlComparison }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-canvas p-4 ring-1 ring-hairline">
      <h3 className="text-sm font-medium text-ink">
        Since {new Date(comparison.previous.startedAt).toLocaleDateString()}
      </h3>
      {comparison.unchanged ? (
        <p className="text-sm text-body">Nothing measurable changed between these two crawls.</p>
      ) : (
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {comparison.deltas
            .filter((item) => item.change !== null && item.change !== 0)
            .map((item) => {
              const good = isImprovement(item);
              return (
                <div key={item.label} className="flex flex-col gap-1">
                  <dt className="text-xs text-muted-foreground">{item.label}</dt>
                  <dd
                    className={`font-mono text-lg ${good === false ? "text-ink" : "text-ink"}`}
                    title={good === false ? "Worse than the previous crawl" : "Better than the previous crawl"}
                  >
                    {item.change != null && item.change > 0 ? "+" : ""}
                    {item.change}
                  </dd>
                </div>
              );
            })}
        </dl>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "warn";
}) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`font-mono text-xl ${tone === "warn" ? "text-ink" : "text-ink"}`}>
        {value.toLocaleString()}
      </dd>
    </div>
  );
}

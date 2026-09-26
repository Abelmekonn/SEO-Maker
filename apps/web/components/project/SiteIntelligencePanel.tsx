import type { ReactNode } from "react";
import type { SiteIntelligence } from "@seo-maker/core/site";
import { Boxes, Gauge, Link2, Network, ScanSearch } from "lucide-react";

/**
 * What the site looks like to SEO Maker (Phase 3.1), in numbers.
 *
 * Built on the server from Site Intelligence, which carries the whole link
 * graph; only these counts are sent to the browser.
 */

export type SiteSummary = {
  analyzed: number;
  failed: number;
  discovered: number | null;
  coverage: number | null;
  pageTypes: Array<{ type: string; count: number }>;
  links: { averageInlinks: number | null; orphans: number; broken: number; generic: number; related: number };
  schema: { types: Array<{ type: string; count: number }>; without: number; invalid: number };
  duplicates: { titles: number; meta: number; h1: number; content: number };
  performance: { measured: number; medianMobile: number | null; poorLcp: number; poorCls: number; poorTbt: number } | null;
};

const pagesIn = (groups: Array<{ pages: string[] }>) => new Set(groups.flatMap((group) => group.pages)).size;

export function summarizeSite(intel: SiteIntelligence): SiteSummary {
  const mobile = intel.performance?.mobile ?? intel.performance?.desktop ?? null;
  return {
    analyzed: intel.coverage.analyzed,
    failed: intel.coverage.failed,
    discovered: intel.coverage.discovered,
    coverage: intel.coverage.ratio,
    pageTypes: Object.entries(intel.pageTypes)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6),
    links: {
      averageInlinks: intel.links.averageInlinks,
      orphans: intel.links.orphans.length,
      broken: intel.links.broken.length,
      generic: intel.links.genericAnchors.length,
      related: intel.links.relatedUnlinked.length,
    },
    schema: {
      types: Object.entries(intel.schema.byType)
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
      without: intel.schema.pagesWithout.length,
      invalid: intel.schema.invalid.length,
    },
    duplicates: {
      titles: pagesIn(intel.duplicates.titles),
      meta: pagesIn(intel.duplicates.metaDescriptions),
      h1: pagesIn(intel.duplicates.h1s),
      content: pagesIn(intel.duplicates.content),
    },
    performance: intel.performance
      ? {
          measured: intel.performance.pagesMeasured,
          medianMobile: mobile?.medianScore ?? null,
          poorLcp: mobile?.lcp.poor ?? 0,
          poorCls: mobile?.cls.poor ?? 0,
          poorTbt: mobile?.tbt.poor ?? 0,
        }
      : null,
  };
}

export function SiteIntelligencePanel({ summary }: { summary: SiteSummary }) {
  const partial = summary.discovered != null && summary.discovered > summary.analyzed;
  return (
    <section aria-labelledby="site-intel" className="flex flex-col gap-4 rounded-xl bg-surface-soft p-5 ring-1 ring-hairline">
      <div className="flex flex-col gap-1">
        <h2 id="site-intel" className="flex items-center gap-2 font-display text-[16px] leading-6 tracking-[-0.2px] text-ink">
          <ScanSearch className="size-4 text-body" aria-hidden />
          Site intelligence
        </h2>
        <p className="text-xs leading-5 text-muted-foreground">
          {summary.analyzed} pages analysed
          {summary.failed ? `, ${summary.failed} failed` : ""}
          {partial ? ` of ${summary.discovered!.toLocaleString("en")} known URLs` : ""}.
        </p>
      </div>

      {partial ? (
        <p className="rounded-lg bg-warn/10 px-3 py-2 text-xs leading-5 text-warn">
          The crawl covered {Math.max(1, Math.round((summary.coverage ?? 0) * 100))}% of the site it knows about. Findings
          that need the whole site, like orphan pages or missing pages, carry lower confidence.
        </p>
      ) : null}

      <Group title="Page types" icon={Boxes}>
        {summary.pageTypes.map((row) => (
          <Fact key={row.type} label={row.type} value={row.count} />
        ))}
      </Group>

      <Group title="Internal links" icon={Network}>
        <Fact label="Links in, per page" value={summary.links.averageInlinks ?? "-"} />
        <Fact label="Orphan pages" value={summary.links.orphans} tone={summary.links.orphans ? "warn" : undefined} />
        <Fact label="Links to error pages" value={summary.links.broken} tone={summary.links.broken ? "bad" : undefined} />
        <Fact label="Generic anchors" value={summary.links.generic} />
        <Fact label="Related, unlinked pairs" value={summary.links.related} />
      </Group>

      <Group title="Structured data" icon={Link2}>
        {summary.schema.types.length ? (
          summary.schema.types.map((row) => <Fact key={row.type} label={row.type} value={`${row.count} pages`} />)
        ) : (
          <Fact label="Types found" value="none" />
        )}
        <Fact label="Indexable pages without" value={summary.schema.without} />
        {summary.schema.invalid ? <Fact label="Blocks that do not parse" value={summary.schema.invalid} tone="bad" /> : null}
      </Group>

      <Group title="Duplicates" icon={Boxes}>
        <Fact label="Pages sharing a title" value={summary.duplicates.titles} />
        <Fact label="Pages sharing a description" value={summary.duplicates.meta} />
        <Fact label="Pages sharing an H1" value={summary.duplicates.h1} />
        <Fact label="Pages with identical text" value={summary.duplicates.content} tone={summary.duplicates.content ? "bad" : undefined} />
      </Group>

      <Group title="Performance" icon={Gauge}>
        {summary.performance ? (
          <>
            <Fact label="Pages measured" value={summary.performance.measured} />
            <Fact label="Median mobile score" value={summary.performance.medianMobile ?? "-"} />
            <Fact label="Poor LCP" value={summary.performance.poorLcp} tone={summary.performance.poorLcp ? "bad" : undefined} />
            <Fact label="Poor CLS" value={summary.performance.poorCls} tone={summary.performance.poorCls ? "bad" : undefined} />
            <Fact label="Poor TBT" value={summary.performance.poorTbt} tone={summary.performance.poorTbt ? "bad" : undefined} />
          </>
        ) : (
          <p className="text-xs leading-5 text-muted-foreground">
            PageSpeed has not run. Run it from Performance to add Core Web Vitals to these opportunities.
          </p>
        )}
      </Group>
    </section>
  );
}

function Group({ title, icon: Icon, children }: { title: string; icon: typeof Gauge; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 border-t border-hairline pt-3">
      <p className="flex items-center gap-1.5 font-mono text-[12px] text-muted-foreground">
        <Icon className="size-3.5" aria-hidden />
        {title}
      </p>
      <dl className="flex flex-col gap-1">{children}</dl>
    </div>
  );
}

function Fact({ label, value, tone }: { label: string; value: ReactNode; tone?: "warn" | "bad" }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="truncate text-xs leading-5 text-body">{label}</dt>
      <dd
        className={
          tone === "bad"
            ? "font-mono text-xs tabular-nums text-bad"
            : tone === "warn"
              ? "font-mono text-xs tabular-nums text-warn"
              : "font-mono text-xs tabular-nums text-ink"
        }
      >
        {value}
      </dd>
    </div>
  );
}

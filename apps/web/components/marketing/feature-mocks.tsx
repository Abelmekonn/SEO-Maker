import type { ReactNode } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Globe,
  Minus,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ----------------------------------------------------------------------------
   Shared window chrome.
   Base surface = canvas, grouped content = surface-1, lifted = surface-2.
   Text: primary white, secondary mkt-muted, tertiary mkt-subtle. Min 11px.
   Orange is reserved for the single highlighted value or primary action.
---------------------------------------------------------------------------- */

function Window({
  title,
  subtitle,
  aside,
  children,
}: {
  title: string;
  subtitle: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-52 flex-col bg-mkt-canvas text-white">
      <header className="flex items-center justify-between gap-4 border-b border-mkt-hairline px-5 py-3.5">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium leading-5">{title}</p>
          <p className="truncate font-mono text-[11px] leading-4 text-mkt-subtle">
            {subtitle}
          </p>
        </div>
        {aside}
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

function Segmented({ items, active }: { items: string[]; active: number }) {
  return (
    <div
      aria-hidden
      className="flex shrink-0 rounded-md border border-mkt-hairline bg-mkt-surface p-0.5"
    >
      {items.map((item, i) => (
        <span
          key={item}
          className={cn(
            "rounded-[5px] px-2.5 py-1 font-mono text-[11px] leading-4",
            i === active ? "bg-mkt-surface-2 text-white" : "text-mkt-subtle",
          )}
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function Status({ kind }: { kind: "ok" | "review" | "none" }) {
  if (kind === "ok") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium leading-4 text-emerald-300">
        <CheckCircle2 className="size-3" aria-hidden />
        Approved
      </span>
    );
  }
  if (kind === "review") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-orange/30 bg-brand-orange/10 px-2 py-0.5 text-[11px] font-medium leading-4 text-brand-orange">
        <AlertCircle className="size-3" aria-hidden />
        Review
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] leading-4 text-mkt-subtle">
      <Minus className="size-3" aria-hidden />
      Not crawled
    </span>
  );
}

function FakeButton({
  children,
  primary = false,
}: {
  children: ReactNode;
  primary?: boolean;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md px-3 font-mono text-[12px] font-medium",
        primary
          ? "bg-brand-orange text-brand-charcoal"
          : "border border-mkt-hairline bg-mkt-surface text-white",
      )}
    >
      {children}
    </span>
  );
}

/* ---------------------------------------------------------------------------- */

export function PagesMock() {
  const rows = [
    { path: "/", title: "Home — SEO Maker", words: 640, status: "ok" as const },
    { path: "/pricing", title: "Plans by page count for site audits and…", words: 410, status: "review" as const },
    { path: "/blog", title: "Missing H1", words: 1280, status: "review" as const },
    { path: "/about", title: "About the team", words: 520, status: "ok" as const },
    { path: "/docs", title: "—", words: 0, status: "none" as const },
  ];

  return (
    <Window
      title="Pages"
      subtitle="demo.example.com · 5 of 10 crawled"
      aside={<Segmented items={["All", "Review", "Approved"]} active={0} />}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_auto_auto] gap-x-5 border-b border-mkt-hairline px-5 py-2 font-mono text-[11px] uppercase tracking-[0.08em] text-mkt-subtle">
        <span>Path</span>
        <span>Title</span>
        <span className="text-right">Words</span>
        <span className="w-[92px]">Status</span>
      </div>
      <ul className="flex-1">
        {rows.map((row) => (
          <li
            key={row.path}
            className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_auto_auto] items-center gap-x-5 border-b border-mkt-hairline/70 px-5 py-3 last:border-b-0"
          >
            <span className="truncate font-mono text-[12px] text-white">{row.path}</span>
            <span
              className={cn(
                "truncate text-[13px]",
                row.status === "none" ? "text-mkt-subtle" : "text-mkt-muted",
              )}
            >
              {row.title}
            </span>
            <span className="text-right font-mono text-[12px] tabular-nums text-mkt-muted">
              {row.words ? row.words.toLocaleString() : "—"}
            </span>
            <span className="w-[92px]">
              <Status kind={row.status} />
            </span>
          </li>
        ))}
      </ul>
    </Window>
  );
}

export function ChartMock() {
  const bars = [
    { path: "/", value: 1.6 },
    { path: "/pricing", value: 2.1 },
    { path: "/blog", value: 3.4 },
    { path: "/about", value: 1.9 },
    { path: "/docs", value: 2.7 },
    { path: "/faq", value: 1.4 },
  ];
  const max = 4;
  const good = 2.5;
  const highlight = 2;

  return (
    <Window
      title="Largest Contentful Paint"
      subtitle="PageSpeed · mobile · 6 pages"
      aside={<Segmented items={["LCP", "CLS", "INP"]} active={0} />}
    >
      <div className="grid flex-1 grid-cols-[minmax(0,1fr)_132px]">
        <figure className="flex flex-col px-5 pt-4">
          <figcaption className="flex items-baseline gap-2">
            <span className="font-heading text-[28px] font-semibold leading-none tracking-[-0.6px]">
              3.4 s
            </span>
            <span className="text-[12px] text-mkt-muted">slowest page · /blog</span>
          </figcaption>
          <div className="relative mt-4 flex-1">
            {[0, 1, 2, 3].map((line) => (
              <div
                key={line}
                className="absolute inset-x-0 border-t border-mkt-hairline/60"
                style={{ bottom: `${(line / max) * 100}%` }}
              />
            ))}
            <div
              className="absolute inset-x-0 border-t border-dashed border-emerald-400/50"
              style={{ bottom: `${(good / max) * 100}%` }}
            >
              <span className="absolute right-0 -top-4 font-mono text-[11px] text-emerald-300">
                Good ≤ 2.5 s
              </span>
            </div>
            <ul
              className="absolute inset-0 flex items-end gap-3"
              aria-label="LCP per page in seconds"
            >
              {bars.map((bar, i) => (
                <li
                  key={bar.path}
                  className="flex h-full flex-1 flex-col justify-end"
                  aria-label={`${bar.path} ${bar.value} seconds`}
                >
                  <div
                    className={cn(
                      "w-full rounded-t-[3px]",
                      i === highlight ? "bg-brand-orange" : "bg-white/20",
                    )}
                    style={{ height: `${(bar.value / max) * 100}%` }}
                  />
                </li>
              ))}
            </ul>
          </div>
          <ul className="mt-2 flex gap-3 border-t border-mkt-hairline pt-2">
            {bars.map((bar, i) => (
              <li
                key={bar.path}
                className={cn(
                  "flex-1 truncate text-center font-mono text-[11px]",
                  i === highlight ? "text-white" : "text-mkt-subtle",
                )}
              >
                {bar.path}
              </li>
            ))}
          </ul>
        </figure>

        <aside className="flex flex-col justify-center gap-2 border-l border-mkt-hairline bg-mkt-surface px-4 py-4">
          {[
            { label: "LCP", value: "2.1 s", ok: true },
            { label: "CLS", value: "0.04", ok: true },
            { label: "INP", value: "180 ms", ok: true },
          ].map((stat) => (
            <div key={stat.label} className="rounded-lg bg-mkt-surface-2 px-3 py-2.5">
              <p className="font-mono text-[11px] text-mkt-subtle">{stat.label}</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-[15px] font-medium tabular-nums">
                {stat.value}
                <CheckCircle2 className="size-3.5 text-emerald-300" aria-label="Good" />
              </p>
            </div>
          ))}
        </aside>
      </div>
    </Window>
  );
}

export function GatewayMock() {
  return (
    <Window
      title="Title and meta"
      subtitle="/pricing · draft ready"
      aside={
        <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-mkt-muted">
          <Sparkles className="size-3 text-brand-orange" aria-hidden />
          Claude
        </span>
      }
    >
      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="rounded-lg border border-mkt-hairline bg-mkt-surface p-4">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-mkt-subtle">
              Current title
            </p>
            <span className="font-mono text-[11px] tabular-nums text-brand-orange">
              72 / 60
            </span>
          </div>
          <p className="mt-2 text-[13px] leading-5 text-mkt-muted line-through decoration-white/30">
            Pricing – SEO Maker – Plans and pricing for site audits and more
          </p>
        </div>

        <div className="rounded-lg border border-brand-orange/40 bg-mkt-surface p-4">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-brand-orange">
              Suggested title
            </p>
            <span className="font-mono text-[11px] tabular-nums text-mkt-muted">
              54 / 60
            </span>
          </div>
          <p className="mt-2 text-[15px] font-medium leading-6">
            Site audit plans by page count — SEO Maker
          </p>
          <p className="mt-3 text-[12px] leading-5 text-mkt-muted">
            Meta: Crawl the pages you choose, score on-page SEO, and compare
            competitors in one project. Free starts with the homepage.
          </p>
        </div>

        <div className="mt-auto flex items-center justify-between">
          <p className="text-[12px] text-mkt-subtle">You ship the change. Then re-audit.</p>
          <div className="flex gap-2">
            <FakeButton>Copy meta</FakeButton>
            <FakeButton primary>
              <Copy className="size-3.5" aria-hidden />
              Copy title
            </FakeButton>
          </div>
        </div>
      </div>
    </Window>
  );
}

export function ScheduleMock() {
  const scopes = [
    { name: "Homepage", note: "1 page · Free", on: false },
    { name: "Important pages", note: "Up to 10 · Pro", on: true },
    { name: "All pages", note: "Up to 100 · Agency", on: false },
  ];
  const queue = [
    { path: "/", done: true },
    { path: "/pricing", done: true },
    { path: "/blog", done: true },
    { path: "/about", done: false },
    { path: "/docs", done: false },
  ];
  const done = queue.filter((q) => q.done).length;

  return (
    <Window
      title="Crawl scope"
      subtitle="demo.example.com"
      aside={
        <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-mkt-muted">
          <Globe className="size-3" aria-hidden />
          {done} of {queue.length}
        </span>
      }
    >
      <div className="grid flex-1 grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <ul className="flex flex-col gap-2 p-5" aria-label="Scope options">
          {scopes.map((scope) => (
            <li
              key={scope.name}
              className={cn(
                "flex items-center gap-3 rounded-lg border px-3.5 py-3",
                scope.on
                  ? "border-brand-orange/50 bg-mkt-surface-2"
                  : "border-mkt-hairline bg-mkt-surface",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "flex size-4 items-center justify-center rounded-full border",
                  scope.on ? "border-brand-orange" : "border-white/25",
                )}
              >
                {scope.on ? <span className="size-2 rounded-full bg-brand-orange" /> : null}
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-medium">{scope.name}</span>
                <span className="block font-mono text-[11px] text-mkt-subtle">{scope.note}</span>
              </span>
            </li>
          ))}
        </ul>

        <div className="flex flex-col border-l border-mkt-hairline bg-mkt-surface">
          <p className="border-b border-mkt-hairline px-4 py-2 font-mono text-[11px] uppercase tracking-[0.08em] text-mkt-subtle">
            Queue
          </p>
          <ul className="flex-1">
            {queue.map((item) => (
              <li
                key={item.path}
                className="flex items-center justify-between border-b border-mkt-hairline/70 px-4 py-2.5 last:border-b-0"
              >
                <span className="font-mono text-[12px]">{item.path}</span>
                {item.done ? (
                  <CheckCircle2 className="size-3.5 text-emerald-300" aria-label="Crawled" />
                ) : (
                  <span className="font-mono text-[11px] text-mkt-subtle">queued</span>
                )}
              </li>
            ))}
          </ul>
          <div className="px-4 py-3">
            <div className="h-1 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-brand-orange"
                style={{ width: `${(done / queue.length) * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </Window>
  );
}

export function GapsMock() {
  const rows = [
    { path: "/guides/core-web-vitals", you: false, them: true },
    { path: "/pricing", you: true, them: true },
    { path: "/compare/alternatives", you: false, them: true },
    { path: "/blog/lcp-checklist", you: false, them: true },
    { path: "/about", you: true, them: true },
  ];
  const gaps = rows.filter((r) => !r.you && r.them).length;

  return (
    <Window
      title="Competitor pages"
      subtitle="you.com vs rival.co · manual entry"
      aside={
        <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-orange/30 bg-brand-orange/10 px-2 py-0.5 text-[11px] font-medium text-brand-orange">
          <AlertCircle className="size-3" aria-hidden />
          {gaps} gaps
        </span>
      }
    >
      <div className="grid grid-cols-[minmax(0,1fr)_72px_72px] border-b border-mkt-hairline px-5 py-2 font-mono text-[11px] uppercase tracking-[0.08em] text-mkt-subtle">
        <span>Path</span>
        <span className="text-center">You</span>
        <span className="text-center">Them</span>
      </div>
      <ul className="flex-1">
        {rows.map((row) => {
          const gap = !row.you && row.them;
          return (
            <li
              key={row.path}
              className={cn(
                "grid grid-cols-[minmax(0,1fr)_72px_72px] items-center border-b border-mkt-hairline/70 px-5 py-3 last:border-b-0",
                gap && "bg-mkt-surface",
              )}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate font-mono text-[12px]">{row.path}</span>
                {gap ? (
                  <span className="shrink-0 rounded-full border border-brand-orange/30 px-1.5 py-px font-mono text-[11px] text-brand-orange">
                    Gap
                  </span>
                ) : null}
              </span>
              <span className="flex justify-center">
                {row.you ? (
                  <CheckCircle2 className="size-4 text-emerald-300" aria-label="You have it" />
                ) : (
                  <Minus className="size-4 text-mkt-subtle" aria-label="Missing" />
                )}
              </span>
              <span className="flex justify-center">
                {row.them ? (
                  <CheckCircle2 className="size-4 text-mkt-muted" aria-label="They have it" />
                ) : (
                  <Minus className="size-4 text-mkt-subtle" aria-label="Missing" />
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </Window>
  );
}

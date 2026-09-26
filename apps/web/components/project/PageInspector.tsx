"use client";

import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import {
  Check,
  CircleAlert,
  Code2,
  Copy,
  FileSearch,
  History,
  Info,
  ListChecks,
  Lock,
  Sparkles,
  TriangleAlert,
  Wrench,
  X,
} from "lucide-react";
import { AiRunButton } from "@/components/ai/AiRunButton";
import { AnalyzeButton } from "@/components/project/AnalyzeButton";
import { TOKEN_CLASS, highlightLines, tokenClass } from "@/components/project/code-highlight";
import { CopyButton } from "@/components/project/CopyButton";
import { PageTypeControl } from "@/components/project/PageTypeControl";
import type { FixOption, InspectorCheck, PageAnalysis } from "@/lib/page-inspector";
import { cn } from "@/lib/utils";

/**
 * Everything the crawler checked on one page, in three tabs:
 *
 *   Issues  what needs attention, in plain words
 *   Code    each problem as code: the page's own markup, then the fix, as a
 *           change to that markup
 *   Passed  what is already right
 *
 * Findings are deterministic and come from the crawl. AI only explains them
 * and writes fixes, from the same evidence, when the user asks.
 */

type Tab = "issues" | "code" | "passed";

const SEVERITY_STYLE: Record<string, string> = {
  critical: "bg-bad/15 text-bad",
  high: "bg-bad/10 text-bad",
  medium: "bg-warn/15 text-warn",
  low: "bg-surface-card text-muted-foreground",
};

const SEVERITY_LABEL: Record<string, string> = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };

type Fact = { label: string; value: string };

export function PageInspector({
  projectId,
  pageId,
  pageType,
  checks,
  analysis,
  crawled,
  aiAllowed,
  aiEnabled,
  planLabel,
  facts,
}: {
  projectId: string;
  pageId: string;
  pageType: string | null;
  checks: InspectorCheck[];
  analysis: PageAnalysis | null;
  /** False until the crawl has results for this page. */
  crawled: boolean;
  /** Whether the plan includes Page AI on this page. */
  aiAllowed: boolean;
  /** Whether an AI provider is configured. */
  aiEnabled: boolean;
  planLabel: string;
  facts: Fact[];
}) {
  const issues = checks.filter((check) => check.status === "fail" || check.status === "warning");
  const passed = checks.filter((check) => check.status === "pass");
  const editable = checks.filter((check) => check.status === "fail" || check.status === "warning" || check.optional);
  const [tab, setTab] = useState<Tab>("issues");
  const [selected, setSelected] = useState<string | null>(editable[0]?.id ?? null);
  const [info, setInfo] = useState<InspectorCheck | null>(null);
  const tabsId = useId();
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ issues: null, code: null, passed: null });

  const tabs: Array<{ id: Tab; label: string; count: number; icon: typeof CircleAlert }> = [
    { id: "issues", label: "Issues", count: issues.length, icon: CircleAlert },
    { id: "code", label: "Code", count: editable.length, icon: Code2 },
    { id: "passed", label: "Passed", count: passed.length, icon: ListChecks },
  ];

  function onTabKey(event: KeyboardEvent<HTMLButtonElement>) {
    const order: Tab[] = ["issues", "code", "passed"];
    const index = order.indexOf(tab);
    const next =
      event.key === "ArrowRight" ? order[(index + 1) % 3] : event.key === "ArrowLeft" ? order[(index + 2) % 3] : null;
    if (!next) return;
    event.preventDefault();
    setTab(next);
    tabRefs.current[next]?.focus();
  }

  function openCode(id: string) {
    setSelected(id);
    setTab("code");
  }

  const blockedReason = aiEnabled ? undefined : "AI is not available right now. Try again later.";
  const failing = checks.filter((check) => check.status === "fail").length;
  const warnings = issues.length - failing;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(240px,280px)]">
      <section aria-label="Everything the crawler checked" className="flex min-w-0 flex-col">
        <div role="tablist" aria-label="Checks" className="flex items-end gap-1 overflow-x-auto px-1">
          {tabs.map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                ref={(node) => {
                  tabRefs.current[item.id] = node;
                }}
                type="button"
                role="tab"
                id={`${tabsId}-${item.id}`}
                aria-selected={active}
                aria-controls={`${tabsId}-${item.id}-panel`}
                tabIndex={active ? 0 : -1}
                onKeyDown={onTabKey}
                onClick={() => setTab(item.id)}
                className={cn(
                  "relative -mb-px inline-flex h-11 shrink-0 items-center gap-2 rounded-t-lg px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  active
                    ? "bg-surface-soft text-ink ring-1 ring-hairline [clip-path:inset(-1px_-1px_0_-1px)]"
                    : "text-muted-foreground hover:bg-surface-soft/50 hover:text-ink",
                )}
              >
                <item.icon className={cn("size-3.5", active && item.id === "issues" && issues.length > 0 && "text-bad")} aria-hidden />
                {item.label}
                <span className="rounded-full bg-surface-card px-1.5 font-mono text-[11px] tabular-nums text-body">
                  {item.count}
                </span>
              </button>
            );
          })}
        </div>

        <div
          role="tabpanel"
          id={`${tabsId}-${tab}-panel`}
          aria-labelledby={`${tabsId}-${tab}`}
          className="rounded-b-xl rounded-tr-xl bg-surface-soft ring-1 ring-hairline"
        >
          {tab === "issues" ? (
            <IssuesPanel
              projectId={projectId}
              pageId={pageId}
              issues={issues}
              analysis={analysis}
              crawled={crawled}
              aiAllowed={aiAllowed}
              blockedReason={blockedReason}
              planLabel={planLabel}
              onOpenCode={openCode}
            />
          ) : tab === "code" ? (
            <CodePanel
              projectId={projectId}
              pageId={pageId}
              pageType={pageType}
              checks={editable}
              selected={selected}
              onSelect={setSelected}
              aiAllowed={aiAllowed}
              blockedReason={blockedReason}
              onInfo={setInfo}
            />
          ) : (
            <PassedPanel passed={passed} crawled={crawled} />
          )}
        </div>
      </section>

      <aside className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 rounded-xl bg-surface-soft p-5 ring-1 ring-hairline">
          <p className="font-mono text-[12px] text-muted-foreground">Checks passed</p>
          <p className="font-display text-[40px] leading-none tracking-[-1px] tabular-nums text-ink">
            {crawled ? passed.length : "-"}
            <span className="text-body"> / {checks.length}</span>
          </p>
          <div
            role="img"
            aria-label={crawled ? `${passed.length} passed, ${failing} failed, ${warnings} warnings` : "Waiting for crawl"}
            className="flex h-2 w-full overflow-hidden rounded-full bg-surface-card"
          >
            {crawled ? (
              <>
                <span className="bg-good" style={{ width: `${(passed.length / checks.length) * 100}%` }} />
                <span className="bg-warn" style={{ width: `${(warnings / checks.length) * 100}%` }} />
                <span className="bg-bad" style={{ width: `${(failing / checks.length) * 100}%` }} />
              </>
            ) : null}
          </div>
          <p className="text-sm leading-6 text-body">
            {!crawled
              ? "Results appear when the crawl finishes."
              : issues.length === 0
                ? "This page passes every check."
                : `${failing} failing, ${warnings} ${warnings === 1 ? "warning" : "warnings"}.`}
          </p>
        </div>
        <dl className="flex flex-col rounded-xl bg-surface-soft ring-1 ring-hairline">
          {facts.map((fact) => (
            <div key={fact.label} className="flex flex-col gap-1 border-t border-hairline px-5 py-3.5 first:border-t-0">
              <dt className="font-mono text-[12px] text-muted-foreground">{fact.label}</dt>
              <dd className="break-all font-mono text-sm text-ink">{fact.value}</dd>
            </div>
          ))}
        </dl>
      </aside>

      <InfoDialog check={info} onClose={() => setInfo(null)} />
    </div>
  );
}

// ---------------------------------------------------------------- Issues

function IssuesPanel({
  projectId,
  pageId,
  issues,
  analysis,
  crawled,
  aiAllowed,
  blockedReason,
  planLabel,
  onOpenCode,
}: {
  projectId: string;
  pageId: string;
  issues: InspectorCheck[];
  analysis: PageAnalysis | null;
  crawled: boolean;
  aiAllowed: boolean;
  blockedReason?: string;
  planLabel: string;
  onOpenCode: (id: string) => void;
}) {
  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-hairline px-5 py-4 sm:px-6">
        <div className="flex max-w-xl flex-col gap-1">
          <h2 className="font-display text-[18px] leading-6 tracking-[-0.3px] text-ink">
            {!crawled
              ? "Waiting for the crawl"
              : issues.length === 0
                ? "Nothing needs attention"
                : `${issues.length} ${issues.length === 1 ? "thing needs" : "things need"} attention`}
          </h2>
          <p className="text-sm leading-6 text-body">
            {issues.length === 0
              ? crawled
                ? "Every check passes on this page."
                : "The checks run when the crawl reaches this page."
              : "Worst first. Each one says what the crawler found and what to do; the Code tab shows it in your markup."}
          </p>
        </div>
        {aiAllowed && issues.length > 0 ? (
          <AnalyzeButton
            projectId={projectId}
            pageId={pageId}
            label={analysis ? "Explain again" : "Explain with AI"}
            appearance={analysis ? "outline" : "primary"}
            disabledReason={blockedReason}
            force={Boolean(analysis)}
          />
        ) : null}
      </div>

      {analysis ? (
        <div className="flex flex-col gap-2 border-b border-hairline px-5 py-4 sm:px-6">
          {analysis.earlier ? (
            <p className="flex items-start gap-2 rounded-md bg-surface-card px-3 py-2 text-xs leading-5 text-body">
              <History className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <span>
                Written for the crawl of {new Date(analysis.earlier.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}.
                {analysis.earlier.fixed > 0
                  ? ` ${analysis.earlier.fixed} ${analysis.earlier.fixed === 1 ? "problem it covered is" : "problems it covered are"} fixed now.`
                  : ""}{" "}
                Explain again to cover this crawl.
              </span>
            </p>
          ) : null}
          <p className="flex items-start gap-2 text-sm leading-6 text-ink">
            <Sparkles className="mt-1 size-3.5 shrink-0 text-primary" aria-hidden />
            {analysis.summary}
          </p>
          <p className="font-mono text-[11px] text-muted-foreground">
            AI-written · {analysis.confidence} confidence · grounded in {analysis.groundedIn.length} sources
            {analysis.needsHumanReview ? " · check before acting" : ""}
          </p>
        </div>
      ) : null}

      {!aiAllowed && issues.length > 0 ? (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-hairline px-5 py-3 text-sm text-body sm:px-6">
          <Lock className="size-3.5 text-muted-foreground" aria-hidden />
          {planLabel} includes AI for your homepage. The findings below are complete.
          <Link href="/pricing" className="text-ink underline underline-offset-4 hover:text-primary">
            AI on every page
          </Link>
        </p>
      ) : null}

      {issues.length > 0 ? (
        <ul className="divide-y divide-hairline">
          {issues.map((check) => (
            <li key={check.id} className="flex gap-4 px-5 py-5 sm:px-6">
              <StatusDot status={check.status} />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-medium text-ink">{check.label}</h3>
                  {check.severity ? (
                    <span className={cn("rounded-full px-2 py-0.5 font-mono text-[11px] leading-5", SEVERITY_STYLE[check.severity])}>
                      {SEVERITY_LABEL[check.severity] ?? check.severity}
                    </span>
                  ) : null}
                </div>
                <dl className="grid gap-x-4 gap-y-1.5 text-sm leading-6 sm:grid-cols-[110px_minmax(0,1fr)]">
                  <dt className="font-mono text-[12px] leading-6 text-muted-foreground">What we found</dt>
                  <dd className={cn("break-words", check.status === "fail" ? "text-bad" : "text-warn")}>
                    {check.why?.issue ?? check.evidence ?? check.observed}
                  </dd>
                  {check.why ? (
                    <>
                      <dt className="font-mono text-[12px] leading-6 text-muted-foreground">Why it matters</dt>
                      <dd className="text-body">{check.why.whyItMatters}</dd>
                    </>
                  ) : null}
                  <dt className="font-mono text-[12px] leading-6 text-muted-foreground">What to do</dt>
                  <dd className="text-body">{check.why?.action ?? check.recommendation ?? check.fix?.reason ?? check.hint}</dd>
                </dl>
                <button
                  type="button"
                  onClick={() => onOpenCode(check.id)}
                  className="inline-flex h-9 w-fit items-center gap-1.5 rounded-md font-mono text-[12px] text-body hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Code2 className="size-3.5" aria-hidden />
                  {check.result?.ok ? "See the fix in code" : check.fix?.strategy === "ai-generate" ? "Generate a fix in code" : "See it in code"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {analysis ? (
        <details className="group border-t border-hairline">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3.5 text-sm text-body hover:text-ink sm:px-6">
            <span>How the AI explanation was produced</span>
            <span className="font-mono text-[11px] text-muted-foreground">{analysis.confidence} confidence</span>
          </summary>
          <div className="flex flex-col gap-3 px-5 pb-5 sm:px-6">
            <ul className="flex flex-wrap gap-1.5">
              {analysis.groundedIn.map((source) => (
                <li key={source} className="rounded-md bg-surface-card px-2 py-1 font-mono text-[11px] text-body">
                  {source}
                </li>
              ))}
            </ul>
            <p className="font-mono text-[11px] text-muted-foreground">
              Business context {analysis.mode === "deep" ? "used" : "not provided"} · knowledge {analysis.knowledgeVersion ?? "none"} ·{" "}
              {new Date(analysis.createdAt).toLocaleString()}
            </p>
          </div>
        </details>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- Code

type Line = { kind: "comment" | "context" | "removed" | "added"; text: string };

function commentFor(language: string, text: string): string {
  if (language === "html") return `<!-- ${text} -->`;
  return `# ${text}`;
}

function CodePanel({
  projectId,
  pageId,
  pageType,
  checks,
  selected,
  onSelect,
  aiAllowed,
  blockedReason,
  onInfo,
}: {
  projectId: string;
  pageId: string;
  pageType: string | null;
  checks: InspectorCheck[];
  selected: string | null;
  onSelect: (id: string) => void;
  aiAllowed: boolean;
  blockedReason?: string;
  onInfo: (check: InspectorCheck) => void;
}) {
  const [options, setOptions] = useState<Record<string, number>>({});
  const issues = checks.filter((check) => !check.optional);
  const optional = checks.filter((check) => check.optional);
  const check = checks.find((row) => row.id === selected) ?? checks[0] ?? null;

  if (!check) {
    return (
      <p className="flex items-center gap-2 px-6 py-8 text-sm text-body">
        <Check className="size-4 text-good" aria-hidden />
        Nothing to change: every check passes on this page.
      </p>
    );
  }

  const option = Math.min(options[check.id] ?? 0, Math.max(0, (check.result?.options.length ?? 1) - 1));

  return (
    <div className="grid min-h-160 md:grid-cols-[220px_minmax(0,1fr)]">
      <nav aria-label="Checks to fix" className="border-b border-hairline py-3 md:border-b-0 md:border-r">
        <NavGroup title="Issues" rows={issues} selected={check.id} onSelect={onSelect} />
        {optional.length > 0 ? (
          <NavGroup title="Rewrite on request" rows={optional} selected={check.id} onSelect={onSelect} />
        ) : null}
      </nav>
      <Editor
        key={check.id}
        projectId={projectId}
        pageId={pageId}
        pageType={pageType}
        check={check}
        option={option}
        onOption={(index) => setOptions((current) => ({ ...current, [check.id]: index }))}
        aiAllowed={aiAllowed}
        blockedReason={blockedReason}
        onInfo={() => onInfo(check)}
      />
    </div>
  );
}

function NavGroup({
  title,
  rows,
  selected,
  onSelect,
}: {
  title: string;
  rows: InspectorCheck[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="flex flex-col gap-0.5 px-2 pb-2">
      <p className="px-2 pb-1 pt-1 font-mono text-[11px] uppercase tracking-[0.4px] text-muted-foreground">{title}</p>
      <ul className="flex flex-col gap-0.5">
        {rows.map((row) => (
          <li key={row.id}>
            <button
              type="button"
              aria-current={row.id === selected ? "true" : undefined}
              onClick={() => onSelect(row.id)}
              className={cn(
                "flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                row.id === selected ? "bg-surface-card text-ink" : "text-body hover:bg-surface-card/60 hover:text-ink",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  row.status === "fail" ? "bg-bad" : row.status === "warning" ? "bg-warn" : "bg-muted-foreground/60",
                )}
              />
              <span className="min-w-0 flex-1 truncate">{row.label}</span>
              {row.result?.ok ? <Sparkles className="size-3 shrink-0 text-primary" aria-label="Fix generated" /> : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Editor({
  projectId,
  pageId,
  pageType,
  check,
  option,
  onOption,
  aiAllowed,
  blockedReason,
  onInfo,
}: {
  projectId: string;
  pageId: string;
  pageType: string | null;
  check: InspectorCheck;
  option: number;
  onOption: (index: number) => void;
  aiAllowed: boolean;
  blockedReason?: string;
  onInfo: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const { code, fix, result } = check;
  const language = code.language;
  const generated = result?.ok ? (result.options[option] ?? null) : null;
  const fromCrawl = fix?.fromCrawl ?? null;
  const replacement: FixOption | null = generated ?? fromCrawl;
  const hasCurrent = code.current.length > 0;

  const lines: Line[] = [];
  if (replacement) {
    if (hasCurrent) {
      lines.push({ kind: "comment", text: commentFor(language, "Previous version: what the crawler read on this page") });
      lines.push(...code.current.map((text) => ({ kind: "removed" as const, text })));
    } else if (code.missing) {
      lines.push({ kind: "comment", text: commentFor(language, code.missing) });
    }
    lines.push({
      kind: "comment",
      text: commentFor(
        language,
        generated
          ? `Suggested fix${result && result.options.length > 1 ? ` (${generated.label} of ${result.options.length})` : ""}. Click it to copy.`
          : `Fix from the crawl: no AI needed. ${fromCrawl?.label ?? ""}`.trim(),
      ),
    });
    lines.push(...replacement.lines.map((text) => ({ kind: "added" as const, text })));
  } else if (hasCurrent) {
    lines.push({ kind: "comment", text: commentFor(language, "Current: what the crawler read on this page") });
    lines.push(...code.current.map((text) => ({ kind: "context" as const, text })));
  } else {
    lines.push({ kind: "comment", text: commentFor(language, code.missing ?? "Nothing on the page for this check.") });
  }
  if (!replacement && fix?.strategy === "ai-generate" && aiAllowed) {
    lines.push({ kind: "comment", text: commentFor(language, "Generate a fix for this issue.") });
  }
  if (fix?.strategy === "blocked") {
    lines.push({ kind: "comment", text: commentFor(language, `No fix yet: ${fix.reason}`) });
  }

  const tokens = highlightLines(
    lines.map((line) => line.text),
    language,
  );

  async function copyFix() {
    if (!replacement) return;
    // A selection is the user copying part of it themselves.
    if (window.getSelection()?.toString()) return;
    try {
      await navigator.clipboard.writeText(replacement.lines.join("\n"));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#2b2b2b] bg-[#181818] px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          {/* The open "file", drawn as an editor tab. */}
          <span className="rounded-t-md border-t-2 border-primary bg-[#1f1f1f] px-2.5 py-1 font-mono text-[12px] text-[#cccccc]">
            {code.location}
          </span>
          <h3 className="truncate text-sm font-medium text-ink">{check.label}</h3>
          {check.severity ? (
            <span className={cn("rounded-full px-2 py-0.5 font-mono text-[11px] leading-5", SEVERITY_STYLE[check.severity])}>
              {SEVERITY_LABEL[check.severity] ?? check.severity}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {fix ? <StrategyBadge strategy={fix.strategy} /> : null}
          {result?.ok ? (
            <button
              type="button"
              onClick={onInfo}
              aria-label={`About this issue: ${check.label}`}
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground ring-1 ring-hairline hover:bg-surface-card hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Info className="size-4" aria-hidden />
            </button>
          ) : null}
        </div>
      </div>

      {/* A code editor surface, coloured as VS Code's Dark Modern theme. */}
      <div className="min-h-110 min-w-0 flex-1 overflow-x-auto bg-[#1f1f1f] py-3">
        <ol aria-label={`${check.label} code`} className="min-w-max font-mono text-[13px] leading-6">
          {lines.map((line, index) => {
            const body = (
              <>
                <span aria-hidden className="w-11 shrink-0 select-none pr-3 text-right tabular-nums text-[#6e7681]">
                  {index + 1}
                </span>
                <span
                  aria-hidden
                  className={cn(
                    "w-4 shrink-0 select-none text-center",
                    line.kind === "removed" && "text-[#f85149]",
                    line.kind === "added" && "text-[#3fb950]",
                  )}
                >
                  {line.kind === "removed" ? "-" : line.kind === "added" ? "+" : ""}
                </span>
                <span
                  className={cn(
                    "whitespace-pre pr-6",
                    line.kind === "removed" && "line-through decoration-[#f85149]/80 opacity-60",
                  )}
                >
                  {line.kind === "removed" ? <span className="sr-only">Removed: </span> : null}
                  {line.kind === "added" ? <span className="sr-only">Added: </span> : null}
                  {line.kind === "comment"
                    ? <span className={TOKEN_CLASS.comment}>{line.text}</span>
                    : tokens[index].map((token, position) => (
                        <span key={position} className={tokenClass(token)}>
                          {token.text}
                        </span>
                      ))}
                </span>
              </>
            );
            return (
              <li
                key={index}
                className={cn(
                  "flex",
                  line.kind === "removed" && "bg-[#f85149]/15",
                  line.kind === "added" && "cursor-copy bg-[#2ea043]/15 hover:bg-[#2ea043]/25",
                )}
                onClick={line.kind === "added" ? () => void copyFix() : undefined}
                title={line.kind === "added" ? "Click to copy the fix" : undefined}
              >
                {body}
              </li>
            );
          })}
        </ol>
      </div>

      <div className="flex flex-col gap-3 border-t border-hairline px-4 py-3">
        {result && result.options.length > 1 ? (
          <div role="radiogroup" aria-label="Suggestions" className="flex flex-wrap gap-1.5">
            {result.options.map((item, index) => (
              <button
                key={item.label}
                type="button"
                role="radio"
                aria-checked={index === option}
                onClick={() => onOption(index)}
                className={cn(
                  "inline-flex h-8 items-center rounded-full px-3 font-mono text-[12px] ring-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  index === option ? "bg-primary/10 text-primary ring-primary/40" : "text-body ring-hairline hover:text-ink",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
        {replacement?.note ? <p className="text-xs leading-5 text-body">{replacement.note}</p> : null}
        {result?.notes.map((note) => (
          <p key={note} className="text-xs leading-5 text-warn">
            {note}
          </p>
        ))}
        {result && !result.ok && result.error ? <p className="text-sm text-bad">{result.error}</p> : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {fix?.strategy === "ai-generate" && fix.feature ? (
              aiAllowed ? (
                <AiRunButton
                  endpoint={`/api/projects/${projectId}/analyze`}
                  body={{ pageId, features: [fix.feature] }}
                  label={result ? "Regenerate" : "Generate a Fix"}
                  appearance={result ? "outline" : "primary"}
                  regenerate={Boolean(result)}
                  disabledReason={blockedReason}
                  size="compact"
                />
              ) : (
                <Link href="/pricing" className="inline-flex items-center gap-1.5 text-sm text-body underline underline-offset-4 hover:text-ink">
                  <Lock className="size-3.5" aria-hidden />
                  AI fixes for this page are on Pro and Agency
                </Link>
              )
            ) : null}
            {replacement ? <CopyButton value={replacement.lines.join("\n")} label="Copy fix" /> : null}
            {copied ? (
              <span role="status" className="font-mono text-[12px] text-good">
                Copied
              </span>
            ) : null}
          </div>
          {result?.ok ? (
            <p className="font-mono text-[11px] text-muted-foreground">
              AI-written · {result.confidence} confidence · {result.sources} sources
              {result.needsHumanReview ? " · check before publishing" : ""}
            </p>
          ) : null}
        </div>

        {fix?.strategy === "blocked" && check.id === "schema" ? (
          <PageTypeControl
            projectId={projectId}
            pageId={pageId}
            current={pageType}
            prompt="Tell us what this page is and the structured data can be written."
          />
        ) : null}
      </div>
    </div>
  );
}

function StrategyBadge({ strategy }: { strategy: "deterministic" | "ai-generate" | "blocked" }) {
  const style = {
    deterministic: { icon: Wrench, text: "Fix from the crawl", className: "bg-good/10 text-good" },
    "ai-generate": { icon: Sparkles, text: "AI fix", className: "bg-primary/10 text-primary" },
    blocked: { icon: FileSearch, text: "Needs more evidence", className: "bg-surface-card text-muted-foreground" },
  }[strategy];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[11px] leading-5", style.className)}>
      <style.icon className="size-3" aria-hidden />
      {style.text}
    </span>
  );
}

// ---------------------------------------------------------------- Passed

function PassedPanel({ passed, crawled }: { passed: InspectorCheck[]; crawled: boolean }) {
  if (!crawled) {
    return <p className="px-6 py-8 text-sm text-body">Results appear when the crawl finishes.</p>;
  }
  if (passed.length === 0) {
    return <p className="px-6 py-8 text-sm text-body">No check passes on this page yet.</p>;
  }
  return (
    <ul aria-label="Passed checks" className="divide-y divide-hairline">
      {passed.map((check) => (
        <li key={check.id} className="flex gap-4 px-5 py-4 sm:px-6">
          <span aria-hidden className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-good/15 text-good">
            <Check className="size-3.5" strokeWidth={3} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="text-sm font-medium text-ink">
                <span className="sr-only">Passed: </span>
                {check.label}
              </p>
              <p className="font-mono text-[12px] text-muted-foreground">{check.hint}</p>
            </div>
            <p className="break-words text-sm leading-6 text-body">{check.observed}</p>
            {check.detail ? <p className="break-words text-xs leading-5 text-muted-foreground">{check.detail}</p> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------- shared

function StatusDot({ status }: { status: InspectorCheck["status"] }) {
  return (
    <span
      aria-hidden
      className={cn(
        "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full",
        status === "fail" ? "bg-bad/15 text-bad" : "bg-warn/15 text-warn",
      )}
    >
      {status === "fail" ? <CircleAlert className="size-4" /> : <TriangleAlert className="size-4" />}
    </span>
  );
}

/** Issue, Why, Evidence and Action for one check: nothing about the rest of the page. */
function InfoDialog({ check, onClose }: { check: InspectorCheck | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (check && !node.open) node.showModal();
    if (!check && node.open) node.close();
  }, [check]);

  const rows: Array<[string, ReactNode]> = check
    ? [
        ["Issue", check.why?.issue ?? check.evidence ?? check.observed],
        [
          "Why",
          check.why?.whyItMatters ??
            check.result?.diagnosis ??
            "Use Explain with AI on the Issues tab for an explanation grounded in this page.",
        ],
        ["Evidence", check.evidence ?? check.observed],
        ["Action", check.why?.action ?? check.recommendation ?? check.fix?.reason ?? check.hint],
      ]
    : [];

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
      className="m-auto w-[min(520px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl bg-canvas p-0 text-ink ring-1 ring-hairline backdrop:bg-black/70 backdrop:backdrop-blur-sm open:flex"
    >
      {check ? (
        <>
          <header className="flex items-start justify-between gap-4 border-b border-hairline px-5 pt-5 pb-4">
            <div className="flex min-w-0 flex-col gap-1">
              <p className="font-mono text-[12px] text-muted-foreground">About this issue</p>
              <h2 id={titleId} className="font-display text-[20px] leading-6 tracking-[-0.3px] text-ink">
                {check.label}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => ref.current?.close()}
              aria-label="Close"
              className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-soft hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-4" aria-hidden />
            </button>
          </header>
          <dl className="flex flex-col divide-y divide-hairline">
            {rows.map(([label, value]) => (
              <div key={label} className="grid gap-1 px-5 py-3.5 sm:grid-cols-[90px_minmax(0,1fr)]">
                <dt className="font-mono text-[12px] leading-6 text-muted-foreground">{label}</dt>
                <dd className={cn("break-words text-sm leading-6", label === "Evidence" ? "font-mono text-[12.5px] text-body" : "text-ink")}>
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          <p className="flex items-center gap-2 border-t border-hairline px-5 py-3 text-xs text-muted-foreground">
            <Copy className="size-3.5" aria-hidden />
            The fix is in the Code tab. Click it to copy.
          </p>
        </>
      ) : null}
    </dialog>
  );
}

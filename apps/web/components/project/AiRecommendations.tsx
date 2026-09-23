import { Sparkles } from "lucide-react";
import type { PageAiResult } from "@/lib/ai-results";
import { AnalyzeButton } from "@/components/project/AnalyzeButton";
import { UpgradePrompt } from "@/components/project/UpgradePrompt";
import { cn } from "@/lib/utils";

/**
 * Grounded AI output for one page (Phase 1).
 *
 * Three things are deliberately always visible: which model produced it, which
 * knowledge version grounded it, and what the model says it used. A
 * recommendation the user cannot trace is one they have no way to check, and
 * the whole point of the knowledge layer is that every claim has a source.
 *
 * Failure states render too. A missing suggestion with no explanation is worse
 * than an error, because the user cannot tell "nothing to fix" from "it broke".
 */

const SEVERITY_STYLE: Record<string, string> = {
  critical: "bg-bad/15 text-bad",
  high: "bg-bad/10 text-bad",
  medium: "bg-warn/15 text-warn",
  low: "bg-surface-card text-muted-foreground",
};

export function AiRecommendations({
  result,
  projectId,
  pageId,
  aiEnabled,
  planAllowsAi = true,
  planLabel,
}: {
  result: PageAiResult | null;
  projectId: string;
  pageId: string;
  aiEnabled: boolean;
  /** False on plans without AI. The findings above stay fully visible. */
  planAllowsAi?: boolean;
  planLabel?: string;
}) {
  const disabledReason = aiEnabled
    ? undefined
    : "No AI provider configured. Set AI_API_KEY in .env and restart the worker.";

  return (
    <section aria-label="AI analysis" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="flex items-center gap-2 font-display text-[22px] leading-tight tracking-[-0.4px] text-ink">
            <Sparkles className="size-4 text-brand-accent" aria-hidden />
            AI analysis
          </h2>
          <p className="text-sm leading-6 text-body">
            Explanations grounded in this page&apos;s evidence and the SEO knowledge base.
          </p>
        </div>
        {planAllowsAi ? (
          <AnalyzeButton
            projectId={projectId}
            pageId={pageId}
            label={result ? "Re-analyse" : "Analyse this page"}
            disabledReason={disabledReason}
            force={Boolean(result)}
          />
        ) : null}
      </div>

      {!planAllowsAi ? (
        <UpgradePrompt
          title="AI explanations are a paid feature"
          body="Your plan finds every problem on this page - the checks above are complete. Upgrade to get the explanation of why each one matters and what to change."
          planLabel={planLabel}
        />
      ) : !result ? (
        <Empty>
          No analysis has run for this page yet. Queue one to get explanations for the failing
          checks above.
        </Empty>
      ) : result.status !== "ok" || !result.data ? (
        <div className="flex flex-col gap-2 rounded-lg bg-surface-soft p-6 ring-1 ring-hairline">
          <p className="text-sm font-medium text-ink">
            {result.status === "invalid"
              ? "The model returned output that did not match the contract."
              : "The last analysis did not finish."}
          </p>
          <p className="text-sm leading-6 text-body">
            {result.status === "invalid"
              ? "It was rejected rather than stored, so nothing unverified reached this page. Try again."
              : "Nothing was stored. You can queue it again."}
          </p>
          {result.error ? (
            <p className="mt-1 break-words font-mono text-xs leading-5 text-muted-foreground">
              {result.error}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="rounded-lg bg-surface-soft p-6 ring-1 ring-hairline">
            <p className="text-sm leading-6 text-body">{result.data.summary}</p>
            {result.data.needsHumanReview ? (
              <p className="mt-3 rounded-md bg-warn/10 px-3 py-2 text-xs leading-5 text-warn">
                The model flagged this for human review. Check it before acting.
              </p>
            ) : null}
          </div>

          <ul className="flex flex-col gap-3">
            {result.data.recommendations.map((item, index) => (
              <li
                key={`${item.checkId}-${index}`}
                className="flex flex-col gap-2 rounded-lg bg-surface-soft p-6 ring-1 ring-hairline"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[12px] text-muted-foreground">
                    {item.checkId}
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 font-mono text-[11px] leading-5",
                      SEVERITY_STYLE[item.severity] ?? SEVERITY_STYLE.low,
                    )}
                  >
                    {item.severity}
                  </span>
                  {!item.actionable ? (
                    <span className="rounded-full bg-surface-card px-2 py-0.5 font-mono text-[11px] leading-5 text-muted-foreground">
                      Needs more evidence
                    </span>
                  ) : null}
                </div>

                <p className="text-sm font-medium leading-6 text-ink">{item.issue}</p>
                <p className="text-sm leading-6 text-body">{item.whyItMatters}</p>
                <p className="mt-1 border-l-2 border-brand-accent/40 pl-3 text-sm leading-6 text-body">
                  {item.action}
                </p>
              </li>
            ))}
          </ul>

          <Provenance result={result} />
        </div>
      )}
    </section>
  );
}

/**
 * Where the answer came from.
 *
 * `groundedIn` is required by the output contract, so this is never empty on a
 * valid result — it is the audit trail that makes a claim checkable.
 */
function Provenance({ result }: { result: PageAiResult }) {
  if (!result.data) {
    return null;
  }

  return (
    <details className="group rounded-lg bg-surface-soft ring-1 ring-hairline">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-6 py-4 text-sm text-body hover:text-ink">
        <span>How this was produced</span>
        <span className="font-mono text-[11px] text-muted-foreground">
          {result.data.confidence} confidence
        </span>
      </summary>
      <div className="flex flex-col gap-3 border-t border-hairline px-6 py-5">
        <div className="flex flex-col gap-1">
          <p className="font-mono text-[11px] text-muted-foreground">Grounded in</p>
          <ul className="flex flex-wrap gap-1.5">
            {result.data.groundedIn.map((source) => (
              <li
                key={source}
                className="rounded-md bg-surface-card px-2 py-1 font-mono text-[11px] text-body"
              >
                {source}
              </li>
            ))}
          </ul>
        </div>
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          <Meta label="Model" value={`${result.provider} / ${result.model}`} />
          <Meta label="Mode" value={result.mode} />
          <Meta label="Knowledge version" value={result.knowledgeVersion ?? "none"} />
          <Meta label="Generated" value={result.createdAt.toLocaleString()} />
        </dl>
      </div>
    </details>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="font-mono text-[11px] text-muted-foreground">{label}</dt>
      <dd className="break-words font-mono text-xs text-body">{value}</dd>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-hairline bg-surface-soft/50 p-6">
      <p className="text-sm leading-6 text-body">{children}</p>
    </div>
  );
}

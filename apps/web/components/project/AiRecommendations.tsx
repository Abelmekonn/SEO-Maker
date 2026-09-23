import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { type PageAiResult, friendlyAiError } from "@/lib/ai-results";
import { AnalyzeButton } from "@/components/project/AnalyzeButton";
import { UpgradePrompt } from "@/components/project/UpgradePrompt";

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


export function AiRecommendations({
  result,
  projectId,
  pageId,
  aiEnabled,
  planAllowsAi = true,
  planLabel,
  status,
  children,
}: {
  result: PageAiResult | null;
  projectId: string;
  pageId: string;
  aiEnabled: boolean;
  /** False on plans without AI. The findings above stay fully visible. */
  planAllowsAi?: boolean;
  planLabel?: string;
  /** The per-check fixes, rendered under the summary whether or not AI has run. */
  children?: ReactNode;
  /** Live queue progress, shown under the header. */
  status?: ReactNode;
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
            Fixes
          </h2>
          <p className="max-w-2xl text-sm leading-6 text-body">
            Each failing check with its fix: taken from the crawl, written by AI from this
            page&apos;s evidence and the SEO knowledge base, or withheld when the evidence is missing.
          </p>
        </div>
        {planAllowsAi ? (
          <div className="flex flex-wrap items-start gap-3">
            <AnalyzeButton
              projectId={projectId}
              pageId={pageId}
              label="Suggest title & description"
              disabledReason={disabledReason}
              features={["title", "meta"]}
              force
            />
            <AnalyzeButton
              projectId={projectId}
              pageId={pageId}
              label={result ? "Re-analyse" : "Analyse this page"}
              appearance="primary"
              disabledReason={disabledReason}
              force={Boolean(result)}
            />
          </div>
        ) : null}
      </div>

      {!planAllowsAi ? (
        <UpgradePrompt
          title="Exact errors and fixes are a paid feature"
          body="Your plan finds every problem on this page - the checks above are complete. Upgrade to see the exact error, why it matters and a ready-to-use fix for each one."
          planLabel={planLabel}
        />
      ) : (
        <>
          {status}
          {!result ? (
            <Empty>
              The AI has not explained this page yet. Fixes taken from the crawl are below already;
              run the analysis for explanations and written suggestions.
            </Empty>
          ) : result.status !== "ok" || !result.data ? (
            <div className="flex flex-col gap-2 rounded-lg bg-surface-soft p-6 ring-1 ring-hairline">
              <p className="text-sm font-medium text-ink">{friendlyAiError(result.error)}</p>
              <p className="text-sm leading-6 text-body">
                Nothing unverified was stored. The fixes taken from the crawl below still apply.
              </p>
              {result.error ? (
                <details className="mt-1 text-xs text-muted-foreground">
                  <summary className="cursor-pointer hover:text-body">Technical detail</summary>
                  <p className="mt-1 break-words font-mono text-[11px] leading-5">{result.error}</p>
                </details>
              ) : null}
            </div>
          ) : (
            <div className="rounded-lg bg-surface-soft p-6 ring-1 ring-hairline">
              <p className="text-sm leading-6 text-body">{result.data.summary}</p>
              {result.data.needsHumanReview ? (
                <p className="mt-3 rounded-md bg-warn/10 px-3 py-2 text-xs leading-5 text-warn">
                  The model flagged this for human review. Check it before acting.
                </p>
              ) : null}
            </div>
          )}

          {children}

          {result?.status === "ok" && result.data ? <Provenance result={result} /> : null}
        </>
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

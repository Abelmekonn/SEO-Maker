import Link from "next/link";
import { Lock } from "lucide-react";

/**
 * What a plan does not include, and where to get it.
 *
 * Deliberately states what the current plan *does* give first. A gate that
 * only says "upgrade" reads as the product withholding something; saying
 * "your findings are here, the explanations are paid" is both truer and more
 * useful, because the findings really are complete on every plan.
 */
export function UpgradePrompt({
  title,
  body,
  planLabel,
  compact = false,
}: {
  title: string;
  body: string;
  planLabel?: string;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-surface-soft px-4 py-3 ring-1 ring-hairline">
        <Lock className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <p className="text-sm text-body">{body}</p>
        <Link
          href="/pricing"
          className="text-sm text-brand-accent underline underline-offset-4 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          See plans
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-3 rounded-lg bg-surface-soft p-6 ring-1 ring-hairline">
      <span className="flex size-8 items-center justify-center rounded-full bg-surface-card">
        <Lock className="size-4 text-muted-foreground" aria-hidden />
      </span>
      <div className="flex flex-col gap-1.5">
        <h3 className="text-sm font-medium text-ink">{title}</h3>
        <p className="max-w-xl text-sm leading-6 text-body">{body}</p>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Link
          href="/pricing"
          className="inline-flex h-10 items-center rounded-md bg-primary px-4 font-mono text-sm text-on-primary transition-colors hover:bg-primary-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Go premium
        </Link>
        {planLabel ? (
          <p className="font-mono text-[12px] text-muted-foreground">
            You are on {planLabel}
          </p>
        ) : null}
      </div>
    </div>
  );
}

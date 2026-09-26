"use client";

import type { ProfileGap } from "@seo-maker/core/competitors";
import { ExternalLink, LoaderCircle, RefreshCw, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BusinessProfileDialog } from "@/components/project/BusinessProfileDialog";
import { Button } from "@/components/ui/button";
import type { BusinessContext } from "@/lib/business-context";
import type { SearchKeyword } from "@/lib/competitors";
import { AI_USAGE_EVENT, emit } from "@/lib/events";
import { cn } from "@/lib/utils";

const PRIORITY_STYLE: Record<string, string> = {
  high: "bg-primary/15 text-primary",
  medium: "bg-surface-card text-body ring-1 ring-hairline",
  low: "bg-surface-card text-muted-foreground ring-1 ring-hairline",
};

/**
 * Search keywords: the few searches a potential customer would make,
 * generated from the business profile, each linking to that exact Google
 * search for the user to look at. Automatic discovery measures competitors
 * on this same set.
 */
export function SearchKeywordsPanel({
  projectId,
  keywords,
  market,
  context,
  missing,
  generating,
  disabledReason,
  compact = false,
}: {
  projectId: string;
  keywords: SearchKeyword[];
  market: { country: string; languageCode: string } | null;
  context: BusinessContext;
  missing: ProfileGap[];
  generating: boolean;
  disabledReason?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ text: string; upgrade: boolean } | null>(null);
  const [note, setNote] = useState("");
  const [gaps, setGaps] = useState(missing);
  const [dialogOpen, setDialogOpen] = useState(false);

  async function generate() {
    setPending(true);
    setError(null);
    setNote("");
    const response = await fetch(`/api/projects/${projectId}/search-queries`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ force: keywords.length > 0, requestId: crypto.randomUUID() }),
    }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as {
      error?: string;
      code?: string;
      message?: string;
      missing?: ProfileGap[];
      upgrade?: boolean;
    } | null;
    setPending(false);
    if (response?.status === 422 && data?.code === "profile-required") {
      setGaps(data.missing ?? []);
      setDialogOpen(true);
      return;
    }
    if (!response?.ok) {
      setError({ text: data?.error ?? "Could not generate search keywords.", upgrade: Boolean(data?.upgrade) });
      return;
    }
    setDialogOpen(false);
    if (data?.message) setNote(data.message);
    emit(AI_USAGE_EVENT);
    router.refresh();
  }

  function onClick() {
    if (gaps.length > 0) {
      setDialogOpen(true);
      return;
    }
    void generate();
  }

  const busy = pending || generating;
  const shown = compact ? keywords.slice(0, 6) : keywords;

  return (
    <section aria-labelledby={`${projectId}-keywords`} className="flex flex-col gap-4 rounded-xl bg-surface-soft p-5 ring-1 ring-hairline">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id={`${projectId}-keywords`} className="font-display text-[18px] leading-6 tracking-[-0.3px] text-ink">
            Search keywords
          </h2>
          <p className="max-w-2xl text-sm leading-6 text-body">
            {keywords.length > 0
              ? `Searches a potential customer would make${market ? `, checked in ${market.country}` : ""}. Competitor discovery measures rivals on these.`
              : "A short list of searches a potential customer would make, generated from your business profile."}
          </p>
        </div>
        <Button
          type="button"
          variant={keywords.length > 0 ? "outline" : "default"}
          className="h-11 w-fit"
          onClick={onClick}
          disabled={busy || Boolean(disabledReason)}
          title={disabledReason}
          aria-busy={busy}
        >
          {busy ? (
            <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />
          ) : keywords.length > 0 ? (
            <RefreshCw className="size-4" aria-hidden />
          ) : (
            <Sparkles className="size-4" aria-hidden />
          )}
          {generating ? "Generating" : pending ? "Queuing" : keywords.length > 0 ? "Regenerate" : "Generate Search Keywords"}
        </Button>
      </div>

      {disabledReason ? <p className="text-xs leading-5 text-muted-foreground">{disabledReason}</p> : null}
      {error ? (
        <p role="alert" className="text-sm text-bad">
          {error.text}
          {error.upgrade ? (
            <>
              {" "}
              <Link href="/pricing" className="text-ink underline underline-offset-4 hover:text-primary">
                See plans
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
      {note ? <p className="text-sm text-body">{note}</p> : null}
      {generating ? (
        <p role="status" className="text-sm text-body">
          Generating from your business profile. The list appears here in a moment.
        </p>
      ) : null}

      {shown.length > 0 ? (
        <ul aria-label="Suggested search queries" className="flex flex-col divide-y divide-hairline rounded-lg bg-canvas ring-1 ring-hairline">
          {shown.map((keyword) => (
            <li key={keyword.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-4 py-3">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  {keyword.priority ? (
                    <span className={cn("rounded-full px-2 py-0.5 font-mono text-[11px] capitalize", PRIORITY_STYLE[keyword.priority] ?? PRIORITY_STYLE.low)}>
                      {keyword.priority}
                    </span>
                  ) : null}
                  <span className="break-words text-sm text-ink">{keyword.query}</span>
                  <span className="font-mono text-[11px] capitalize text-muted-foreground">{keyword.intent}</span>
                </div>
                {!compact && keyword.reason ? <p className="text-xs leading-5 text-muted-foreground">{keyword.reason}</p> : null}
              </div>
              <a
                href={keyword.googleUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-md px-2.5 font-mono text-[12px] text-body ring-1 ring-hairline hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Search Google
                <ExternalLink className="size-3.5" aria-hidden />
                <span className="sr-only">for “{keyword.query}” (opens in a new tab)</span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      {compact && keywords.length > shown.length ? (
        <Link href={`/projects/${projectId}/settings`} className="w-fit font-mono text-[12px] text-primary hover:underline">
          All {keywords.length} keywords →
        </Link>
      ) : null}

      <BusinessProfileDialog
        projectId={projectId}
        initial={context}
        missing={gaps}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSaved={async () => {
          setGaps([]);
          await generate();
        }}
        submitLabel="Save & Generate"
        intro="Search keywords are generated from your business: what you sell, who buys it, and in which market they search."
      />
    </section>
  );
}

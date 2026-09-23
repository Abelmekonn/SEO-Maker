"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AI_QUEUED_EVENT } from "@/components/project/AiQueueStatus";
import { cn } from "@/lib/utils";

/**
 * Queues grounded AI analysis for a page or a whole project.
 *
 * Results arrive through the worker, so the button reports what it queued and
 * then leaves a refresh hint rather than pretending to stream. `disabled`
 * carries the reason so a user with no provider configured is told why instead
 * of pressing a button that always fails.
 */
export function AnalyzeButton({
  projectId,
  pageId,
  label,
  appearance = "outline",
  disabledReason,
  force = false,
  features,
  next,
}: {
  projectId: string;
  pageId?: string;
  label?: string;
  appearance?: "outline" | "primary";
  disabledReason?: string;
  force?: boolean;
  /** Narrow the run to these features (Phase 2), e.g. ["title", "meta"]. */
  features?: string[];
  /** Queue the N worst pages not analysed yet, instead of one page or all. */
  next?: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  async function onClick() {
    setPending(true);
    setError("");
    setNote("");

    const response = await fetch(`/api/projects/${projectId}/analyze`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pageId, force, features, next }),
    });
    const data = (await response.json().catch(() => null)) as {
      error?: string;
      queued?: number;
      message?: string;
      etaMinutes?: number;
    } | null;

    setPending(false);

    if (!response.ok) {
      setError(data?.error ?? "Could not start the analysis.");
      return;
    }

    if (!data?.queued) {
      setNote(data?.message ?? "Nothing to analyse.");
      return;
    }

    setNote(
      data.message ??
        (data.queued === 1
          ? `Queued. About ${data.etaMinutes ?? 1} min on the current AI tier.`
          : `Queued ${data.queued} pages. About ${data.etaMinutes ?? data.queued} min on the current AI tier.`),
    );
    // Starts the live progress panel instead of asking for a manual refresh.
    window.dispatchEvent(new Event(AI_QUEUED_EVENT));
    router.refresh();
  }

  const blocked = Boolean(disabledReason);
  const text = label ?? (pageId ? "Analyse this page" : "Analyse pages");

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        type="button"
        variant={appearance === "primary" ? "default" : "outline"}
        className={cn("h-11 w-fit", appearance === "primary" && "rounded-full px-5")}
        disabled={pending || blocked}
        onClick={onClick}
        title={disabledReason}
      >
        {pending ? (
          <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
        ) : (
          <Sparkles className="size-3.5" aria-hidden />
        )}
        {pending ? "Queuing" : text}
      </Button>
      {disabledReason ? (
        <p className="max-w-xs text-xs leading-5 text-muted-foreground">{disabledReason}</p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      ) : null}
      {note ? <p className="text-sm text-body">{note}</p> : null}
    </div>
  );
}

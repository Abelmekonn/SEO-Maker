"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
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
}: {
  projectId: string;
  pageId?: string;
  label?: string;
  appearance?: "outline" | "primary";
  disabledReason?: string;
  force?: boolean;
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
      body: JSON.stringify({ pageId, force }),
    });
    const data = (await response.json().catch(() => null)) as {
      error?: string;
      queued?: number;
      message?: string;
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
      data.queued === 1
        ? "Queued. Refresh in a moment to see the result."
        : `Queued ${data.queued} pages. Refresh in a moment.`,
    );
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
        <Sparkles className="size-3.5" aria-hidden />
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

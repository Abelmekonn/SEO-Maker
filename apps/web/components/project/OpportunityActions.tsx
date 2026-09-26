"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, RotateCcw, Sparkles, X } from "lucide-react";
import { AI_QUEUED_EVENT } from "@/components/project/AiQueueStatus";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Queues AI wording for the site's top opportunities (Phase 3.3).
 *
 * Also re-derives the opportunities from the latest crawl first, so the
 * explanation is written for what the crawl found today. The scores do not
 * change when the AI runs; only the words do.
 */
export function ExplainOpportunitiesButton({
  projectId,
  label,
  disabledReason,
  force = false,
  appearance = "primary",
}: {
  projectId: string;
  label: string;
  disabledReason?: string;
  force?: boolean;
  appearance?: "primary" | "outline";
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  async function onClick() {
    setPending(true);
    setError("");
    setNote("");
    const response = await fetch(`/api/projects/${projectId}/opportunities`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ explain: true, force }),
    }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as { error?: string; message?: string; queued?: boolean } | null;
    setPending(false);
    if (!response?.ok) {
      setError(data?.error ?? "Could not start the explanation.");
      return;
    }
    setNote(data?.message ?? (data?.queued ? "Queued. The explanations appear here in a minute or two." : "Up to date."));
    if (data?.queued) window.dispatchEvent(new Event(AI_QUEUED_EVENT));
    router.refresh();
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        type="button"
        variant={appearance === "primary" ? "default" : "outline"}
        className={cn("h-11 w-fit", appearance === "primary" && "rounded-full px-5")}
        disabled={pending || Boolean(disabledReason)}
        onClick={onClick}
        title={disabledReason}
      >
        {pending ? (
          <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
        ) : (
          <Sparkles className="size-3.5" aria-hidden />
        )}
        {pending ? "Queuing" : label}
      </Button>
      {disabledReason ? <p className="max-w-xs text-xs leading-5 text-muted-foreground">{disabledReason}</p> : null}
      {error ? (
        <p role="alert" className="max-w-xs text-sm text-bad">
          {error}
        </p>
      ) : null}
      {note ? <p className="max-w-xs text-sm text-body">{note}</p> : null}
    </div>
  );
}

type Status = "open" | "in-progress" | "done" | "dismissed";

const NEXT: Record<Status, Array<{ status: Status; label: string; icon: typeof Check }>> = {
  open: [
    { status: "in-progress", label: "Start", icon: Sparkles },
    { status: "done", label: "Mark done", icon: Check },
    { status: "dismissed", label: "Dismiss", icon: X },
  ],
  "in-progress": [
    { status: "done", label: "Mark done", icon: Check },
    { status: "dismissed", label: "Dismiss", icon: X },
  ],
  done: [{ status: "open", label: "Reopen", icon: RotateCcw }],
  dismissed: [{ status: "open", label: "Reopen", icon: RotateCcw }],
};

/**
 * The user's status on one opportunity. "Done" is their claim; the next crawl
 * says whether the condition is actually gone, and the card shows both.
 */
export function OpportunityStatusControl({
  projectId,
  opportunityId,
  status,
}: {
  projectId: string;
  opportunityId: string;
  status: Status;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<Status | null>(null);
  const [error, setError] = useState("");

  async function set(next: Status) {
    setPending(next);
    setError("");
    const response = await fetch(`/api/projects/${projectId}/opportunities/${opportunityId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: next }),
    }).catch(() => null);
    setPending(null);
    if (!response?.ok) {
      const data = (await response?.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? "Could not update it.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {NEXT[status].map((option) => (
        <button
          key={option.status}
          type="button"
          onClick={() => set(option.status)}
          disabled={pending != null}
          className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md px-2.5 font-mono text-[12px] text-body ring-1 ring-hairline hover:bg-surface-card hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-60"
        >
          {pending === option.status ? (
            <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
          ) : (
            <option.icon className="size-3.5" aria-hidden />
          )}
          {option.label}
        </button>
      ))}
      {error ? (
        <span role="alert" className="text-xs text-bad">
          {error}
        </span>
      ) : null}
    </div>
  );
}

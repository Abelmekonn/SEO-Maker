"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { AI_QUEUED_EVENT } from "@/components/project/AiQueueStatus";
import { Button } from "@/components/ui/button";

/** Queues AI interpretation of one competitor comparison (Phase 4.1). */
export function CompetitorInsightButton({
  projectId,
  competitorId,
  label,
  disabledReason,
  force = false,
}: {
  projectId: string;
  competitorId: string;
  label: string;
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
    const response = await fetch(`/api/projects/${projectId}/competitors/${competitorId}/insights`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ force }),
    }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as { error?: string; message?: string; queued?: boolean } | null;
    setPending(false);
    if (!response?.ok) {
      setError(data?.error ?? "Could not start the interpretation.");
      return;
    }
    setNote(data?.message ?? "Queued. The interpretation appears here in a minute or two.");
    if (data?.queued) window.dispatchEvent(new Event(AI_QUEUED_EVENT));
    router.refresh();
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button type="button" variant="outline" className="h-11 w-fit" disabled={pending || Boolean(disabledReason)} onClick={onClick} title={disabledReason}>
        {pending ? <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden /> : <Sparkles className="size-3.5" aria-hidden />}
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

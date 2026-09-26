"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoaderCircle, RefreshCw, Sparkles } from "lucide-react";
import { AI_QUEUED_EVENT } from "@/components/project/AiQueueStatus";
import { Button } from "@/components/ui/button";
import { AI_USAGE_EVENT, emit } from "@/lib/events";
import { cn } from "@/lib/utils";

/**
 * Starts one AI request. AI never runs unless a person presses this.
 *
 * Each press carries its own request id, so a retried network request is
 * counted once. The server decides everything else (plan, homepage rule,
 * allowance, evidence); this shows its answer in plain words: queued, already
 * running, nothing to do, not in the plan (with the way to it), or the
 * allowance used up (with when it frees).
 */
export function AiRunButton({
  endpoint,
  body,
  label,
  appearance = "outline",
  regenerate = false,
  disabledReason,
  size = "default",
}: {
  endpoint: string;
  body: Record<string, unknown>;
  label: string;
  appearance?: "outline" | "primary";
  /** A result exists: ask for a fresh one rather than the cached one. */
  regenerate?: boolean;
  disabledReason?: string;
  size?: "default" | "compact";
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState<{ tone: "info" | "error"; text: string; upgrade?: boolean } | null>(null);

  async function onClick() {
    setPending(true);
    setNote(null);
    const requestId = crypto.randomUUID().replace(/-/g, "");
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": requestId },
      body: JSON.stringify({ ...body, force: regenerate, requestId }),
    }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as {
      error?: string;
      message?: string;
      queued?: number | boolean;
      upgrade?: boolean;
    } | null;
    setPending(false);

    if (!response) {
      setNote({ tone: "error", text: "Could not reach the server. Check your connection and try again." });
      return;
    }
    if (!response.ok) {
      setNote({ tone: "error", text: data?.error ?? "The request could not start. Try again.", upgrade: Boolean(data?.upgrade) });
      emit(AI_USAGE_EVENT);
      return;
    }
    if (!data?.queued) {
      setNote({ tone: "info", text: data?.message ?? "Nothing new to do." });
      return;
    }
    setNote({ tone: "info", text: "Queued. The result appears here when it is ready, usually within a minute." });
    emit(AI_QUEUED_EVENT);
    emit(AI_USAGE_EVENT);
    router.refresh();
  }

  const blocked = Boolean(disabledReason);
  const Icon = pending ? LoaderCircle : regenerate ? RefreshCw : Sparkles;

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        type="button"
        variant={appearance === "primary" ? "default" : "outline"}
        className={cn(size === "compact" ? "h-9 px-3" : "h-11", appearance === "primary" && "rounded-full px-5")}
        disabled={pending || blocked}
        onClick={onClick}
        title={disabledReason}
      >
        <Icon className={cn("size-3.5", pending && "animate-spin motion-reduce:animate-none")} aria-hidden />
        {pending ? "Starting" : label}
      </Button>
      {disabledReason ? <p className="max-w-xs text-xs leading-5 text-muted-foreground">{disabledReason}</p> : null}
      {note ? (
        <p role={note.tone === "error" ? "alert" : "status"} className={cn("max-w-sm text-sm leading-6", note.tone === "error" ? "text-bad" : "text-body")}>
          {note.text}
          {note.upgrade ? (
            <>
              {" "}
              <Link href="/pricing" className="text-ink underline underline-offset-4 hover:text-primary">
                See plans
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

"use client";

import { LoaderCircle, Pin, RotateCw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { COMPETITOR_QUEUED_EVENT, emit } from "@/lib/events";
import { cn } from "@/lib/utils";

type Action = "pin" | "analyze" | "remove";

export function CompetitorRowActions({
  projectId,
  competitorId,
  pinned,
  busy,
}: {
  projectId: string;
  competitorId: string;
  pinned: boolean;
  busy: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<Action | null>(null);
  const [error, setError] = useState("");

  async function run(action: Action) {
    if (pending) return;
    setPending(action);
    setError("");

    const base = `/api/projects/${projectId}/competitors/${competitorId}`;
    const request =
      action === "pin"
        ? fetch(base, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pinned: !pinned }),
          })
        : action === "analyze"
          ? fetch(`${base}/analyze`, { method: "POST" })
          : fetch(base, { method: "DELETE" });

    const response = await request;
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    setPending(null);

    if (!response.ok) {
      setError(data?.error ?? "That did not work.");
      return;
    }
    if (action === "analyze") emit(COMPETITOR_QUEUED_EVENT);
    router.refresh();
  }

  const iconClass =
    "flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-card hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40";

  return (
    <span className="flex items-center justify-end gap-1" title={error || undefined}>
      <button
        type="button"
        aria-label={pinned ? "Unpin competitor" : "Pin competitor"}
        className={cn(iconClass, pinned && "text-primary")}
        disabled={pending !== null}
        onClick={(event) => {
          event.stopPropagation();
          void run("pin");
        }}
      >
        {pending === "pin" ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
        ) : (
          <Pin className={cn("size-4", pinned && "fill-current")} aria-hidden />
        )}
      </button>
      <button
        type="button"
        aria-label="Re-analyze competitor"
        className={iconClass}
        disabled={pending !== null || busy}
        onClick={(event) => {
          event.stopPropagation();
          void run("analyze");
        }}
      >
        {pending === "analyze" ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
        ) : (
          <RotateCw className="size-4" aria-hidden />
        )}
      </button>
      <button
        type="button"
        aria-label="Remove competitor"
        className={cn(iconClass, "hover:text-bad")}
        disabled={pending !== null}
        onClick={(event) => {
          event.stopPropagation();
          void run("remove");
        }}
      >
        {pending === "remove" ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
        ) : (
          <Trash2 className="size-4" aria-hidden />
        )}
      </button>
    </span>
  );
}

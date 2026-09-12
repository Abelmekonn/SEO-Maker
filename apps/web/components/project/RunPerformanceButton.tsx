"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RunPerformanceButton({
  projectId,
  pageIds,
  active = false,
  hasResults = false,
  disabled = false,
  runLabel = "Run PageSpeed",
}: {
  projectId: string;
  pageIds: string[];
  active?: boolean;
  hasResults?: boolean;
  disabled?: boolean;
  runLabel?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function onClick() {
    setPending(true);
    setError("");
    const response = await fetch(`/api/projects/${projectId}/performance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageIds }),
    });
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    setPending(false);
    if (!response.ok) {
      setError(data?.error ?? "Could not start PageSpeed.");
      return;
    }
    router.refresh();
  }

  const busy = pending || active;
  const count = pageIds.length;

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        type="button"
        variant={hasResults ? "outline" : "default"}
        className="h-11 w-fit"
        disabled={busy || disabled || count === 0}
        aria-busy={busy}
        onClick={onClick}
      >
        {busy ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
        {pending
          ? "Queuing"
          : active
            ? "Running PageSpeed"
            : hasResults
              ? count > 1
                ? `Run again (${count})`
                : "Run again"
              : count > 1
                ? `${runLabel} (${count})`
                : runLabel}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      ) : null}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RunPerformanceButton({
  projectId,
  active = false,
  hasResults = false,
}: {
  projectId: string;
  active?: boolean;
  hasResults?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function onClick() {
    setPending(true);
    setError("");
    const response = await fetch(`/api/projects/${projectId}/performance`, {
      method: "POST",
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

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        type="button"
        variant={hasResults ? "outline" : "default"}
        className="h-11 w-fit"
        disabled={busy}
        aria-busy={busy}
        onClick={onClick}
      >
        {busy ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
        {pending
          ? "Queuing"
          : active
            ? "Running PageSpeed"
            : hasResults
              ? "Run again"
              : "Run PageSpeed"}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      ) : null}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Radar } from "lucide-react";
import { Button } from "@/components/ui/button";

export function GeoRunButton({
  projectId,
  active = false,
  hasResults = false,
  disabled = false,
}: {
  projectId: string;
  active?: boolean;
  hasResults?: boolean;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    setPending(true);
    setError("");
    const response = await fetch(`/api/projects/${projectId}/geo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // A re-run from the button is always deliberate, so it skips the
      // unchanged-content short circuit.
      body: JSON.stringify({ force: hasResults }),
    });
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    setPending(false);
    if (!response.ok) {
      setError(data?.error ?? "Could not start the analysis.");
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
        disabled={busy || disabled}
        aria-busy={busy}
        onClick={run}
      >
        {busy ? (
          <LoaderCircle className="animate-spin" aria-hidden />
        ) : (
          <Radar className="size-4" aria-hidden />
        )}
        {pending ? "Queuing" : active ? "Analyzing" : hasResults ? "Run again" : "Run analysis"}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      ) : null}
    </div>
  );
}

"use client";

import { LoaderCircle, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * The manual escape hatch. This is the one path that works with no SERP
 * provider and no AI key configured, so it stays visible in every state.
 */
export function CompetitorAddForm({
  projectId,
  disabled = false,
  disabledReason,
}: {
  projectId: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const router = useRouter();
  const [domain, setDomain] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!domain.trim() || pending) return;

    setPending(true);
    setError("");
    const response = await fetch(`/api/projects/${projectId}/competitors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain }),
    });
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    setPending(false);

    if (!response.ok) {
      setError(data?.error ?? "Could not add that competitor.");
      return;
    }
    setDomain("");
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl bg-surface-soft p-5 ring-1 ring-hairline">
      <div>
        <h2 className="font-display text-[18px] leading-6 tracking-[-0.3px] text-ink">
          Add a competitor
        </h2>
        <p className="mt-1 text-sm leading-6 text-body">
          Know who you compete with? Add them directly. We will crawl their site and score it
          against yours.
        </p>
      </div>
      <form onSubmit={onSubmit} className="flex flex-wrap items-start gap-2">
        <label className="sr-only" htmlFor="competitor-domain">
          Competitor domain
        </label>
        <input
          id="competitor-domain"
          type="text"
          inputMode="url"
          autoComplete="off"
          value={domain}
          disabled={disabled || pending}
          onChange={(event) => setDomain(event.target.value)}
          placeholder="example.com"
          className="h-11 min-w-0 flex-1 rounded-md bg-canvas px-3 font-mono text-sm text-ink ring-1 ring-hairline placeholder:text-muted-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:text-muted-soft"
        />
        <Button
          type="submit"
          className="h-11 w-fit"
          disabled={disabled || pending || !domain.trim()}
          aria-busy={pending}
        >
          {pending ? (
            <LoaderCircle className="animate-spin" aria-hidden />
          ) : (
            <Plus className="size-4" aria-hidden />
          )}
          {pending ? "Adding" : "Add competitor"}
        </Button>
      </form>
      {disabled && disabledReason ? (
        <p className="text-sm text-body">{disabledReason}</p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      ) : null}
    </section>
  );
}

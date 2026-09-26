"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleAlert, Loader2, Radar, RefreshCw, ServerCog, Shapes } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DiscoveryState } from "@/lib/site-inventory";
import { cn } from "@/lib/utils";

/**
 * A new site's first step: finding its pages, before anything is crawled.
 *
 * Discovery reads robots.txt, the sitemaps and the homepage's links, then
 * sorts every page into Priority or Standard. It runs in the worker; this
 * polls its status and hands over to the "ready to crawl" view when it is
 * done. Sub-steps are not reported by the worker, so they are not claimed
 * here: the view says what discovery does, and whether it is waiting or
 * working.
 */

const POLL_MS = 1500;

type Status = DiscoveryState & { workerOnline?: boolean };

export function DiscoveryView({
  projectId,
  hostname,
  initial,
}: {
  projectId: string;
  hostname: string;
  initial: Status;
}) {
  const router = useRouter();
  const [state, setState] = useState<Status>(initial);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState("");
  const live = state.status === "queued" || state.status === "running";

  const load = useCallback(async () => {
    const response = await fetch(`/api/projects/${projectId}/discover`, { cache: "no-store" }).catch(() => null);
    if (!response?.ok) return;
    const next = (await response.json()) as Status;
    setState(next);
    if (next.status === "done") router.refresh();
  }, [projectId, router]);

  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [live, load]);

  async function retry() {
    setRetrying(true);
    setError("");
    const response = await fetch(`/api/projects/${projectId}/discover`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "initial" }),
    }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as { error?: string } | null;
    setRetrying(false);
    if (!response?.ok) {
      setError(data?.error ?? "Could not start. Try again.");
      return;
    }
    setState((current) => ({ ...current, status: "queued", error: null }));
  }

  const failed = state.status === "failed";
  const steps = [
    { id: "queued", label: "Waiting for the crawler", icon: ServerCog },
    { id: "find", label: "Reading robots.txt, sitemaps and your homepage's links", icon: Radar },
    { id: "sort", label: "Sorting pages into Priority and Standard", icon: Shapes },
  ] as const;
  const current = state.status === "queued" ? 0 : 1;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <section
        aria-labelledby="discovery-title"
        className="relative overflow-hidden rounded-2xl bg-surface-soft ring-1 ring-hairline"
      >
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute -top-44 -right-24 size-[520px] rounded-full blur-3xl",
            failed ? "bg-bad/10" : "bg-primary/15 motion-safe:animate-pulse",
          )}
        />
        <div className="relative flex flex-col gap-7 p-6 sm:p-8">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-canvas ring-1 ring-hairline">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`}
                alt=""
                width={24}
                height={24}
                className="size-6"
              />
            </span>
            <div className="flex min-w-0 flex-col">
              <p className="font-mono text-[12px] text-primary">Step 1 of 2 · Discover</p>
              <p className="truncate font-mono text-sm text-body">{hostname}</p>
            </div>
          </div>

          <div className="flex max-w-2xl flex-col gap-2">
            <h1 id="discovery-title" className="font-display text-[28px] leading-tight tracking-[-0.6px] text-ink">
              {failed ? `Could not find the pages on ${hostname}` : `Finding the pages on ${hostname}`}
            </h1>
            <p className="text-sm leading-6 text-body">
              {failed
                ? "Discovery stopped before it could list your pages. Nothing was crawled or charged."
                : "SEO Maker lists your site's pages and sorts each one into Priority or Standard. Nothing is crawled yet: you choose when to start."}
            </p>
          </div>

          {failed ? (
            <div className="flex flex-col items-start gap-3">
              <p role="alert" className="flex items-start gap-2 text-sm leading-6 text-bad">
                <CircleAlert className="mt-1 size-4 shrink-0" aria-hidden />
                {state.error ?? "The worker reported a failure."}
              </p>
              <Button type="button" className="h-11 rounded-full px-5" onClick={retry} disabled={retrying}>
                {retrying ? (
                  <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
                ) : (
                  <RefreshCw className="size-3.5" aria-hidden />
                )}
                {retrying ? "Starting" : "Try again"}
              </Button>
              {error ? <p className="text-sm text-bad">{error}</p> : null}
            </div>
          ) : (
            <ol className="flex flex-col gap-3" aria-label="Discovery steps">
              {steps.map((step, index) => {
                const done = index < current;
                const active = index === current || (current === 1 && index === 2);
                return (
                  <li key={step.id} className="flex items-center gap-3">
                    <span
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-full ring-1",
                        done
                          ? "bg-good/15 text-good ring-good/30"
                          : active
                            ? "bg-primary/15 text-primary ring-primary/30"
                            : "bg-canvas text-muted-foreground ring-hairline",
                      )}
                    >
                      {done ? (
                        <Check className="size-4" aria-hidden />
                      ) : active ? (
                        <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
                      ) : (
                        <step.icon className="size-4" aria-hidden />
                      )}
                    </span>
                    <span className={cn("text-sm", done || active ? "text-ink" : "text-muted-foreground")}>
                      {step.label}
                      <span className="sr-only">{done ? " (done)" : active ? " (in progress)" : ""}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </section>

      {live && state.workerOnline === false ? (
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-warn/10 px-4 py-3 text-sm leading-6 text-warn ring-1 ring-warn/30">
          <CircleAlert className="mt-1 size-4 shrink-0" aria-hidden />
          No crawler worker is connected, so discovery is waiting. Start the worker (pnpm dev, or the worker app on its
          own) and it begins right away.
        </p>
      ) : null}
    </div>
  );
}

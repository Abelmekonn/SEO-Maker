"use client";

import { type FormEvent, useId, useState } from "react";
import Link from "next/link";
import { ArrowRight, CircleAlert, CircleCheck, Info, LoaderCircle, Search, TriangleAlert, Zap } from "lucide-react";
import type { QuickCheck, QuickInspection } from "@seo-maker/core/quick";
import { cn } from "@/lib/utils";

/**
 * Quick Search: inspect one URL in seconds, on every plan.
 *
 * Reads only the start of the page (never the whole thing) and runs
 * deterministic checks. Nothing is saved and no AI runs; a Deep Analysis is
 * one click away for the full crawl.
 */

const ORDER: Record<QuickCheck["status"], number> = { fail: 0, warn: 1, pass: 2, info: 3 };

const STYLE: Record<QuickCheck["status"], { icon: typeof CircleCheck; className: string; label: string }> = {
  pass: { icon: CircleCheck, className: "text-good", label: "Passes" },
  fail: { icon: CircleAlert, className: "text-bad", label: "Fails" },
  warn: { icon: TriangleAlert, className: "text-warn", label: "Warning" },
  info: { icon: Info, className: "text-muted-foreground", label: "Note" },
};

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}

export function QuickSearchPanel({ initialUrl = "", compact = false }: { initialUrl?: string; compact?: boolean }) {
  const inputId = useId();
  const [url, setUrl] = useState(initialUrl);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<QuickInspection | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!url.trim()) {
      setError("Enter a page address, like example.com/pricing.");
      return;
    }
    setPending(true);
    setError("");
    const response = await fetch("/api/quick-search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
    }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as (QuickInspection & { error?: string | null }) | null;
    setPending(false);
    if (!response?.ok || !data?.checks) {
      setResult(null);
      setError(data?.error ?? "Quick Search could not run. Try again in a moment.");
      return;
    }
    setResult(data);
  }

  const checks = result ? [...result.checks].sort((a, b) => ORDER[a.status] - ORDER[b.status]) : [];
  const counts = {
    fail: checks.filter((check) => check.status === "fail").length,
    warn: checks.filter((check) => check.status === "warn").length,
    pass: checks.filter((check) => check.status === "pass").length,
  };

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={onSubmit} className="flex flex-col gap-2" noValidate>
        <label htmlFor={inputId} className="font-mono text-[12px] text-muted-foreground">
          Page address
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <span
            className={cn(
              "flex h-14 min-w-0 flex-1 items-center gap-3 rounded-2xl bg-canvas px-4 ring-1 focus-within:ring-2 focus-within:ring-ring",
              error ? "ring-bad/60" : "ring-hairline",
            )}
          >
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <input
              id={inputId}
              type="text"
              inputMode="url"
              autoComplete="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="example.com/pricing"
              aria-invalid={error ? true : undefined}
              aria-describedby={`${inputId}-hint`}
              className="h-full min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-muted-foreground"
            />
          </span>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-14 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-primary px-6 font-mono text-sm text-primary-foreground transition-colors hover:bg-primary-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-70"
          >
            {pending ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Zap className="size-4" aria-hidden />}
            {pending ? "Inspecting" : "Quick Search"}
          </button>
        </div>
        {error ? (
          <p id={`${inputId}-hint`} role="alert" className="text-sm text-bad">
            {error}
          </p>
        ) : (
          <p id={`${inputId}-hint`} className="text-xs leading-5 text-muted-foreground">
            Checks the page&apos;s status, title, description, headings, canonical and indexability in a few seconds.
            Nothing is saved, and only the start of the page is read.
          </p>
        )}
      </form>

      {pending && !result ? (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Inspecting the page">
          {[0, 1, 2, 3, 4].map((row) => (
            <span key={row} className="h-12 animate-pulse rounded-lg bg-surface-soft motion-reduce:animate-none" />
          ))}
        </div>
      ) : null}

      {result ? (
        <section aria-label="Quick Search result" className={cn("flex flex-col gap-4", pending && "opacity-60")} aria-live="polite">
          <div className="flex flex-col gap-3 rounded-xl bg-surface-soft p-5 ring-1 ring-hairline">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-[12px] text-muted-foreground">Inspected</p>
                <a
                  href={result.finalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block break-all font-mono text-sm text-ink underline-offset-4 hover:underline"
                >
                  {result.finalUrl}
                </a>
              </div>
              <div className="flex flex-wrap gap-2 font-mono text-[12px]">
                <span className="rounded-full bg-surface-card px-2.5 py-1 text-ink">HTTP {result.status ?? "–"}</span>
                {result.responseTimeMs != null ? (
                  <span className="rounded-full bg-surface-card px-2.5 py-1 text-body">{result.responseTimeMs} ms</span>
                ) : null}
                <span className={cn("rounded-full px-2.5 py-1", result.indexable ? "bg-good/15 text-good" : "bg-bad/15 text-bad")}>
                  {result.indexable ? "Indexable" : "Not indexable"}
                </span>
              </div>
            </div>
            {result.redirects.length ? (
              <ol className="flex flex-col gap-1 font-mono text-[11px] text-muted-foreground">
                {result.redirects.map((hop) => (
                  <li key={`${hop.from}-${hop.to}`} className="break-all">
                    {hop.status} · {hop.from} → {hop.to}
                  </li>
                ))}
              </ol>
            ) : null}
            {result.error ? <p className="text-sm text-warn">{result.error}</p> : null}
            <p className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[12px]">
              <span className="text-bad">{counts.fail} failing</span>
              <span className="text-warn">{counts.warn} to review</span>
              <span className="text-good">{counts.pass} passing</span>
            </p>
          </div>

          <ul className="flex flex-col divide-y divide-hairline overflow-hidden rounded-xl bg-surface-soft ring-1 ring-hairline">
            {checks.map((check) => {
              const style = STYLE[check.status];
              return (
                <li key={check.id} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 px-5 py-3.5 sm:grid-cols-[auto_160px_minmax(0,1fr)]">
                  <style.icon className={cn("mt-0.5 size-4", style.className)} aria-label={style.label} />
                  <p className="text-sm font-medium text-ink">{check.label}</p>
                  <p className="col-start-2 break-words text-sm leading-6 text-body sm:col-start-3">{check.detail}</p>
                </li>
              );
            })}
          </ul>

          {result.partial ? (
            <p className="text-xs leading-5 text-muted-foreground">
              Read the first {Math.round(result.bytesRead / 1024)} KB of this page; the rest was not downloaded. A Deep
              Analysis crawls the whole page.
            </p>
          ) : null}

          {!compact ? (
            <div className="flex flex-col items-start gap-3 rounded-xl bg-surface-soft p-5 ring-1 ring-hairline sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium text-ink">Go deeper on {hostOf(result.finalUrl)}</p>
                <p className="text-sm leading-6 text-body">
                  A Deep Analysis crawls the site, runs every check with its evidence, measures performance and unlocks
                  AI recommendations.
                </p>
              </div>
              <Link
                href={`/projects/new?url=${encodeURIComponent(originOf(result.finalUrl))}`}
                className="inline-flex h-11 shrink-0 items-center gap-2 rounded-md bg-primary px-4 font-mono text-sm text-primary-foreground hover:bg-primary-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Run Deep Analysis
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

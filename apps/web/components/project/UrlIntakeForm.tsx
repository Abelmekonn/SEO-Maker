"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ChevronDown, Globe, Layers, Lock, Zap } from "lucide-react";
import { GoPremiumButton } from "@/components/project/PremiumGate";
import { QuickSearchPanel } from "@/components/quick/QuickSearchPanel";
import { SITES_CHANGED_EVENT, emit } from "@/lib/events";
import { normalizeSiteUrl } from "@/lib/site-url";
import { cn } from "@/lib/utils";

/**
 * Two ways in, on every plan:
 *
 *  - Quick Search inspects one URL in seconds. Nothing is saved.
 *  - Deep Analysis adds the site: a crawl, every check with its evidence,
 *    performance and AI. Business context is optional; it makes AI
 *    recommendations specific to the business rather than generic, and is
 *    editable later, so nothing here blocks a user who just wants results.
 */
const DEEP_FIELDS = [
  { key: "businessName", label: "Business name", placeholder: "Acme Payments" },
  { key: "businessType", label: "Business type", placeholder: "SaaS, agency, clinic…" },
  { key: "targetAudience", label: "Who you sell to", placeholder: "Finance teams at retailers" },
  { key: "targetLocation", label: "Main market", placeholder: "United Kingdom" },
  { key: "servicesProducts", label: "Services or products", placeholder: "Payments, Billing" },
  { key: "primaryGoal", label: "Primary goal", placeholder: "Free account sign-ups" },
] as const;

type DeepKey = (typeof DEEP_FIELDS)[number]["key"];

export function UrlIntakeForm({
  initialUrl = "",
  canUseDeep = true,
  maxPages,
}: {
  initialUrl?: string;
  /** False on plans without Deep. The Deep option is then shown locked. */
  canUseDeep?: boolean;
  /** Pages the first crawl covers on this plan. */
  maxPages?: number;
}) {
  const router = useRouter();
  const [url, setUrl] = useState(initialUrl);
  const [mode, setMode] = useState<"quick-search" | "deep">("deep");
  const [showContext, setShowContext] = useState(false);
  const [upgrade, setUpgrade] = useState(false);
  const [business, setBusiness] = useState<Record<DeepKey, string>>({
    businessName: "",
    businessType: "",
    targetAudience: "",
    targetLocation: "",
    servicesProducts: "",
    primaryGoal: "",
  });
  const [error, setError] = useState("");
  const [existingId, setExistingId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeSiteUrl(url);
    if ("error" in normalized) {
      setError(normalized.error);
      return;
    }

    setPending(true);
    setError("");
    setExistingId(null);

    const response = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Business context when given; the server records the mode from it.
      body: JSON.stringify({
        url: normalized.href,
        business: canUseDeep && showContext ? business : undefined,
      }),
    });

    const data = (await response.json().catch(() => null)) as
      | { id?: string; error?: string; upgrade?: boolean }
      | null;

    if (response.status === 409) {
      setUpgrade(Boolean(data?.upgrade));
      setPending(false);
      setExistingId(data?.id ?? null);
      setError(data?.error ?? "You have already used your one free project.");
      return;
    }

    if (!response.ok || !data?.id) {
      setPending(false);
      setError(data?.error ?? "Could not start the project.");
      return;
    }

    emit(SITES_CHANGED_EVENT);
    router.push(`/projects/${data.id}`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 font-mono text-[12px] text-muted-foreground">How deep?</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <ModeCard
            id="mode-quick-search"
            icon={Zap}
            checked={mode === "quick-search"}
            onSelect={() => setMode("quick-search")}
            title="Quick Search"
            description="Inspect one page in seconds: status, title, description, headings, canonical, indexability. Nothing is saved."
          />
          {canUseDeep ? (
            <ModeCard
              id="mode-deep"
              icon={Layers}
              checked={mode === "deep"}
              onSelect={() => setMode("deep")}
              title="Deep Analysis"
              description={
                maxPages === 1
                  ? "Add the site and analyse its homepage fully: every check, performance and AI recommendations."
                  : "Add the site and crawl it: every check with its evidence, performance and AI recommendations."
              }
            />
          ) : (
            <div className="flex flex-col gap-3 rounded-xl p-4 ring-1 ring-hairline">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Layers className="size-4" aria-hidden />
                  Deep Analysis
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-surface-card px-2 py-0.5 font-mono text-[11px] text-body">
                  <Lock className="size-3" aria-hidden />
                  Premium
                </span>
              </div>
              <GoPremiumButton label="Unlock" className="h-9 w-fit px-3 text-xs" />
            </div>
          )}
        </div>
      </fieldset>

      {mode === "quick-search" ? (
        <QuickSearchPanel initialUrl={url} />
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <label htmlFor="project-url" className="font-mono text-[12px] text-muted-foreground">
              Website address
            </label>
            <div
              className={cn(
                "flex h-14 items-center gap-3 rounded-2xl bg-canvas px-4 ring-1 transition-shadow focus-within:ring-2 focus-within:ring-ring",
                error ? "ring-bad/60" : "ring-hairline",
              )}
            >
              <Globe className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <input
                id="project-url"
                name="url"
                type="text"
                inputMode="url"
                autoComplete="url"
                autoFocus
                required
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="yourwebsite.com"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "project-url-error" : "project-url-hint"}
                className="h-full min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-muted-foreground"
              />
            </div>
            {error ? (
              <div className="flex flex-col gap-2">
                <p id="project-url-error" role="alert" className="text-sm text-bad">
                  {error}
                </p>
                <div className="flex flex-wrap items-center gap-4">
                  {existingId ? (
                    <Link
                      href={`/projects/${existingId}`}
                      className="text-sm text-ink underline underline-offset-4 hover:text-primary"
                    >
                      Open your project
                    </Link>
                  ) : null}
                  {upgrade ? <GoPremiumButton /> : null}
                </div>
              </div>
            ) : (
              <p id="project-url-hint" className="text-xs leading-5 text-muted-foreground">
                The homepage address is enough, with or without https://.
              </p>
            )}
          </div>

          {canUseDeep ? (
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => setShowContext((value) => !value)}
                aria-expanded={showContext}
                aria-controls="business-context"
                className="flex w-fit cursor-pointer items-center gap-2 rounded-md text-sm text-ink hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ChevronDown className={cn("size-4 transition-transform", showContext && "rotate-180")} aria-hidden />
                Add business context <span className="text-muted-foreground">(optional)</span>
              </button>
              {showContext ? (
                <div id="business-context" className="grid gap-4 rounded-xl bg-canvas p-4 ring-1 ring-hairline sm:grid-cols-2">
                  {DEEP_FIELDS.map((entry) => (
                    <label key={entry.key} className="flex flex-col gap-2">
                      <span className="text-sm font-medium text-ink">{entry.label}</span>
                      <input
                        type="text"
                        value={business[entry.key]}
                        placeholder={entry.placeholder}
                        onChange={(event) =>
                          setBusiness((current) => ({ ...current, [entry.key]: event.target.value }))
                        }
                        className="h-11 rounded-md border border-hairline bg-surface-soft px-3 text-sm text-ink outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                      />
                    </label>
                  ))}
                  <p className="text-xs leading-5 text-muted-foreground sm:col-span-2">
                    Makes AI recommendations specific to your business. All optional and editable later in site
                    settings; anything left blank is simply not assumed.
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-hairline pt-5">
            <p className="text-sm leading-6 text-body">
              {maxPages == null
                ? "The crawl starts as soon as you submit."
                : maxPages === 1
                  ? "We analyse the homepage. It takes about a minute."
                  : `We crawl up to ${maxPages} pages. The homepage is ready first.`}
            </p>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-md bg-primary px-5 font-mono text-sm text-primary-foreground transition-colors hover:bg-primary-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-70"
            >
              {pending ? "Starting…" : "Start Deep Analysis"}
              <ArrowRight className="size-4" aria-hidden />
            </button>
          </div>
        </form>
      )}
    </div>
  );
}


function ModeCard({
  id,
  icon: Icon,
  checked,
  onSelect,
  title,
  description,
}: {
  id: string;
  icon: typeof Zap;
  checked: boolean;
  onSelect: () => void;
  title: string;
  description: string;
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex cursor-pointer flex-col gap-2 rounded-xl p-4 ring-1 transition",
        checked ? "bg-surface-card ring-primary/60" : "ring-hairline hover:bg-surface-card/50",
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-medium text-ink">
          <Icon className={cn("size-4", checked ? "text-primary" : "text-muted-foreground")} aria-hidden />
          {title}
        </span>
        <input
          id={id}
          type="radio"
          name="analysis-mode"
          checked={checked}
          onChange={onSelect}
          className="size-4 accent-[#ff6d29]"
        />
      </span>
      <span className="text-xs leading-5 text-muted-foreground">{description}</span>
    </label>
  );
}

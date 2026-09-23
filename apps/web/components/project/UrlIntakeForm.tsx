"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Globe, Layers, Lock, Zap } from "lucide-react";
import { GoPremiumButton } from "@/components/project/PremiumGate";
import { normalizeSiteUrl } from "@/lib/site-url";
import { cn } from "@/lib/utils";

/**
 * Quick starts from the URL alone (Phase 0.6). Deep collects business context
 * first, which is what lets recommendations be specific to the business rather
 * than generic SEO advice. Deep context is optional and editable later, so
 * nothing here blocks a user who just wants to see results.
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
  const [mode, setMode] = useState<"quick" | "deep">("quick");
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
      body: JSON.stringify({
        url: normalized.href,
        mode,
        business: mode === "deep" ? business : undefined,
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

    router.push(`/projects/${data.id}`);
    router.refresh();
  }

  return (
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

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 font-mono text-[12px] text-muted-foreground">Analysis</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <ModeCard
            id="mode-quick"
            icon={Zap}
            checked={mode === "quick"}
            onSelect={() => setMode("quick")}
            title="Quick check"
            description="Starts straight away. Every technical and on-page check runs."
          />
          {canUseDeep ? (
            <ModeCard
              id="mode-deep"
              icon={Layers}
              checked={mode === "deep"}
              onSelect={() => setMode("deep")}
              title="Deep analysis"
              description="Add a few business details so recommendations fit your business."
            />
          ) : (
            <div className="flex flex-col gap-3 rounded-xl p-4 ring-1 ring-hairline">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Layers className="size-4" aria-hidden />
                  Deep analysis
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-surface-card px-2 py-0.5 font-mono text-[11px] text-body">
                  <Lock className="size-3" aria-hidden />
                  Premium
                </span>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                Business context makes every recommendation specific to you.
              </p>
              <GoPremiumButton label="Unlock" className="h-9 w-fit px-3 text-xs" />
            </div>
          )}
        </div>
      </fieldset>

      {canUseDeep && mode === "deep" ? (
        <div className="grid gap-4 rounded-xl bg-canvas p-4 ring-1 ring-hairline sm:grid-cols-2">
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
            All optional, and editable later in project settings. Anything you leave blank is
            simply not assumed.
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-hairline pt-5">
        <p className="text-sm leading-6 text-body">
          {maxPages == null
            ? "The crawl starts as soon as you submit."
            : maxPages === 1
              ? "We audit the homepage first. It takes about a minute."
              : `We audit up to ${maxPages} pages. The homepage is ready first.`}
        </p>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-md bg-primary px-5 font-mono text-sm text-primary-foreground transition-colors hover:bg-primary-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-70"
        >
          {pending ? "Starting…" : "Start audit"}
          <ArrowRight className="size-4" aria-hidden />
        </button>
      </div>
    </form>
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

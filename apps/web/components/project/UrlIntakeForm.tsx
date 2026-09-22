"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { normalizeSiteUrl } from "@/lib/site-url";

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

export function UrlIntakeForm({ initialUrl = "" }: { initialUrl?: string }) {
  const router = useRouter();
  const [url, setUrl] = useState(initialUrl);
  const [mode, setMode] = useState<"quick" | "deep">("quick");
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
      | { id?: string; error?: string }
      | null;

    if (response.status === 409 && data?.id) {
      setPending(false);
      setExistingId(data.id);
      setError(data.error ?? "Free includes one project.");
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
    <form onSubmit={onSubmit} className="flex max-w-xl flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="project-url" className="text-sm font-medium text-ink">
          Site URL
        </label>
        <input
          id="project-url"
          name="url"
          type="text"
          inputMode="url"
          autoComplete="url"
          required
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="example.com"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "project-url-error" : undefined}
          className="h-11 rounded-md border border-hairline bg-canvas px-3 text-sm text-ink outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium text-ink">How deep should we go?</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <ModeCard
            id="mode-quick"
            checked={mode === "quick"}
            onSelect={() => setMode("quick")}
            title="Quick check"
            description="Starts straight away from the URL. Every technical and on-page check runs."
          />
          <ModeCard
            id="mode-deep"
            checked={mode === "deep"}
            onSelect={() => setMode("deep")}
            title="Deep analysis"
            description="Adds a few details about the business so recommendations can be specific to it."
          />
        </div>
      </fieldset>

      {mode === "deep" ? (
        <div className="grid gap-4 rounded-lg bg-canvas p-4 ring-1 ring-hairline sm:grid-cols-2">
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

      {error ? (
        <div className="flex flex-col gap-2">
          <p id="project-url-error" role="alert" className="text-sm text-ink">
            {error}
          </p>
          {existingId ? (
            <Link
              href={`/projects/${existingId}`}
              className="text-sm underline underline-offset-4 hover:text-ink"
            >
              Open your project
            </Link>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-body">
          We crawl the homepage when the project starts. Your plan sets how many
          sites and pages you can add.
        </p>
      )}
      <Button type="submit" className="h-11 w-fit" disabled={pending}>
        {pending ? "Starting…" : "Start project"}
      </Button>
    </form>
  );
}

function ModeCard({
  id,
  checked,
  onSelect,
  title,
  description,
}: {
  id: string;
  checked: boolean;
  onSelect: () => void;
  title: string;
  description: string;
}) {
  return (
    <label
      htmlFor={id}
      className={`flex cursor-pointer flex-col gap-1 rounded-lg p-4 ring-1 transition ${
        checked ? "bg-canvas ring-ring" : "bg-transparent ring-hairline hover:ring-ring/50"
      }`}
    >
      <span className="flex items-center gap-2">
        <input
          id={id}
          type="radio"
          name="analysis-mode"
          checked={checked}
          onChange={onSelect}
          className="size-4 accent-current"
        />
        <span className="text-sm font-medium text-ink">{title}</span>
      </span>
      <span className="pl-6 text-xs leading-5 text-muted-foreground">{description}</span>
    </label>
  );
}

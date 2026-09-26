"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Lets the user say what a page is when the crawler could not tell.
 *
 * Structured data and type-specific advice are withheld while the type is
 * uncertain, because guessing it produces confident, wrong markup. The user
 * knows their own site, so their answer is stored with full confidence and
 * kept for future crawls.
 */

const TYPES: Array<{ value: string; label: string }> = [
  { value: "product", label: "Product" },
  { value: "service", label: "Service" },
  { value: "pricing", label: "Pricing" },
  { value: "article", label: "Article or blog post" },
  { value: "documentation", label: "Documentation or guide" },
  { value: "category", label: "Category or listing" },
  { value: "landing", label: "Landing page" },
  { value: "about", label: "About" },
  { value: "contact", label: "Contact" },
  { value: "legal", label: "Legal" },
  { value: "utility", label: "Utility (login, cart, account, search)" },
  { value: "homepage", label: "Homepage" },
  { value: "other", label: "Something else" },
];

export function PageTypeControl({
  projectId,
  pageId,
  current,
  prompt = "What kind of page is this?",
  compact = false,
}: {
  projectId: string;
  pageId: string;
  current: string | null;
  prompt?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const id = useId();
  const [value, setValue] = useState(current && current !== "other" ? current : "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function save() {
    if (!value) return;
    setPending(true);
    setError("");
    const response = await fetch(`/api/projects/${projectId}/pages/${pageId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pageType: value }),
    }).catch(() => null);
    setPending(false);
    if (!response?.ok) {
      const data = (await response?.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? "Could not save the page type.");
      return;
    }
    setSaved(true);
    router.refresh();
    window.setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className={cn("flex flex-col gap-2", !compact && "rounded-lg bg-canvas/70 p-3 ring-1 ring-hairline")}>
      {compact ? null : (
        <label htmlFor={id} className="text-sm text-ink">
          {prompt}
        </label>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <select
          id={id}
          aria-label={compact ? "Page type" : undefined}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="h-9 min-w-44 cursor-pointer rounded-md border border-hairline bg-surface-soft px-2.5 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="" disabled>
            Choose a type
          </option>
          {TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={save}
          disabled={!value || pending || value === current}
          className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md bg-primary px-3 font-mono text-[12px] text-primary-foreground hover:bg-primary-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saved ? <Check className="size-3.5" aria-hidden /> : null}
          {pending ? "Saving" : saved ? "Saved" : "Save type"}
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-bad">
          {error}
        </p>
      ) : !compact ? (
        <p className="text-xs leading-5 text-muted-foreground">
          Kept for future crawls. Run the analysis again afterwards to generate the fix.
        </p>
      ) : null}
    </div>
  );
}

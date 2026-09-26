"use client";

import type { ProfileField, ProfileGap } from "@seo-maker/core/competitors";
import { LoaderCircle, X } from "lucide-react";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { BusinessContext } from "@/lib/business-context";
import { cn } from "@/lib/utils";

/**
 * "Complete your business profile": the fields competitor discovery and
 * search keywords need, asked for before either runs rather than guessed.
 *
 * Saves through the business context endpoint with every other context
 * field kept as it was, then hands back to the action that asked.
 */

const FIELD =
  "h-11 w-full rounded-md border border-hairline bg-canvas px-3 text-sm text-ink outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring";
const AREA =
  "min-h-20 w-full rounded-md border border-hairline bg-canvas p-3 text-sm leading-6 text-ink outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring";

const FIELDS: Array<{ field: ProfileField; label: string; placeholder: string; area?: boolean; hint: string }> = [
  { field: "businessType", label: "Business type", placeholder: "SaaS, agency, dental clinic, online shop", hint: "What kind of business this is." },
  {
    field: "targetLocation",
    label: "Target location or market",
    placeholder: "United Kingdom, or Global (mainly United States)",
    hint: "Search results differ by country, so name one. A global business names the market that matters most.",
  },
  { field: "targetAudience", label: "Target audience", placeholder: "Finance teams at mid-sized online retailers", area: true, hint: "Who buys from you." },
  { field: "servicesProducts", label: "Main services or products", placeholder: "Payments, Billing, Invoicing", hint: "Comma separated." },
  {
    field: "businessDescription",
    label: "Business description",
    placeholder: "We help online businesses accept payments and manage subscriptions.",
    area: true,
    hint: "Two or three sentences.",
  },
];

export function BusinessProfileDialog({
  projectId,
  initial,
  missing,
  open,
  onClose,
  onSaved,
  submitLabel,
  intro,
}: {
  projectId: string;
  initial: BusinessContext;
  missing: ProfileGap[];
  open: boolean;
  onClose: () => void;
  /** Runs after the profile is saved: the action that needed it. */
  onSaved: () => Promise<void> | void;
  submitLabel: string;
  intro: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [values, setValues] = useState<Record<ProfileField, string>>(() => ({
    businessType: initial.businessType ?? "",
    targetLocation: initial.targetLocation ?? "",
    targetAudience: initial.targetAudience ?? "",
    servicesProducts: initial.servicesProducts.join(", "),
    businessDescription: initial.businessDescription ?? "",
  }));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [gaps, setGaps] = useState(missing);

  useEffect(() => setGaps(missing), [missing]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const gapFor = (field: ProfileField) => gaps.find((gap) => gap.field === field) ?? null;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    // Every other context field is sent back as it was: the endpoint
    // replaces the whole context.
    const response = await fetch(`/api/projects/${projectId}/context`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        business: {
          businessName: initial.businessName,
          industry: initial.industry,
          primaryGoal: initial.primaryGoal,
          targetKeywords: initial.targetKeywords,
          ...values,
        },
      }),
    }).catch(() => null);
    if (!response?.ok) {
      const data = (await response?.json().catch(() => null)) as { error?: string } | null;
      setPending(false);
      setError(data?.error ?? "Could not save your business profile.");
      return;
    }
    try {
      await onSaved();
    } finally {
      setPending(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(event) => {
        if (pending) event.preventDefault();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !pending) onClose();
      }}
      className="m-auto max-h-[min(760px,calc(100dvh-32px))] w-[min(600px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl bg-canvas p-0 text-ink ring-1 ring-hairline backdrop:bg-black/70 backdrop:backdrop-blur-sm open:flex"
    >
      <header className="flex items-start justify-between gap-4 border-b border-hairline px-5 pt-5 pb-4 sm:px-6">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id={titleId} className="font-display text-[20px] leading-6 tracking-[-0.3px] text-ink">
            Complete your business profile
          </h2>
          <p className="text-sm leading-6 text-body">{intro}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          aria-label="Close"
          className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-surface-soft hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" aria-hidden />
        </button>
      </header>

      <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-5 sm:px-6">
          {FIELDS.map(({ field, label, placeholder, area, hint }) => {
            const gap = gapFor(field);
            const id = `${titleId}-${field}`;
            const props = {
              id,
              value: values[field],
              placeholder,
              required: true,
              "aria-invalid": gap ? true : undefined,
              "aria-describedby": `${id}-hint`,
              onChange: (event: { target: { value: string } }) => setValues((current) => ({ ...current, [field]: event.target.value })),
              className: cn(area ? AREA : FIELD, gap && "border-warn/60"),
            };
            return (
              <div key={field} className="flex flex-col gap-2">
                <label htmlFor={id} className="flex items-center gap-2 text-sm font-medium text-ink">
                  {label}
                  {gap ? <span className="rounded-full bg-warn/15 px-2 py-0.5 font-mono text-[11px] text-warn">Needed</span> : null}
                </label>
                {area ? <textarea {...props} /> : <input {...props} />}
                <p id={`${id}-hint`} className="text-xs leading-5 text-muted-foreground">
                  {gap?.hint ?? hint}
                </p>
              </div>
            );
          })}
        </div>

        <footer className="flex flex-col gap-3 border-t border-hairline px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          {error ? (
            <p role="alert" className="text-sm text-bad">
              {error}
            </p>
          ) : (
            <p className="text-xs leading-5 text-muted-foreground">Saved to the business context in Settings, where you can edit it any time.</p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="outline" className="h-11" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" className="h-11" disabled={pending} aria-busy={pending}>
              {pending ? <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden /> : null}
              {submitLabel}
            </Button>
          </div>
        </footer>
      </form>
    </dialog>
  );
}

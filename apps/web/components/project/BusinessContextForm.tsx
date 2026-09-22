"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { BusinessContext } from "@/lib/business-context";
import { Button } from "@/components/ui/button";

/**
 * Business context editor (Phase 0.6).
 *
 * Deep analysis needs this before it can say anything specific about the
 * business. Nothing here is required: leaving it empty keeps the project in
 * Quick mode, which must stay fully usable.
 */

const FIELD =
  "h-11 w-full rounded-md border border-hairline bg-canvas px-3 text-sm text-ink outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring";
const AREA =
  "min-h-24 w-full rounded-md border border-hairline bg-canvas p-3 text-sm leading-6 text-ink outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring";

export function BusinessContextForm({
  projectId,
  initial,
}: {
  projectId: string;
  initial: BusinessContext;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    businessName: initial.businessName ?? "",
    businessType: initial.businessType ?? "",
    industry: initial.industry ?? "",
    businessDescription: initial.businessDescription ?? "",
    targetAudience: initial.targetAudience ?? "",
    targetLocation: initial.targetLocation ?? "",
    primaryGoal: initial.primaryGoal ?? "",
    servicesProducts: initial.servicesProducts.join(", "),
    targetKeywords: initial.targetKeywords.join(", "),
  });
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  function field(key: keyof typeof form) {
    return {
      value: form[key],
      onChange: (event: { target: { value: string } }) =>
        setForm((current) => ({ ...current, [key]: event.target.value })),
    };
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");

    const response = await fetch(`/api/projects/${projectId}/context`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ business: form }),
    });

    setPending(false);
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      setMessage(data?.error ?? "Could not save.");
      return;
    }

    setMessage("Saved.");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Business name" hint="Used instead of the domain across the dashboard.">
          <input className={FIELD} placeholder="Acme Payments" {...field("businessName")} />
        </Field>
        <Field label="Business type" hint="SaaS, agency, clinic, online shop…">
          <input className={FIELD} placeholder="SaaS" {...field("businessType")} />
        </Field>
        <Field label="Industry">
          <input className={FIELD} placeholder="Financial technology" {...field("industry")} />
        </Field>
        <Field label="Target location" hint="Leave empty if you sell everywhere.">
          <input className={FIELD} placeholder="United Kingdom" {...field("targetLocation")} />
        </Field>
      </div>

      <Field label="What the business does" hint="Two or three sentences is plenty.">
        <textarea
          className={AREA}
          placeholder="We help online businesses accept payments and manage subscriptions."
          {...field("businessDescription")}
        />
      </Field>

      <Field label="Target audience">
        <textarea
          className={AREA}
          placeholder="Finance and engineering teams at mid-sized online retailers."
          {...field("targetAudience")}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Services or products" hint="Comma separated.">
          <input
            className={FIELD}
            placeholder="Payments, Billing, Invoicing"
            {...field("servicesProducts")}
          />
        </Field>
        <Field label="Target keywords" hint="Optional. Comma separated.">
          <input
            className={FIELD}
            placeholder="online payments, subscription billing"
            {...field("targetKeywords")}
          />
        </Field>
      </div>

      <Field label="Primary goal" hint="What a good visit should lead to.">
        <input
          className={FIELD}
          placeholder="Sign-ups for a free account"
          {...field("primaryGoal")}
        />
      </Field>

      <div className="flex items-center gap-4">
        <Button type="submit" className="h-11 w-fit" disabled={pending}>
          {pending ? "Saving…" : "Save context"}
        </Button>
        {message ? (
          <p role="status" className="text-sm text-body">
            {message}
          </p>
        ) : null}
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-medium text-ink">{label}</span>
      {children}
      {hint ? <span className="text-xs leading-5 text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

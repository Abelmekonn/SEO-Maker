"use client";

import { useId, useRef, type ReactNode } from "react";
import Link from "next/link";
import { Check, Lock, Sparkles, X } from "lucide-react";
import { pricingTiers } from "@/lib/pricing";
import { cn } from "@/lib/utils";

/**
 * Premium gating for Free accounts.
 *
 * Free finds what is wrong on the homepage. Everything that explains, compares
 * or goes past the homepage (AI, competitors, insights, the other pages) is
 * shown as locked rather than filled with sample data, so a Free user never
 * reads a number that is not about their site.
 */

const paidTiers = pricingTiers.filter((tier) => tier.name !== "Free");

/** Orange "Go premium" button that opens the pricing panel in a dialog. */
export function GoPremiumButton({
  label = "Go premium",
  className,
}: {
  label?: string;
  className?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className={cn(
          "inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-4 font-mono text-sm text-primary-foreground",
          "transition-colors hover:bg-primary-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
      >
        <Sparkles className="size-3.5" aria-hidden />
        {label}
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClick={(event) => {
          // A click on the backdrop lands on the dialog element itself.
          if (event.target === event.currentTarget) {
            event.currentTarget.close();
          }
        }}
        className="m-auto w-[min(760px,calc(100vw-32px))] rounded-2xl bg-canvas p-0 text-ink ring-1 ring-hairline backdrop:bg-black/70 backdrop:backdrop-blur-sm"
      >
        <div className="flex flex-col gap-6 p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-2">
              <p className="font-mono text-[12px] text-primary">Premium</p>
              <h2
                id={titleId}
                className="font-display text-[24px] leading-7 tracking-[-0.5px] text-ink"
              >
                See every problem, on every page
              </h2>
              <p className="max-w-lg text-sm leading-6 text-body">
                Free checks your homepage and names what is wrong. Premium crawls more of the
                site, shows the exact evidence and the fix for each problem, and unlocks
                competitors and AI.
              </p>
            </div>
            {/* Not a <form method="dialog">: this button can render inside another form. */}
            <button
                type="button"
                onClick={() => dialogRef.current?.close()}
                aria-label="Close"
                className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-surface-soft hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="size-4" aria-hidden />
              </button>
          </div>
          <PricingPanel />
        </div>
      </dialog>
    </>
  );
}

/** Pro and Agency side by side. Plans are page counts, not prices. */
export function PricingPanel() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {paidTiers.map((tier) => (
          <article
            key={tier.name}
            className={cn(
              "flex flex-col gap-4 rounded-xl p-5 ring-1",
              tier.featured ? "bg-surface-card ring-primary/40" : "bg-surface-soft ring-hairline",
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-display text-[18px] leading-6 text-ink">{tier.name}</h3>
              {tier.badge ? (
                <span className="rounded-full px-2 py-0.5 font-mono text-[11px] text-body ring-1 ring-hairline">
                  {tier.badge}
                </span>
              ) : null}
            </div>
            <div>
              <p className="font-display text-[28px] leading-none tracking-[-0.6px] text-ink">
                {tier.price}
              </p>
              <p className="mt-1 font-mono text-[12px] text-muted-foreground">{tier.cadence}</p>
            </div>
            <ul className="flex flex-1 flex-col gap-2">
              {tier.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm leading-5 text-body">
                  <Check className="mt-0.5 size-3.5 shrink-0 text-good" aria-hidden />
                  {feature}
                </li>
              ))}
            </ul>
            <Link
              href="/pricing"
              className={cn(
                "inline-flex h-11 items-center justify-center rounded-md px-4 font-mono text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                tier.featured
                  ? "bg-primary text-primary-foreground hover:bg-primary-active"
                  : "text-ink ring-1 ring-hairline hover:bg-surface-card",
              )}
            >
              Choose {tier.name}
            </Link>
          </article>
        ))}
      </div>
      <Link
        href="/pricing"
        className="self-start font-mono text-[12px] text-body underline underline-offset-4 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Compare all plans
      </Link>
    </div>
  );
}

/**
 * A card whose contents are premium. The preview underneath is decorative
 * (hidden from assistive tech and not focusable); the overlay carries the
 * real message and the upgrade button.
 */
export function LockedCard({
  title,
  icon,
  body,
  preview,
  className,
}: {
  title: string;
  icon?: ReactNode;
  body: string;
  preview?: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label={`${title} (premium)`}
      className={cn(
        "relative flex flex-col gap-4 overflow-hidden rounded-xl bg-surface-soft p-5 ring-1 ring-hairline",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-[18px] leading-6 tracking-[-0.3px] text-ink">
          {icon}
          {title}
        </h2>
        <span className="inline-flex items-center gap-1 rounded-full bg-surface-card px-2 py-0.5 font-mono text-[11px] text-body">
          <Lock className="size-3" aria-hidden />
          Premium
        </span>
      </div>

      {preview ? (
        <div
          aria-hidden
          inert
          className="pointer-events-none select-none opacity-40 blur-[3px]"
        >
          {preview}
        </div>
      ) : null}

      <div
        className={cn(
          "flex flex-col items-start gap-3",
          preview &&
            "absolute inset-x-0 bottom-0 bg-gradient-to-t from-surface-soft via-surface-soft/95 to-transparent px-5 pt-12 pb-5",
        )}
      >
        <p className="text-sm leading-6 text-body">{body}</p>
        <GoPremiumButton className="w-full" />
      </div>
    </section>
  );
}

/** Full-page gate for routes that are premium only. */
export function PremiumPage({
  title,
  body,
  unlocks,
  projectId,
}: {
  title: string;
  body: string;
  unlocks: string[];
  projectId: string;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <header className="flex flex-col gap-3">
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-surface-soft px-2.5 py-1 font-mono text-[12px] text-body ring-1 ring-hairline">
          <Lock className="size-3" aria-hidden />
          Premium feature
        </span>
        <h1 className="font-display text-[28px] leading-none tracking-[-0.5px] text-ink">
          {title}
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-body">{body}</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <section
          aria-label="What premium unlocks"
          className="flex flex-col gap-4 rounded-xl bg-surface-soft p-5 ring-1 ring-hairline"
        >
          <h2 className="font-display text-[18px] leading-6 tracking-[-0.3px] text-ink">
            What you get
          </h2>
          <ul className="flex flex-col gap-3">
            {unlocks.map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm leading-6 text-body">
                <Check className="mt-1 size-3.5 shrink-0 text-good" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-auto border-t border-hairline pt-4 text-sm leading-6 text-body">
            Your homepage audit stays free.{" "}
            <Link
              href={`/projects/${projectId}`}
              className="text-ink underline underline-offset-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Back to overview
            </Link>
          </p>
        </section>
        <PricingPanel />
      </div>
    </div>
  );
}

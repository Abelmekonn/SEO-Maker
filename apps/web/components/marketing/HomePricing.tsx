"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const tiers = [
  {
    name: "Pro",
    monthly: "10 pages",
    yearly: "10 pages",
    body: "Important pages, performance scope, and competitor entry.",
    featured: true,
    features: [
      "10-page crawl",
      "PageSpeed on selected pages",
      "Manual competitors",
      "AI title and meta drafts",
    ],
  },
  {
    name: "Agency",
    monthly: "100 pages",
    yearly: "100 pages",
    body: "Larger sites. Recurring audits come later.",
    featured: false,
    features: [
      "100-page crawl",
      "Batch performance",
      "Multiple projects",
      "Scheduled audits later",
    ],
  },
];

export function HomePricing() {
  const [cycle, setCycle] = useState<"monthly" | "yearly">("monthly");

  return (
    <section id="pricing" className="px-6 py-24">
      <div className="mx-auto max-w-7xl">
        <h2 className="text-center font-heading text-[32px] font-semibold tracking-[-1px] text-white md:text-[40px]">
          Plans by page count
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-center text-base leading-6 text-brand-silver">
          Free is the homepage. Checkout is not in this slice.
        </p>

        <div className="mx-auto mt-8 flex w-fit items-center rounded-full border border-white/10 bg-black/30 p-1">
          {(
            [
              ["monthly", "Monthly"],
              ["yearly", "Yearly"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setCycle(value)}
              className={cn(
                "rounded-full px-4 py-1.5 font-mono text-[13px] font-medium",
                cycle === value
                  ? "bg-brand-orange text-brand-charcoal"
                  : "text-brand-silver",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mx-auto mt-12 grid max-w-3xl gap-4 md:grid-cols-2">
          {tiers.map((tier) => (
            <article
              key={tier.name}
              className={cn(
                "flex flex-col rounded-xl border p-8",
                tier.featured
                  ? "border-brand-orange/40 bg-[#1a1514] shadow-[0_0_48px_rgba(255,109,41,0.12)]"
                  : "border-white/10 bg-[#1a1514]",
              )}
            >
              <h3 className="font-heading text-lg font-medium text-white">
                {tier.name}
              </h3>
              <p className="mt-4 font-heading text-[36px] font-semibold tracking-[-1px] text-white">
                {cycle === "monthly" ? tier.monthly : tier.yearly}
              </p>
              <p className="mt-1 font-mono text-[12px] text-white/40">
                {cycle === "yearly"
                  ? "Yearly billing later"
                  : "Per project, for now"}
              </p>
              <p className="mt-3 text-sm leading-6 text-brand-silver">
                {tier.body}
              </p>
              <ul className="mt-8 flex flex-1 flex-col gap-3">
                {tier.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-2 text-sm text-white/85"
                  >
                    <Check
                      className={cn(
                        "mt-0.5 size-4 shrink-0",
                        tier.featured ? "text-brand-orange" : "text-white",
                      )}
                      aria-hidden
                    />
                    {feature}
                  </li>
                ))}
              </ul>
              <Button
                asChild
                variant={tier.featured ? "default" : "outline"}
                className={
                  tier.featured
                    ? "mt-8"
                    : "mt-8 border-white/15 bg-white/5 text-white"
                }
              >
                <Link href="/dashboard">Start a project</Link>
              </Button>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

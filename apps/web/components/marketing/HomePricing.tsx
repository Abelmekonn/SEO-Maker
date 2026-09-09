import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pricingCompare, pricingTiers } from "@/lib/pricing";
import { cn } from "@/lib/utils";

function CellValue({ value }: { value: string | boolean }) {
  if (value === true) {
    return (
      <span
        className="inline-flex size-5 items-center justify-center rounded-full"
        aria-label="Included"
      >
        <Check className="size-3 text-white" strokeWidth={2.5} />
      </span>
    );
  }
  if (value === false) {
    return <span className="sr-only">Not included</span>;
  }
  return <span className="text-white">{value}</span>;
}

export function HomePricing() {
  return (
    <section id="pricing" className="px-6">
      <div className="mx-auto max-w-7xl">
        <p className="text-center font-mono text-[12px] tracking-[0.16em] text-brand-orange">
          Pricing
        </p>
        <h2 className="mt-4 text-center font-heading text-[32px] font-semibold tracking-[-1px] text-white md:text-[40px]">
          Plans by page count
        </h2>
        <div className="mt-14 flex flex-col gap-4 md:flex-row">
          {pricingTiers.map((tier) => (
            <article
              key={tier.name}
              className={cn(
                "relative flex flex-col rounded-2xl border bg-mkt-surface/80 p-8 backdrop-blur-sm",
                tier.featured
                  ? "border-brand-orange/40 shadow-[0_0_64px_rgba(255,109,41,0.14)]"
                  : "border-mkt-hairline",
              )}
            >
              <div className="flex items-center gap-3">
                <h3 className="font-heading text-lg font-medium text-white">
                  {tier.name}
                </h3>
                {tier.badge ? (
                  <span className="rounded-full border border-white/15 px-2.5 py-0.5 font-mono text-[11px] text-mkt-muted">
                    {tier.badge}
                  </span>
                ) : null}
              </div>
              <p className="mt-6 font-mono text-[12px] text-mkt-subtle">
                Included pages
              </p>
              <p className="font-heading text-[36px] font-semibold tracking-[-1px] text-white">
                {tier.price}
              </p>
              <p className="mt-1 font-mono text-[12px] text-mkt-subtle">
                {tier.cadence}
              </p>
              <p className="mt-4 text-sm leading-6 text-mkt-muted">{tier.body}</p>
              <ul className="mt-8 flex flex-1 flex-col gap-3">
                {tier.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-2 text-sm text-white/85"
                  >
                    <Check className="mt-0.5 size-4 shrink-0 text-white" aria-hidden />
                    {feature}
                  </li>
                ))}
              </ul>
              <Button asChild className="mt-8 h-11">
                <Link href="/dashboard">{tier.cta}</Link>
              </Button>
            </article>
          ))}
        </div>

        <div className="mt-24 overflow-x-auto">
          <table className="w-full min-w-[760px] table-fixed border-collapse text-sm">
            <colgroup>
              <col className="w-[34%]" />
              <col className="w-[22%]" />
              <col className="w-[22%]" />
              <col className="w-[22%]" />
            </colgroup>
            <thead>
              <tr>
                <th className="sticky left-0 z-10 border-b border-r border-mkt-hairline bg-mkt-canvas px-6 py-8 text-left align-bottom">
                  <p className="font-heading text-[20px] font-medium tracking-[-0.6px] text-white">
                    Compare plans
                  </p>
                  <p className="mt-2 text-base font-normal leading-6 text-brand-silver">
                    Find one that is right for the site.
                  </p>
                </th>
                {pricingTiers.map((tier) => (
                  <th
                    key={tier.name}
                    className="border-b border-mkt-hairline px-6 py-8 text-center align-bottom last:border-r-0 [&:not(:last-child)]:border-r"
                  >
                    <p className="font-heading text-[20px] font-medium tracking-[-0.6px] text-white">
                      {tier.name}
                    </p>
                    <Button asChild className="mt-2 h-11 rounded-full border-mkt-hairline">
                      <Link href="/dashboard">{tier.cta}</Link>
                    </Button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pricingCompare.map((row) => (
                <tr key={row.label}>
                  <th className="sticky left-0 z-10 border-b border-r border-mkt-hairline bg-mkt-canvas px-6 py-6 text-left font-medium text-mkt-muted">
                    {row.label}
                  </th>
                  {row.values.map((value, index) => (
                    <td
                      key={`${row.label}-${pricingTiers[index].name}`}
                      className="border-b border-mkt-hairline px-6 py-6 text-center last:border-r-0 [&:not(:last-child)]:border-r"
                    >
                      <div className="flex justify-center">
                        <CellValue value={value} />
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

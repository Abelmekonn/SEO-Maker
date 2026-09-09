import Link from "next/link";
import { Button } from "@/components/ui/button";

export function HomeCta() {
  return (
    <section className="px-6 pb-16">
      <div
        className="relative mx-auto max-w-7xl overflow-hidden rounded-2xl   bg-mkt-canvas bg-cover bg-center"
        style={{ backgroundImage: "url('/cta.jpg')" }}
      >
        <div className="relative z-10 flex flex-col items-center px-6 py-24 text-center md:px-16 md:py-32">
          <h2 className="max-w-2xl font-heading text-[32px] font-semibold tracking-[-1px] text-white md:text-[44px]">
            Start an audit that grows with the site
          </h2>
          <p className="mt-4 max-w-lg text-sm leading-6 text-mkt-muted md:text-base">
            Crawl the pages you choose. Score on-page SEO. Keep the next change
            in one project.
          </p>
          <Button asChild className="mt-8">
            <Link href="/dashboard">Get started</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

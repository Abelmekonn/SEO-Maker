import Link from "next/link";
import Image from "next/image";
import { EmailCta } from "@/components/marketing/EmailCta";

export function HomeHero() {
  return (
    // don't add the pb-20 class here because it will overlap with the image
    <section className="relative h-[85vh] flex flex-col justify-end overflow-hidden px-6 pt-16">
      <Image
        src="/moon.png"
        alt=""
        fill
        priority
        sizes="100vw"
        className="pointer-events-none object-cover object-bottom opacity-70"
      />
      <div className="relative z-10 mb-10 mx-auto flex max-w-[720px] flex-col items-center justify-end text-center">
        <h1 className="mt-6 font-heading text-[40px] font-medium leading-[1.05] tracking-[-2px] text-white md:text-[64px] lg:text-[72px]">
          Audits that grow with the site
        </h1>
        <p className="mt-5 max-w-xl text-base leading-6 text-brand-silver md:text-lg">
          Crawl pages, score on-page SEO, and compare competitors in one
          project. Start with a URL. Expand when you need it.
        </p>
        <div className="mt-8 flex w-full flex-col items-center gap-4">
          <EmailCta id="hero-email" />
        </div>
      </div>
    </section>
  );
}

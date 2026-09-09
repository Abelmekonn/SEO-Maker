import Link from "next/link";
import { PagesMock } from "@/components/marketing/feature-mocks";

const steps = [
  {
    title: "Start with a URL",
    body: "Homepage first. Add important pages when the first pass is useful.",
    note: "One project. One crawl scope.",
    href: "/projects/new",
    link: "Start a project",
  },
  {
    title: "Read the table",
    body: "Title, meta, H1, and word count — status on every row.",
    note: "Missing and long fields are marked.",
  },
  {
    title: "Scope PageSpeed",
    body: "Run LCP (main content paint), CLS (layout shift), and INP (input delay) only on the pages you choose.",
    note: "Not every URL, unless you ask.",
  },
  {
    title: "Compare a competitor",
    body: "Enter a domain. See pages they have that you do not.",
    note: "Manual entry first. Search-result discovery later.",
  },
  {
    title: "Ship the fix",
    body: "Copy the title or meta draft. Change the page. Re-audit later.",
    note: "The table is the source of truth.",
  },
];

export function HomeProcess() {
  return (
    <section id="process" className="mx-auto max-w-7xl">
      <p className="w-full text-center font-mono text-[12px] tracking-[0.16em] text-brand-orange">
        How it works
      </p>
      <div className="grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="relative order-2 hidden min-h-[70vh] lg:order-1 lg:block lg:h-auto">
          <div className="h-full lg:sticky lg:top-16 lg:h-[calc(100vh-4rem)]">
            <div className="flex h-full items-center justify-center p-6">
              <div className="h-[min(58vh,460px)] w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-mkt-canvas shadow-[0_24px_80px_rgba(0,0,0,0.55),0_0_80px_rgba(255,109,41,0.10)] ring-1 ring-white/5">
                <PagesMock />
              </div>
            </div>
          </div>
        </div>

        <div className="order-1 flex flex-col px-6 py-16 md:px-12 lg:order-2 lg:px-14 lg:py-20">
          <h2 className="mt-5 max-w-md font-heading text-[32px] font-semibold tracking-[-1px] text-white md:text-[40px]">
            A URL in. A table out. A fix you can ship.
          </h2>
          <p className="mt-4 max-w-md text-base leading-7 text-mkt-muted">
            Crawl the pages you choose. Score on-page SEO. Keep the next change
            in one project.
          </p>

          <ol className="mt-10">
            {steps.map((step, index) => (
              <li
                key={step.title}
                className="grid grid-cols-[auto_1fr] gap-5 border-t border-mkt-hairline py-10"
              >
                <span className="font-heading text-xl font-medium text-mkt-subtle">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 className="font-heading text-[20px] font-medium tracking-[-0.4px] text-white">
                    {step.title}
                  </h3>
                  <p className="mt-2 max-w-sm text-sm leading-6 text-mkt-muted">
                    {step.body}
                  </p>
                  <p className="mt-2 font-mono text-[12px] text-mkt-subtle">
                    {step.note}
                  </p>
                  {step.href ? (
                    <Link
                      href={step.href}
                      className="mt-3 inline-block min-h-11 py-2 text-sm text-white underline underline-offset-4 hover:text-brand-silver focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none"
                    >
                      {step.link}
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

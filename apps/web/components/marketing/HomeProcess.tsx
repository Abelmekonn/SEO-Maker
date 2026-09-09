import Image from "next/image";
import Link from "next/link";

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
    body: "Run LCP, CLS, and INP only on the pages you choose.",
    note: "Not every URL, unless you ask.",
  },
  {
    title: "Compare a competitor",
    body: "Enter a domain. See pages they have that you do not.",
    note: "Manual entry first. SERP later.",
  },
  {
    title: "Ship the fix",
    body: "Copy the title or meta draft. Change the page. Re-audit later.",
    note: "The table is the source of truth.",
  },
];

export function HomeProcess() {
  return (
    <section id="process" className=" border-mkt-hairline mx-auto max-w-7xl -mt-14">
      <p className="  items-center gap-2 font-mono text-[26px] tracking-[0.16em] text-white w-full text-center">
        HOW IT WORKS
      </p>
      <div className="grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="relative order-2 h-[70vh] lg:order-1 lg:h-auto">
          <div className="h-full lg:sticky lg:top-16 lg:h-[calc(100vh-4rem)]">
            <div className="flex h-full min-h-[70vh] items-center justify-center p-6 lg:min-h-0">
              <Image
                src="/cc.png"
                alt="SEO Maker dashboard"
                width={412}
                height={260}
                quality={100}
                unoptimized
                className="h-auto w-auto max-h-full max-w-full object-contain"
              />
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
                <span className="font-heading text-xl font-medium text-white/25">
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
                      className="mt-3 inline-block text-sm text-white underline underline-offset-4"
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

const faqs = [
  {
    q: "What can I do today?",
    a: "Open the dashboard and walk through a project. Sign-in, the database, and the crawler are not connected yet.",
  },
  {
    q: "How do I start a project?",
    a: "Enter a URL. The first pass is the homepage. You add more pages when that pass is useful.",
  },
  {
    q: "What does the page table show?",
    a: "Title, meta description, H1, and word count on every row, with approved or review status.",
  },
  {
    q: "Will every page get a PageSpeed run?",
    a: "No. You choose homepage, important pages, or all pages. That keeps API cost under control.",
  },
  {
    q: "Which Core Web Vitals do you store?",
    a: "Largest Contentful Paint (LCP), Cumulative Layout Shift (CLS), and Interaction to Next Paint (INP) per page, plus a short note on the raw PageSpeed output.",
  },
  {
    q: "Do you publish title and meta changes for me?",
    a: "No. AI drafts a title and meta you can copy. Suggestions can be wrong, so edit before you publish. You ship the change on the site, then re-audit. Audits work without drafts.",
  },
  {
    q: "When do competitors appear?",
    a: "Manual domain entry first. Automatic discovery from search results is a later, paid step.",
  },
  {
    q: "What do the plans limit?",
    a: "Page count. Free is the homepage. Pro is 10 pages. Agency is 100.",
  },
  {
    q: "Can I run more than one site?",
    a: "Agency is built for multiple projects. Free and Pro are one project for now.",
  },
  {
    q: "Is checkout live?",
    a: "Not yet. The plans show page-count limits. Billing comes later.",
  },
];

export function HomeFaq() {
  return (
    <section id="faq" className="px-6">
      <div className="mx-auto mb-10 grid max-w-7xl gap-10 text-center">
        <h2 className="font-heading text-[32px] font-semibold tracking-[-1px] text-white md:text-[40px]">
          Frequently asked questions
        </h2>
        <div className="mx-auto grid w-full max-w-5xl gap-4">
          {faqs.map((item) => (
            <details
              key={item.q}
              className="group border-b border-white/10 py-1"
            >
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 py-5 text-left text-base font-medium text-white focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
                {item.q}
                <span
                  aria-hidden
                  className="text-brand-silver transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="pb-5 text-left text-base leading-6 text-brand-silver">
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

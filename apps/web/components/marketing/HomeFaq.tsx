const faqs = [
  {
    q: "What can I do in this slice?",
    a: "Click through the empty dashboard. Auth, the database, and the crawler are not wired yet.",
  },
  {
    q: "Will every page get a PageSpeed run?",
    a: "No. You choose homepage, important pages, or all pages. That keeps API cost under control.",
  },
  {
    q: "When do competitors appear?",
    a: "Manual domain entry first. SERP auto-discovery is a later, paid step.",
  },
  {
    q: "What do the plans limit?",
    a: "Page count. Free is the homepage. Pro is 10 pages. Agency is 100.",
  },
];

export function HomeFaq() {
  return (
    <section id="faq" className="px-6 py-24">
      <div className="mx-auto grid max-w-5xl gap-10 md:grid-cols-[1fr_1.2fr]">
        <h2 className="font-heading text-[32px] font-semibold tracking-[-1px] text-white md:text-[40px]">
          Frequently asked questions
        </h2>
        <div>
          {faqs.map((item) => (
            <details
              key={item.q}
              className="group border-b border-white/10 py-1"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-left text-base font-medium text-white [&::-webkit-details-marker]:hidden">
                {item.q}
                <span
                  aria-hidden
                  className="text-brand-silver transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="pb-5 text-sm leading-6 text-brand-silver">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

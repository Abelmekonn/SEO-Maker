const items = [
  {
    name: "crawl",
    mark: (
      <svg viewBox="0 0 20 20" className="size-5" aria-hidden>
        <circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M13.5 13.5 18 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    name: "pagespeed",
    mark: (
      <svg viewBox="0 0 20 20" className="size-5" aria-hidden>
        <path
          d="M4 14a8 8 0 1 1 12 0"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path d="M10 12 13 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="10" cy="12" r="1.2" fill="currentColor" />
      </svg>
    ),
  },
  {
    name: "claude",
    mark: (
      <svg viewBox="0 0 20 20" className="size-5" aria-hidden>
        <path
          d="M10 2.5 11.6 8.2 17.5 8.5 13 12.2 14.6 18 10 14.8 5.4 18 7 12.2 2.5 8.5 8.4 8.2Z"
          fill="currentColor"
        />
      </svg>
    ),
  },
  {
    name: "vitals",
    mark: (
      <svg viewBox="0 0 20 20" className="size-5" aria-hidden>
        <path
          d="M2 10h4l2-5 4 10 2-5h4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    name: "sitemap",
    mark: (
      <svg viewBox="0 0 20 20" className="size-5" aria-hidden>
        <circle cx="10" cy="4.5" r="2" fill="currentColor" />
        <circle cx="4.5" cy="15.5" r="2" fill="currentColor" />
        <circle cx="15.5" cy="15.5" r="2" fill="currentColor" />
        <path
          d="M10 6.5v3H4.5v4M10 9.5h5.5v4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
        />
      </svg>
    ),
  },
  {
    name: "schema",
    mark: (
      <svg viewBox="0 0 20 20" className="size-5" aria-hidden>
        <path
          d="M8 3.5 4.5 10 8 16.5M12 3.5 15.5 10 12 16.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
];

export function HomeProof() {
  return (
    <section className="px-6 py-10">
      <div className="mx-auto max-w-5xl text-center">
        <p className="text-2xl font-medium text-brand-silver">Built for the work after the crawl</p>
        <ul className="mt-10 flex flex-wrap items-center justify-center gap-x-10 gap-y-6 sm:justify-between">
          {items.map((item) => (
            <li
              key={item.name}
              className="flex items-center gap-2 text-brand-silver"
            >
              {item.mark}
              <span className="font-heading text-[18px] font-medium tracking-[-0.02em]">
                {item.name}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

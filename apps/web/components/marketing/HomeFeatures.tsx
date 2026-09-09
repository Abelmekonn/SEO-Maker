import {
  CreditCard,
  Gauge,
  Link2,
  Search,
  Smartphone,
  Sparkles,
} from "lucide-react";

const extras = [
  {
    icon: Search,
    title: "Start with a URL",
    body: "Homepage first. Expand to important pages or the full site.",
  },
  {
    icon: Gauge,
    title: "Scoped performance",
    body: "Do not run PageSpeed on every page by default.",
  },
  {
    icon: Smartphone,
    title: "Mobile-ready checks",
    body: "Titles, meta, and H1s that hold up on a phone viewport.",
  },
  {
    icon: Sparkles,
    title: "Readable diagnostics",
    body: "Raw PageSpeed output, explained for a site owner.",
  },
  {
    icon: CreditCard,
    title: "Page-count plans",
    body: "Free is the homepage. Pro is 10. Agency is 100.",
  },
  {
    icon: Link2,
    title: "One project hub",
    body: "Overview, pages, performance, and competitors together.",
  },
];

function GatewayMock() {
  const tiles = ["PS", "CW", "AI", "XML", "H1", "OG", "JSON", "LCP"];
  return (
    <div className="relative grid h-48 grid-cols-4 gap-2 bg-brand-charcoal p-5">
      {tiles.map((tile) => (
        <div
          key={tile}
          className="flex items-center justify-center rounded-lg border border-white/8 bg-white/4 font-mono text-[11px] text-white/35"
        >
          {tile}
        </div>
      ))}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="flex size-12 items-center justify-center rounded-lg bg-brand-orange font-heading text-lg font-semibold text-brand-charcoal shadow-[0_0_32px_rgba(255,109,41,0.45)]">
          S
        </span>
      </div>
    </div>
  );
}

function ScheduleMock() {
  const nodes = [
    { x: 18, y: 22, label: "A" },
    { x: 78, y: 20, label: "B" },
    { x: 20, y: 72, label: "C" },
    { x: 80, y: 74, label: "D" },
  ];
  return (
    <div className="relative h-48 overflow-hidden bg-brand-charcoal">
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full" aria-hidden>
        {nodes.map((node) => (
          <line
            key={node.label}
            x1="50"
            y1="50"
            x2={node.x}
            y2={node.y}
            stroke="rgba(255,109,41,0.35)"
            strokeWidth="0.6"
          />
        ))}
      </svg>
      {nodes.map((node) => (
        <span
          key={node.label}
          className="absolute flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-[#1a1514] font-mono text-[11px] text-white/70"
          style={{ top: `${node.y}%`, left: `${node.x}%` }}
        >
          {node.label}
        </span>
      ))}
      <span className="absolute left-1/2 top-1/2 flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-brand-orange text-brand-charcoal">
        <Search className="size-5" aria-hidden />
      </span>
    </div>
  );
}

function PagesMock() {
  const rows = [
    { path: "/", title: "Home title set", status: "Approved" },
    { path: "/pricing", title: "Meta too long", status: "Review" },
    { path: "/blog", title: "Missing H1", status: "Review" },
  ];
  return (
    <div className="flex h-48 flex-col justify-center gap-2 bg-brand-charcoal px-4">
      {rows.map((row) => (
        <div
          key={row.path}
          className="flex items-center justify-between rounded-lg border border-white/8 bg-white/4 px-3 py-2"
        >
          <div className="min-w-0">
            <p className="truncate font-mono text-[11px] text-white/45">
              {row.path}
            </p>
            <p className="truncate text-sm text-white">{row.title}</p>
          </div>
          <span
            className={
              row.status === "Approved"
                ? "rounded-full bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] text-emerald-400"
                : "rounded-full bg-white/8 px-2 py-0.5 font-mono text-[10px] text-brand-silver"
            }
          >
            {row.status}
          </span>
        </div>
      ))}
    </div>
  );
}

function ChartMock() {
  const bars = [40, 72, 54, 88, 46, 64, 78];
  return (
    <div className="relative flex h-48 items-end justify-center gap-3 bg-brand-charcoal px-8 pb-6 pt-10">
      {bars.map((height, index) => (
        <div
          key={height}
          className="relative w-7 rounded-t-sm"
          style={{ height: `${height}%` }}
        >
          <div
            className={
              index === 3
                ? "absolute inset-0 rounded-t-sm bg-brand-orange"
                : "absolute inset-0 rounded-t-sm bg-white/12"
            }
          />
          {index === 3 ? (
            <span className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-[#1a1514] px-2 py-1 font-mono text-[10px] text-white shadow-[0_0_20px_rgba(255,109,41,0.25)]">
              LCP 2.1s
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

const bento = [
  {
    title: "Page audits in one table",
    body: "Title, meta, H1, and word count — status on every row.",
    visual: <GatewayMock />,
  },
  {
    title: "Automated crawl scope",
    body: "Homepage first. Add important pages when you are ready.",
    visual: <ScheduleMock />,
  },
  {
    title: "Fixes without the noise",
    body: "Copy the suggestion. Ship the change. Re-audit later.",
    visual: <PagesMock />,
  },
  {
    title: "Core Web Vitals stored",
    body: "LCP, CLS, and INP per page. You choose the PageSpeed scope.",
    visual: <ChartMock />,
  },
];

export function HomeFeatures() {
  return (
    <>
      <section id="features" className="px-6 py-24">
        <div className="mx-auto max-w-7xl text-center">
          <h2 className="font-heading text-[32px] font-semibold tracking-[-1px] text-white md:text-[40px]">
            Audits for the modern site
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-6 text-brand-silver">
            Four modules. One project. Orange is for actions — not decoration
            on the data.
          </p>
          <div className="mt-12 grid gap-4 md:grid-cols-2">
            {bento.map((card) => (
              <article
                key={card.title}
                className="overflow-hidden rounded-xl border border-white/10 bg-[#1a1514] text-left"
              >
                {card.visual}
                <div className="p-6">
                  <h3 className="font-heading text-[22px] font-medium tracking-[-0.4px] text-white">
                    {card.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-brand-silver">
                    {card.body}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="how" className="px-6 pb-24">
        <div className="mx-auto max-w-7xl">
          <h2 className="text-center font-heading text-[32px] font-semibold tracking-[-1px] text-white md:text-[40px]">
            Built for the next crawl
          </h2>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {extras.map((item) => {
              const Icon = item.icon;
              return (
                <article
                  key={item.title}
                  className="rounded-xl border border-white/10 bg-[#1a1514] p-6"
                >
                  <div className="flex size-10 items-center justify-center rounded-lg bg-brand-orange/15 text-brand-orange">
                    <Icon className="size-5" aria-hidden />
                  </div>
                  <h3 className="mt-5 font-heading text-base font-medium text-white">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-brand-silver">
                    {item.body}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
}

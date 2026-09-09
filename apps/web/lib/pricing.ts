export const pricingTiers = [
  {
    name: "Free",
    price: "Homepage",
    cadence: "Per project, for now",
    body: "Explore the product on one homepage audit.",
    featured: false,
    badge: null,
    cta: "Get started",
    features: ["Homepage crawl", "On-page checklist", "Dashboard access"],
  },
  {
    name: "Pro",
    price: "10 pages",
    cadence: "Per project, for now",
    body: "Run important pages with performance and competitor entry.",
    featured: true,
    badge: "Popular",
    cta: "Start a project",
    features: [
      "10-page crawl",
      "PageSpeed on selected pages",
      "Manual competitors",
      "AI title and meta drafts",
    ],
  },
  {
    name: "Agency",
    price: "100 pages",
    cadence: "Per project, for now",
    body: "Larger sites, more projects, and scheduled audits later.",
    featured: false,
    badge: null,
    cta: "Start a project",
    features: [
      "100-page crawl",
      "Batch performance",
      "Multiple projects",
      "Scheduled audits later",
    ],
  },
] as const;

export const pricingCompare = [
  {
    label: "Pages included",
    values: ["Homepage", "10 pages", "100 pages"] as const,
  },
  {
    label: "PageSpeed",
    values: [false, "Selected pages", "Batch"] as const,
  },
  {
    label: "Manual competitors",
    values: [false, true, true] as const,
  },
  {
    label: "AI title and meta drafts",
    values: [false, true, true] as const,
  },
  {
    label: "Multiple projects",
    values: [false, false, true] as const,
  },
  {
    label: "Scheduled audits",
    values: [false, false, "Later"] as const,
  },
  {
    label: "Dashboard access",
    values: [true, true, true] as const,
  },
] as const;

export const pricingTiers = [
  {
    name: "Free",
    price: "Homepage",
    body: "One homepage audit.",
    featured: false,
    features: ["Homepage crawl", "On-page checklist", "Dashboard access"],
  },
  {
    name: "Pro",
    price: "10 pages",
    body: "Important pages plus competitor entry.",
    featured: true,
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
    body: "Larger sites and recurring audits later.",
    featured: false,
    features: [
      "100-page crawl",
      "Batch performance",
      "Multiple projects",
      "Scheduled audits later",
    ],
  },
] as const;

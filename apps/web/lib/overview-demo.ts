import type { PageHealth } from "@/lib/page-audit";

export const overviewDemo = {
  lastCrawled: "2 hours ago",
  pagesAnalyzed: 100,
  dateRange: "Nov 11, 2026 to Nov 18, 2026",
  scores: {
    overall: { value: 78, delta: 12, spark: [62, 64, 61, 67, 70, 68, 73, 71, 76, 75, 78] },
    technical: { value: 91, delta: 8, spark: [78, 80, 77, 83, 81, 86, 84, 88, 86, 90, 91] },
    onPage: { value: 74, delta: 14, spark: [52, 56, 54, 60, 58, 64, 61, 68, 66, 72, 74] },
    performance: { value: 83, delta: 11, spark: [64, 68, 65, 71, 69, 74, 72, 78, 76, 81, 83] },
  },
  trend: {
    labels: ["Nov 11", "Nov 12", "Nov 13", "Nov 14", "Nov 15", "Nov 16", "Nov 17", "Nov 18"],
    seo: [42, 52, 56, 62, 62, 70, 80, 88],
    performance: [30, 38, 40, 44, 46, 56, 66, 74],
    technical: [18, 28, 32, 34, 36, 46, 56, 62],
  },
  health: {
    total: 100,
    healthy: 72,
    issues: 18,
    warnings: 7,
    critical: 3,
  },
  recommendation:
    "Your homepage has a weak meta description and is missing FAQ schema. This is a high-impact opportunity to improve visibility and click-through rate.",
  quickActions: [
    "Generate missing meta descriptions",
    "Create internal linking suggestions",
    "Optimize images for performance",
    "Find competitor content gaps",
  ],
  competitors: [
    { domain: "matkaresult.net", extraPages: 12, delta: 23 },
    { domain: "sattamatkatoday.com", extraPages: 9, delta: 18 },
    { domain: "kalyanmatka.in", extraPages: 7, delta: 12 },
    { domain: "rajshreematka.com", extraPages: 5, delta: 8 },
  ],
  insights: [
    {
      title: "You are missing 12 service pages",
      detail: "Competitors have more service-specific pages.",
      tone: "bad" as const,
      href: "competitors",
    },
    {
      title: "PageSpeed is slow on mobile",
      detail: "LCP is 3.4s on mobile (needs improvement).",
      tone: "warn" as const,
      href: "performance",
    },
    {
      title: "Add FAQ schema",
      detail: "Competitors have FAQ schema on 8 or more pages.",
      tone: "good" as const,
      href: "pages",
    },
  ],
  actions: [
    { title: "Optimize homepage meta", hint: "Improve CTR and rankings", href: "pages" },
    { title: "Add a service page", hint: "Cover commercial intent", href: "pages" },
    { title: "Add FAQ schema", hint: "Generate structured results", href: "pages" },
    { title: "Improve internal linking", hint: "Connect your top pages", href: "pages" },
  ],
  table: {
    counts: { all: 100, issues: 18, warnings: 7, optimized: 72 },
    rows: [
      { path: "/", title: "Home | Kalyan5g", score: 92, health: "optimized" as PageHealth, perf: 96, issues: 0 },
      { path: "/final-ank", title: "Final Ank | Kalyan5g", score: 76, health: "issues" as PageHealth, perf: 82, issues: 3 },
      { path: "/jodi-familychart", title: "Family Jodi Chart", score: 68, health: "warnings" as PageHealth, perf: 71, issues: 5 },
      { path: "/jodi-chart", title: "Jodi Chart | Kalyan5g", score: 72, health: "issues" as PageHealth, perf: 68, issues: 2 },
      { path: "/jodi-count-chart", title: "Jodi Count Chart", score: 85, health: "optimized" as PageHealth, perf: 88, issues: 1 },
      { path: "/jodi-difference-chart", title: "Jodi Difference Chart", score: 67, health: "critical" as PageHealth, perf: 62, issues: 6 },
      { path: "/jodi-even-odd", title: "Even Odd Chart", score: 80, health: "warnings" as PageHealth, perf: 77, issues: 3 },
      { path: "/jodi-total-chart", title: "Jodi Total Chart", score: 87, health: "optimized" as PageHealth, perf: 91, issues: 0 },
    ],
  },
};

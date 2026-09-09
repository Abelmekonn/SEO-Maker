# SEO Maker — Project Spec & Structure (v2)

A build brief for scaffolding the project in Cursor / Claude Code. Paste this whole file as context when starting the project, or hand each section to Claude Code as you build that part.

---

## 1. Tech Stack

- **Framework:** Next.js 15 (App Router) + TypeScript
- **Styling:** Tailwind CSS + shadcn/ui (copied-in components, not a black-box library)
- **Auth:** Clerk
- **Database:** Postgres (Supabase or Neon) via Prisma ORM
- **Queue:** BullMQ + Redis (Upstash)
- **Crawler:** Crawlee (built on Playwright, handles JS-rendered sites)
- **AI:** Claude API (Sonnet for SEO generation)
- **Performance data:** Google PageSpeed Insights API v5
- **Competitor discovery (Phase 5, later):** SERP API (e.g. SerpApi, DataForSEO SERP)
- **Charts:** Recharts or Tremor
- **Icons:** Lucide
- **Animation:** Framer Motion
- **Fonts:** JetBrains Mono (labels/headers) + Inter (body)
- **Worker hosting:** Railway or Fly.io (long-running jobs — NOT Vercel serverless functions)

---

## 2. Product Modules

```text
SEO Maker
│
├── Overview          — overall score, technical/on-page/performance/content summary, top issues
├── Pages              — all pages, per-page audit, AI SEO suggestions, PageSpeed
├── Performance        — mobile/desktop scores, Core Web Vitals, opportunities, diagnostics
├── Competitors        — manual entry (v1), on-page + content comparison, opportunities
│                         (auto-discovery + keyword gap = later, premium)
└── Settings
```

---

## 3. Folder Structure

```
seo-maker/
├── apps/
│   ├── web/
│   │   ├── app/
│   │   │   ├── (marketing)/
│   │   │   │   ├── page.tsx
│   │   │   │   └── pricing/page.tsx
│   │   │   ├── (dashboard)/
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── dashboard/page.tsx
│   │   │   │   └── projects/
│   │   │   │       ├── new/page.tsx
│   │   │   │       └── [id]/
│   │   │   │           ├── page.tsx                  # Overview
│   │   │   │           ├── pages/page.tsx
│   │   │   │           ├── pages/[pageId]/page.tsx
│   │   │   │           ├── performance/page.tsx
│   │   │   │           └── competitors/page.tsx
│   │   │   └── api/
│   │   │       ├── projects/route.ts
│   │   │       ├── projects/[id]/route.ts
│   │   │       ├── pages/[id]/route.ts
│   │   │       ├── performance/[id]/route.ts
│   │   │       ├── competitors/route.ts
│   │   │       ├── competitors/[id]/route.ts
│   │   │       └── webhooks/clerk/route.ts
│   │   ├── components/
│   │   │   ├── ui/                            # shadcn primitives
│   │   │   ├── layout/
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   ├── TopBar.tsx
│   │   │   │   └── StatusBadge.tsx
│   │   │   ├── project/
│   │   │   │   ├── UrlIntakeForm.tsx
│   │   │   │   ├── CrawlProgress.tsx
│   │   │   │   ├── PageAuditTable.tsx
│   │   │   │   ├── PageAuditRow.tsx
│   │   │   │   └── SeoSuggestionCard.tsx
│   │   │   ├── performance/
│   │   │   │   ├── PageSpeedScoreGauge.tsx
│   │   │   │   ├── CoreWebVitalsPanel.tsx
│   │   │   │   └── OpportunityList.tsx
│   │   │   ├── competitors/
│   │   │   │   ├── CompetitorEntryForm.tsx
│   │   │   │   ├── CompetitorCompareTable.tsx
│   │   │   │   └── OpportunityGapList.tsx
│   │   │   └── charts/
│   │   │       ├── ScoreRadialChart.tsx
│   │   │       └── CoreWebVitalsChart.tsx
│   │   ├── lib/
│   │   │   ├── prisma.ts
│   │   │   ├── queue.ts
│   │   │   ├── claude.ts
│   │   │   └── pagespeed.ts
│   │   └── styles/globals.css
│   │
│   └── worker/
│       ├── src/
│       │   ├── index.ts
│       │   ├── jobs/
│       │   │   ├── crawl-site.ts
│       │   │   ├── analyze-page.ts
│       │   │   ├── performance/
│       │   │   │   ├── analyze-pagespeed.ts
│       │   │   │   └── analyze-performance-batch.ts
│       │   │   └── competitors/
│       │   │       ├── discover-competitors.ts   # Phase 5
│       │   │       ├── crawl-competitor.ts
│       │   │       └── analyze-competitor.ts
│       │   └── lib/
│       │       ├── crawler.ts
│       │       ├── pagespeed.ts
│       │       ├── serp.ts                        # Phase 5
│       │       ├── claude.ts
│       │       └── prompts.ts
│       └── package.json
│
├── packages/
│   └── db/
│       └── prisma/schema.prisma
│
├── package.json
└── turbo.json
```

---

## 4. Prisma Schema (core)

```prisma
model Project {
  id          String   @id @default(cuid())
  userId      String
  rootUrl     String
  createdAt   DateTime @default(now())
  pages       Page[]
  competitors Competitor[]
}

model Page {
  id            String   @id @default(cuid())
  projectId     String
  project       Project  @relation(fields: [projectId], references: [id])
  url           String
  pageType      String?
  title         String?
  metaDesc      String?
  h1            String?
  wordCount     Int?
  seoSuggestion Json?
  status        String   @default("pending")
  createdAt     DateTime @default(now())
  performance   PerformanceAudit[]
}

model PerformanceAudit {
  id            String   @id @default(cuid())
  pageId        String
  page          Page     @relation(fields: [pageId], references: [id], onDelete: Cascade)
  strategy      String   // mobile | desktop
  performance   Float?
  accessibility Float?
  bestPractices Float?
  seo           Float?
  fcp           Float?
  lcp           Float?
  cls           Float?
  tbt           Float?
  inp           Float?
  rawData       Json?
  opportunities Json?
  diagnostics   Json?
  createdAt     DateTime @default(now())

  @@index([pageId])
}

model Competitor {
  id          String   @id @default(cuid())
  projectId   String
  project     Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  domain      String
  name        String?
  source      String   // manual | discovered
  relevance   Float?
  pageCount   Int      @default(0)
  seoScore    Float?
  performance Float?
  status      String   // pending | crawling | analyzed | failed
  metadata    Json?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  pages       CompetitorPage[]

  @@unique([projectId, domain])
  @@index([projectId])
}

model CompetitorPage {
  id              String     @id @default(cuid())
  competitorId    String
  competitor      Competitor @relation(fields: [competitorId], references: [id], onDelete: Cascade)
  url             String
  title           String?
  metaDescription String?
  h1              String?
  wordCount       Int?
  internalLinks   Int?
  imageCount      Int?
  schema          Json?
  seoScore        Float?
  rawData         Json?
  createdAt       DateTime @default(now())

  @@index([competitorId])
}
```

---

## 5. Design Tokens (Tailwind config additions)

```js
// tailwind.config.ts — extend theme
colors: {
  background: '#0a0e1a',
  surface: '#12172b',
  'surface-hover': '#1a2138',
  primary: '#7c3aed',
  'primary-glow': '#a855f7',
  accent: '#22d3ee',
  'accent-glow': '#67e8f9',
  border: '#2a3352',
  muted: '#8b93b0',
  // status colors — used sparingly, not decoratively
  good: '#22c55e',
  warn: '#eab308',
  bad: '#ef4444',
},
fontFamily: {
  mono: ['JetBrains Mono', 'monospace'],   // labels, badges, status text ONLY
  sans: ['Inter', 'sans-serif'],           // all data, tables, body copy
},
```

**Design references to actually use (in this order):**
1. **Structure first** — GitHub Primer, IBM Carbon (via `klaufel/awesome-design-systems`) for how to lay out dense data: table row height, badge/status patterns, empty states, pagination. These are built by teams who solved "200 rows of data, still readable" — don't reinvent this.
2. **Skin second** — Awwwards / SiteInspire / Dribbble (via `gztchan/awesome-design`) for the purple/cyan/mono HUD treatment, applied *on top of* the Primer/Carbon structure.
3. **Reality-check** — Mobbin, for real shipped dark-mode SaaS dashboards, to confirm a pattern survives contact with actual data before you build it.

**Hard rule to avoid the "cool in a screenshot, unusable with real data" trap:** neon/glow effects are reserved for headers, CTAs, and status badges only. Data tables, numbers, and body text stay high-contrast and calm — white/light-gray text on the dark surface, no glow, no gradient text.

---

## 6. Core UI Components to Build (in order)

1. **StatusBadge** — mono font, color-coded pill (pending/gray, crawling/cyan pulse, analyzed/green, failed/red)
2. **UrlIntakeForm** — single input, glowing CTA
3. **CrawlProgress** — animated scanning state (Framer Motion), live page count
4. **PageAuditTable** — dense shadcn `Table`, sortable, StatusBadge per row
5. **SeoSuggestionCard** — AI output (title/meta/schema), copy-per-field
6. **PageSpeedScoreGauge** — radial 0–100, red→yellow→green
7. **CoreWebVitalsPanel** — LCP/CLS/INP with good/needs-improvement/poor labels
8. **OpportunityList** — expandable rows: issue → potential savings → affected page → fix steps → impact
9. **CompetitorEntryForm** — manual domain entry (v1); auto-discovery UI added Phase 5
10. **CompetitorCompareTable** — you vs. competitor(s), page counts + on-page SEO diff
11. **OpportunityGapList** — competitor pages you don't have an equivalent for
12. **Sidebar** — project switcher + nav

---

## 7. Build Order (Phased)

**Phase 1 — Foundation:** monorepo → Prisma → Clerk → dashboard shell → URL intake

**Phase 2 — Core crawler:** BullMQ + Redis → Crawlee → sitemap/page discovery → page SEO analysis → PageAuditTable

**Phase 3 — AI:** Claude integration → SEO generation → recommendations → page detail UI

**Phase 4 — Performance:** PageSpeed API → performance worker → Core Web Vitals storage → performance dashboard → AI explanations of diagnostics (this is where AI adds real value: PageSpeed gives raw diagnostics, AI translates them for a non-technical site owner)

**Phase 5 — Competitors:** start with **manual entry only** → competitor crawler → comparison UI → opportunity detection. SERP-based auto-discovery and keyword-gap data come after this is proven — they add cost and a new failure mode (bad relevance scoring undermines trust in the whole module), so don't let them block the core competitor comparison feature.

**Phase 6 — Advanced (monetization tier):** Search Console integration, keyword-gap API, WordPress integration, scheduled/recurring audits

**Cost control built into the plan:** don't run PageSpeed on every page by default. Let the user choose scope (Homepage only / Important pages / All pages), and tie page-count limits to pricing tiers (Free: homepage / Pro: 10 pages / Agency: 100 pages). This controls both API cost and gives you a natural upsell.

---

*Tip: when handing sections of this to Claude Code, paste only the relevant section (e.g. just "Core UI Components" when working on components) rather than the whole file — keeps its context focused.*

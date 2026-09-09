# SEO Maker marketing design

Layout and rhythm come from the Atomic / digital-agency landing (dark canvas, centered hero,
email CTA, bento cards, process, quote, testimonials, FAQ, closing CTA).

Brand stays SEO Maker. Do not copy the lime accent. Do not implement this file in one pass.

## How to use this file

1. Pick **one** step from [Implementation order](#implementation-order).
2. Build only that step. Stop and review in the browser.
3. Do not start the next step until the current one is accepted.

If a prompt says "do the homepage" or "make it like the screenshot," still do **one step**.

## Brand locks

These do not change when the layout changes.

| Token | Value | Use |
| --- | --- | --- |
| Orange | `#FF6D29` | Primary CTA, eyebrow, focus, brand mark |
| On orange | `#161316` | Text and icons on orange buttons |
| Charcoal | `#161316` | Wordmark fallback, button text on orange |
| Silver | `#BABABA` | Body, captions, inactive nav |
| White | `#FFFFFF` | Headlines |
| Display | Neue Montreal (Geist fallback) | Headlines and body |
| Mono | JetBrains Mono | Nav, buttons, eyebrows, labels |

Do not introduce lime, a second accent, or fake company logos (Shopify, Pinterest, and similar).

## Source vs ours

| Atomic screenshot | SEO Maker |
| --- | --- |
| Neon lime `#D4FF00` | Brand orange `#FF6D29` |
| True black canvas | Near-black `#050505` (not `#000000`) |
| Green glow arc behind hero | Keep the existing moon image as the hero atmosphere |
| Email + Get started | Same pattern; form does not subscribe yet |
| Agency case-study video | Quote + optional product still. No fake client video |
| Logo row of real brands | Capability words only |
| Testimonials from named clients | Layout later; honest copy or skip until we have quotes |

Linear.app `DESIGN.md` is the token structure reference (surface ladder, hairline cards,
scarce accent). Atomic is the **page composition** reference.

## Tokens

### Color

| Name | Hex | Role |
| --- | --- | --- |
| `canvas` | `#050505` | Marketing page background |
| `surface-1` | `#111111` | Cards, FAQ row, footer CTA panel |
| `surface-2` | `#171717` | Lifted / featured card |
| `hairline` | `#2A2A2A` | 1px card and input borders |
| `ink` | `#FFFFFF` | Headlines |
| `ink-muted` | `#BABABA` | Body |
| `ink-subtle` | `#8A8A8A` | Eyebrows, legal, dates |
| `primary` | `#FF6D29` | CTA fill, eyebrow, focus |
| `on-primary` | `#161316` | Text on CTA |
| `primary-glow` | `rgba(255, 109, 41, 0.18)` | Soft wash behind hero CTA and footer card |

Orange is scarce: brand mark, primary buttons, eyebrows, focus rings. Not card fills.

### Type

| Name | Size | Weight | Tracking | Use |
| --- | --- | --- | --- | --- |
| `display` | 56–72px | 600 | -2px | Hero and closing CTA |
| `section` | 32–40px | 600 | -1px | Section headlines |
| `card-title` | 20–22px | 500 | -0.4px | Card titles |
| `body` | 16px | 400 | 0 | Paragraphs |
| `body-sm` | 14px | 400 | 0 | Card copy, footer |
| `eyebrow` | 12–13px | 500 | 0.4px | Mono, orange, uppercase optional |
| `button` | 14px | 500 | 0 | Mono on buttons |

### Shape and space

| Token | Value | Use |
| --- | --- | --- |
| `rounded-md` | 8px | Buttons, inputs |
| `rounded-xl` | 16px | Default cards |
| `rounded-2xl` | 24px | Hero input shell, footer CTA card |
| `section` | 96–120px | Vertical padding between bands |
| `content` | 1120–1200px | Max inner width |

Cards: `surface-1` + 1px `hairline`. No heavy drop shadows. A faint orange glow is allowed
only behind the hero moon and the footer CTA card.

## Page map

One marketing page. Section order:

1. Header
2. Hero
3. Proof
4. Approach
5. Features bento
6. Process
7. Quote + stats
8. Testimonials (optional until we have real quotes)
9. FAQ
10. Closing CTA
11. Footer

Pricing stays a later band or a `/pricing` page. Do not add it in the hero/features steps.

### Header

- Sticky, transparent over the hero, blur optional
- Logo left, links centered, outlined Login right
- Links: Features, Process, FAQ, Pricing
- Sign up is not required in the header; the hero CTA is the primary action

### Hero

- Full-bleed moon image (`/moon-2.png` or current moon file), `object-cover`, under the type
- Large centered headline
- Short silver subhead
- **Email field + orange Get started** in one pill / joined control (24px radius)
- Secondary "Open demo" text link under the field is allowed
- No dashboard mockup in this layout
- Height: about `80vh` as now. Do not add `pb-20` on the hero — it fights the moon crop

### Proof

- Eyebrow: "Built for the work after the crawl"
- Row of muted words: Crawl, PageSpeed, Claude, Core Web Vitals, Sitemap, Schema
- No trademark logos

### Approach

- Orange eyebrow: `WHO WE ARE`
- One centered paragraph. No cards

### Features bento

- Eyebrow: `WHAT WE DO`
- Headline about audits in one project
- Top row: 3 equal cards (audit table, vitals, AI drafts)
- Next row: 2 wider cards (workflow / tools, competitor or collaboration)
- Under the grid: orange-outline pills (Homepage first, Scoped PageSpeed, Manual competitors)

### Process

- Eyebrow: `HOW IT WORKS`
- 3 columns: Start with a URL → Read the table → Ship the fix
- Circle icon, title, one sentence each

### Quote + stats

- Split: quote left, still or moon crop right (not a fake video)
- 3 stats only if they are honest for this slice (for example page-count limits). Otherwise skip numbers

### Testimonials

Skip until there are real quotes. Do not invent names.

### FAQ

- Eyebrow: `FAQ`
- Headline left or centered
- Accordion. One open row uses `surface-1`

### Closing CTA

- Large `rounded-2xl` card
- Same email + Get started control as the hero
- Soft orange wash, not a lime gradient

### Footer

- Wordmark, Privacy / Terms placeholders, short copyright
- Sparse. No six-column link dump

## Shared UI

Build these only when the step that needs them starts.

| Component | Notes |
| --- | --- |
| `SectionHeading` | Orange mono eyebrow + white section title + optional silver lead |
| `EmailCta` | Email input + orange submit. `preventDefault` until intake exists |
| `SurfaceCard` | `surface-1`, hairline, 16–24px radius |
| FAQ `details` | Keep native `details` unless a shared accordion already exists |

Primary button: orange fill, charcoal text, 8px radius, mono label.

## Current files

| File | Role now |
| --- | --- |
| `app/(marketing)/page.tsx` | Wires hero, proof, features, pricing, FAQ, CTA |
| `app/(marketing)/layout.tsx` | Header + footer + charcoal shell |
| `components/marketing/HomeHero.tsx` | Moon hero, two buttons (not email CTA yet) |
| `components/marketing/HomeProof.tsx` | Capability words |
| `components/marketing/HomeFeatures.tsx` | 2×2 + 3×2 — replace in the bento step |
| `components/marketing/HomePricing.tsx` | Keep off the home page until a pricing step |
| `components/marketing/HomeFaq.tsx` | Accordion — restyle in the FAQ step |
| `components/marketing/HomeCta.tsx` | Newsletter block — restyle in the closing-CTA step |
| `components/layout/MarketingHeader.tsx` | Centered nav — restyle in the header step |
| `components/layout/MarketingFooter.tsx` | Columns — slim down in the footer step |
| `app/globals.css` | Tokens — marketing canvas in step 1 |

## Implementation order

Do these in order. One checkbox per session unless asked to continue.

1. **Marketing tokens** — Near-black canvas on the marketing layout only. Dashboard can stay as it is.
2. **Header** — Centered links, outlined Login, orange mark. No new sections.
3. **Hero** — Keep the moon. Swap the two buttons for `EmailCta`. Tighten type to `display`.
4. **Proof** — Restyle the existing word row. Still no brand logos.
5. **Approach** — New short section. One paragraph.
6. **Features bento** — Replace `HomeFeatures` with 3 + 2 + pills.
7. **Process** — Three steps. New section or a slim `HomeProcess`.
8. **Quote + stats** — Only honest lines. Skip fake video and fake metrics.
9. **FAQ** — Restyle `HomeFaq` to match the accordion treatment.
10. **Closing CTA** — Restyle `HomeCta` to the large card + `EmailCta`.
11. **Footer** — Slim legal row.
12. **Pricing** — Last. Either a home band or leave `/pricing` as the only plan page.

`page.tsx` should only list sections that the finished steps have produced. Until then, unused
sections can stay mounted or be removed in that step — do not rebuild all of them together.

## Do

- Keep orange scarce
- Keep the moon as the hero atmosphere
- Use hairline cards on near-black
- Write SEO Maker copy (audits, page count, scoped PageSpeed)
- Review the changed section in the browser before the next step

## Do not

- Do not ship the whole page in one change
- Do not use lime or a second accent
- Do not fake customer logos, names, videos, or star ratings
- Do not put a dashboard screenshot back in the hero
- Do not add `pb-20` on the moon hero
- Do not change dashboard chrome in these marketing steps
- Do not invent checkout prices; plans stay page-count limits

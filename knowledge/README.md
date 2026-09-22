# SEO Maker — knowledge base

The crawler establishes **facts** about a site. This corpus supplies the **knowledge** the
model needs to explain those facts, judge how much they matter, and recommend something
defensible — without inventing SEO rules.

> 173 items · 7 resolved policies · 32 sources · schema v2.1 · built 2026-09-22

```text
knowledge/
├── knowledge-corpus.json        ← the ingest file. Load this. Nothing else at runtime.
├── knowledge-item.schema.json   validation contract for CI
├── README.md                    this file
├── raw/{seo,geo}/               the 8 primary source PDFs
├── build/                       scripts that regenerate the corpus
└── archive/v1-2026-09-22/       the original 65-item seed, untouched
```

One JSON in, one JSON out. No CSV, no JSONL, no side files to keep in sync.

---

## `knowledge-corpus.json` — the only file the system loads

Six top-level keys.

### `items` — 173 atomic claims

One claim each. Fields group into four jobs:

- **routing** — `topic`, `applicability`, and `checks`, which binds to real `CheckId` values
  from [page-audit.ts](../packages/core/src/scoring/page-audit.ts)
- **the claim** — `principle`, `explanation`, `whyItMatters`, `recommendedAction`
- **scope** — `appliesWhen`, `doesNotApplyWhen`, `limitations` (all mandatory)
- **evidence + provenance** — `knowledgeType`, `claimType`, `evidenceStrength`,
  `source.{quote,location,localPath}`, `provenance.verifiedAgainstLocalSource`, `status`

**When the system uses it.** The crawl returns `robots.txt → 503`. Filter
`checks contains "robots"` → retrieves `seo-tech-robots-5xx-disallow`, which carries the
RFC 9309 §2.3.1.4 quote *"the crawler MUST assume complete disallow"*. The model can now say
this one file is suppressing crawling of the entire site, cite the standard, and escalate
severity — instead of reporting "robots.txt returned an error".

### `policies` — 7 decisions that override item phrasing

Every conflict found during extraction is **decided**, not left open. Each carries a
`decision`, a `directive`, a `neverSay` list, and the `losingClaim` so the model can
recognise and contradict the rejected position.

**When the system uses it.** Load `governingPolicies` on any retrieved item and apply them
*before* emitting `recommendedAction`. A page has 180 words → the `words` check fires →
`policy-word-count` applies → the model must **not** say "this page is under 300 words", and
must instead name what the page is actually missing, or suppress the finding entirely if the
page is functional.

The seven decisions:

| Policy | Decision |
| --- | --- |
| `policy-ai-eligibility` | Three conditions required, including Search Console inclusion — which SEO Maker **cannot** check and must say so |
| `policy-word-count` | 300-word threshold is an internal trigger. Never surface the number |
| `policy-headings` | h1/h2 findings are readability and accessibility, never a Google requirement |
| `policy-title-meta-length` | Length is truncation risk only, never pass/fail, never the lead finding |
| `policy-geo-effect-sizes` | Never quote a GEO percentage. Describe direction only |
| `policy-geo-content-tactics` | Recommend sources, quotes and data. Refuse authoritative-tone rewriting |
| `policy-4xx-removal` | Use the semantically correct code. No removal-speed claim for 410 |

Four of these override SEO Maker's own check wording. They are not code bugs — a threshold
is what makes a check computable — but the AI layer must not restate them as Google rules.

### `vocabularies` — what every enum value means

Three evidence axes are kept separate on purpose: `knowledgeType` (what kind of knowledge),
`claimType` (how strong the claim is), `evidenceStrength` (how good the evidence is).

**When the system uses it.** A rater-guideline item is `authoritative` (Google published it)
but only `evaluation_criterion` (it describes what humans judge, not what the algorithm
does). Collapsing those two is exactly how "E-E-A-T is a ranking factor" gets into tools.

### `retrieval` — the routing recipe and guardrails

`structuredFilters` for the DB columns, `embeddableText` for the vector index, plus six
hard guardrails.

**When the system uses it.** At context-assembly time: filter → drop `superseded` and
`needs_verification` → order authoritative > research > heuristic → send myth items to a
**contradiction** slot, never a recommendation slot.

### `sources` — 32-entry register

Says which sources were actually read. `readInFull: true` for 8; the other 24 come from the
v1 seed, cite documents not in `raw/`, and carry **no quote and no section reference**
because none was verified.

**When the system uses it.** When two items cover the same ground, prefer the one whose
source was read. When citing to a user, pull `source.quote` + `source.location` — present
only on verified items.

### `counts` — build-time census

For dashboards and drift detection. If `verifiedAgainstLocalSource` drops after an edit,
something was added without provenance.

---

## `knowledge-item.schema.json`

JSON Schema (draft 2020-12). All 173 items validate. Wire it into CI:

```bash
python -c "
import json,io,jsonschema
s=json.load(io.open('knowledge-item.schema.json',encoding='utf-8'))
i=json.load(io.open('knowledge-corpus.json',encoding='utf-8'))['items']
v=jsonschema.Draft202012Validator(s)
e=[(x['id'],r.message) for x in i for r in v.iter_errors(x)]
print(len(i),'items,',len(e),'errors'); assert not e"
```

---

## `raw/` — the 8 primary sources

| File | What it is | Version | Items |
| --- | --- | --- | --- |
| `seo/SEO Starter Guide - The Basics…pdf` | Google Search Central | upd. 2025-12-10 | 29 |
| `seo/searchqualityevaluatorguidelines.pdf` | Google **General Guidelines**, 182pp | 2025-09-11 | 27 |
| `geo/Optimizing for Generative AI Features…pdf` | Google Search Central | upd. 2026-07-10 | 25 |
| `seo/Creating Helpful, Reliable, People-First Content…pdf` | Google Search Central | upd. 2025-12-10 | 15 |
| `seo/Robots Exclusion Protocol.pdf` | IETF RFC 9309 | 2022-09 | 14 |
| `geo/GEO - Generative Engine Optimization…pdf` | Aggarwal et al., KDD '24 | 2024-06-28 | 11 |
| `seo/taxonomy of web search.pdf` | Broder, ACM SIGIR Forum | 2002 | 5 |
| `seo/search quality rater guidelines an overview.pdf` | Google public summary, 36pp | 2023-11 | 2 |

**The two rater documents are different.** `searchqualityevaluatorguidelines.pdf` is the full
182-page General Guidelines; `search quality rater guidelines an overview.pdf` is a 36-page
public summary. Cited separately; do not merge.

**Fixed on 2026-09-22:** `raw/Geo/search quality rater guidelines an overview.pdf` was
misnamed — it is the Aggarwal GEO paper, and a *different* file with the same name sat in
`raw/seo/`. Renamed. `Geo/` → `geo/`. Google's AI guide moved `seo/` → `geo/`. Three
over-long filenames shortened.

**Scope boundary.** Google states rater data is not used directly in ranking algorithms. All
27 rater-derived items carry `claimType: evaluation_criterion` and must never be presented
as ranking-system behaviour.

---

## `build/` — regeneration

```bash
cd build
export KNOWLEDGE_DIR="$(cd .. && pwd)"
python build.py        # assembles + integrity checks; exits non-zero on failure
python emit_schema.py  # regenerates the schema
```

`build.py` refuses to emit if an item is `authoritative` on a non-official source, has empty
`limitations`, duplicates an id, dangles a cross-reference, is verified but has no
`source.location`, or is **unverified yet carries a quote** — the check that makes fabricated
citations structurally impossible.

Source modules: one per document (`src_rfc9309.py`, `src_starter.py`, `src_helpful.py`,
`src_aiopt.py`, `src_qrg.py`, `src_research.py`), plus `policies.py` for decisions and
`migrate_seed.py` for the v1 carry-forward.

### Rules for adding knowledge

1. One claim per item — if it needs an "and", split it.
2. No source you have not opened. Leave `quote`/`location` null rather than guessing.
3. `limitations` is mandatory and must say something real.
4. `authoritative` requires an official or standards source, however widely repeated the claim is.
5. Never strengthen a claim beyond its source.
6. New conflict → decide it in `policies.py`. Do not leave it open.

---

## `archive/v1-2026-09-22/`

The original 65-item seed, unchanged. Kept because it is your data and this folder is not
under version control — it is the only rollback path. Not loaded at runtime.

---

## Known gaps

Ranking weights, per-engine AI citation formulas, ChatGPT's retrieval backend, whether any
production system reads `llms.txt`, local SEO ranking specifics, and the durability of the
GEO effect sizes. **Unresolved, not missing.** Do not fill them with vendor blog claims.

45 items cite sources not archived in `raw/` and were not re-read this pass. Adding those
PDFs is the highest-value next step; `sources[].readInFull: false` ranks them by how many
items depend on each.

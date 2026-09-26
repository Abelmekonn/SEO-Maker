import { Prisma, prisma } from "@seo-maker/db";

/**
 * The user's sites (projects), for the Sites page, the sidebar's recent list
 * and the sites API: searched, filtered by date, sorted and paginated in the
 * database, with each site's latest crawl joined in for its score and date.
 */

export const SITE_SORTS = ["recent", "added", "name", "score", "crawled"] as const;
export type SiteSort = (typeof SITE_SORTS)[number];
export const SITE_DATE_FIELDS = ["added", "crawled"] as const;
export type SiteDateField = (typeof SITE_DATE_FIELDS)[number];

export type SiteQuery = {
  q?: string | null;
  /** Which date `from`/`to` filter: when the site was added, or last crawled. */
  field?: SiteDateField;
  /** YYYY-MM-DD, inclusive. */
  from?: string | null;
  /** YYYY-MM-DD, inclusive. */
  to?: string | null;
  sort?: SiteSort;
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

export type SiteRow = {
  id: string;
  name: string;
  rootUrl: string;
  host: string;
  status: string;
  createdAt: string;
  lastCrawledAt: string | null;
  seoScore: number | null;
  pagesAnalyzed: number | null;
  issueCount: number | null;
};

export type SiteList = {
  items: SiteRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  query: Required<Pick<SiteQuery, "sort" | "dir" | "field">> & { q: string; from: string | null; to: string | null };
};

const MAX_PAGE_SIZE = 50;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** A parsed, bounded query from untrusted input (URL search params or a request). */
export function parseSiteQuery(params: URLSearchParams | Record<string, string | string[] | undefined>): SiteQuery {
  const get = (key: string) => {
    if (params instanceof URLSearchParams) return params.get(key);
    const value = params[key];
    return Array.isArray(value) ? value[0] : (value ?? null);
  };
  const sort = get("sort");
  const field = get("field");
  const dir = get("dir");
  const from = get("from");
  const to = get("to");
  const page = Number(get("page"));
  const pageSize = Number(get("pageSize"));
  return {
    q: (get("q") ?? "").trim().slice(0, 100) || null,
    sort: (SITE_SORTS as readonly string[]).includes(sort ?? "") ? (sort as SiteSort) : "recent",
    field: (SITE_DATE_FIELDS as readonly string[]).includes(field ?? "") ? (field as SiteDateField) : "added",
    dir: dir === "asc" || dir === "desc" ? dir : undefined,
    from: from && DATE.test(from) ? from : null,
    to: to && DATE.test(to) ? to : null,
    page: Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1,
    pageSize: Number.isFinite(pageSize) && pageSize >= 1 ? Math.min(MAX_PAGE_SIZE, Math.floor(pageSize)) : 20,
  };
}

/** `%`, `_` and `\` are wildcards in ILIKE; a search for them means the character. */
function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

/** Sort column and default direction, from a fixed list: nothing a client sends reaches SQL. */
const ORDER: Record<SiteSort, { column: string; dir: "asc" | "desc" }> = {
  recent: { column: `COALESCE(c."startedAt", p."createdAt")`, dir: "desc" },
  added: { column: `p."createdAt"`, dir: "desc" },
  name: { column: `LOWER(p."name")`, dir: "asc" },
  score: { column: `c."seoScore"`, dir: "desc" },
  crawled: { column: `COALESCE(c."finishedAt", c."startedAt")`, dir: "desc" },
};

const DATE_COLUMN: Record<SiteDateField, string> = {
  added: `p."createdAt"`,
  crawled: `COALESCE(c."finishedAt", c."startedAt")`,
};

type Row = {
  id: string;
  name: string;
  rootUrl: string;
  status: string;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  seoScore: number | null;
  analyzed: number | null;
  issueCount: number | null;
};

export async function listSites(userId: string, query: SiteQuery = {}): Promise<SiteList> {
  const sort = query.sort ?? "recent";
  const order = ORDER[sort];
  const dir = query.dir ?? order.dir;
  const field = query.field ?? "added";
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, query.pageSize ?? 20));
  const page = Math.max(1, query.page ?? 1);
  const q = query.q?.trim() || null;
  const dateColumn = Prisma.raw(DATE_COLUMN[field]);

  const conditions: Prisma.Sql[] = [Prisma.sql`p."userId" = ${userId}`];
  if (q) {
    const pattern = likePattern(q);
    conditions.push(
      Prisma.sql`(p."name" ILIKE ${pattern} OR p."siteKey" ILIKE ${pattern} OR p."rootUrl" ILIKE ${pattern})`,
    );
  }
  if (query.from) {
    conditions.push(Prisma.sql`${dateColumn} >= ${new Date(`${query.from}T00:00:00.000Z`)}`);
  }
  if (query.to) {
    // Inclusive: everything before the start of the next day.
    const end = new Date(`${query.to}T00:00:00.000Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    conditions.push(Prisma.sql`${dateColumn} < ${end}`);
  }
  const where = Prisma.join(conditions, " AND ");
  const orderBy = Prisma.raw(`${order.column} ${dir === "asc" ? "ASC" : "DESC"} NULLS LAST, p."id" ASC`);

  const [rows, counted] = await Promise.all([
    prisma.$queryRaw<Row[]>`
      SELECT p."id", p."name", p."rootUrl", p."status", p."createdAt",
             c."startedAt", c."finishedAt", c."seoScore", c."analyzed", c."issueCount"
      FROM "Project" p
      LEFT JOIN "Crawl" c ON c."id" = p."latestCrawlId"
      WHERE ${where}
      ORDER BY ${orderBy}
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "Project" p
      LEFT JOIN "Crawl" c ON c."id" = p."latestCrawlId"
      WHERE ${where}`,
  ]);

  const total = Number(counted[0]?.count ?? 0);
  return {
    items: rows.map((row) => ({
      id: row.id,
      name: row.name,
      rootUrl: row.rootUrl,
      host: hostOf(row.rootUrl),
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      lastCrawledAt: (row.finishedAt ?? row.startedAt)?.toISOString() ?? null,
      seoScore: row.seoScore == null ? null : Math.round(row.seoScore),
      pagesAnalyzed: row.analyzed,
      issueCount: row.issueCount,
    })),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    query: { q: q ?? "", sort, dir, field, from: query.from ?? null, to: query.to ?? null },
  };
}

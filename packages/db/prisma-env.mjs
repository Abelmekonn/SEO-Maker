import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Loads DATABASE_URL from the repo-root `.env`.
 *
 * The Prisma CLI only looks in its own working directory and `./prisma`, so
 * `pnpm db:deploy` and `pnpm db:migrate` failed with "Environment variable not
 * found: DATABASE_URL" on a clean checkout even though the root `.env` had it.
 */
export function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, ".env"),
    join(here, "prisma", ".env"),
    resolve(here, "../../.env"),
  ];

  for (const file of candidates) {
    if (!existsSync(file)) {
      continue;
    }
    const match = readFileSync(file, "utf8")
      .split(/\r?\n/)
      .map((line) => /^\s*(?:export\s+)?DATABASE_URL\s*=\s*(.+?)\s*$/.exec(line))
      .find(Boolean);
    if (match) {
      process.env.DATABASE_URL = match[1].replace(/^["']|["']$/g, "");
      return process.env.DATABASE_URL;
    }
  }

  // Matches docker-compose.yml, which maps Postgres to 5433 to avoid clashing
  // with a local install on 5432.
  process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5433/seo_maker";
  return process.env.DATABASE_URL;
}

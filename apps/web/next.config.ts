import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { NextConfig } from "next";

/**
 * The repo-root `.env` as a base layer.
 *
 * Next reads `.env*` from this app's folder only. Shared settings (the AI
 * provider keys, the database) live in the repo-root `.env`, so it is read
 * here too, filling only what is not already set: the shell and this app's
 * own `.env.local` still win.
 */
function loadRootEnv() {
  const file = resolve(process.cwd(), "../../.env");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
}

loadRootEnv();

const nextConfig: NextConfig = {
  transpilePackages: ["@seo-maker/ai", "@seo-maker/db", "@seo-maker/core"],

  /**
   * Keep production builds out of the dev server's directory.
   *
   * `next build` and `next dev` write incompatible trees into `.next`. Running
   * a verification build while a dev server owns that folder leaves the dev
   * server reading production artifacts, which surfaces as font modules that
   * will not resolve and as ENOENT on `.next/static/development/*.tmp` —
   * because `static/development` is never created.
   *
   * Setting NEXT_DIST_DIR (as `pnpm verify:build` does) sends a build to its
   * own folder, so the two can coexist.
   */
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;

import { spawnSync } from "node:child_process";

process.env.DATABASE_URL ??=
  "postgresql://postgres:postgres@localhost:5432/seo_maker";

const result = spawnSync("prisma", ["generate"], {
  stdio: "inherit",
  env: process.env,
  shell: true,
});

process.exit(result.status ?? 1);

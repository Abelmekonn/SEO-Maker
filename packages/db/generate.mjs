import { spawnSync } from "node:child_process";
import { loadDatabaseUrl } from "./prisma-env.mjs";

loadDatabaseUrl();

const args = process.argv.slice(2);
const result = spawnSync("prisma", args.length > 0 ? args : ["generate"], {
  stdio: "inherit",
  env: process.env,
  shell: true,
});

process.exit(result.status ?? 1);

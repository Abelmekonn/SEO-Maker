// Runs the worker in watch mode with stdin closed.
//
// `tsx watch` with an inherited stdin (how `pnpm dev` / turbo start it) left
// Crawlee unable to process a single request: every crawl stopped silently
// after "Starting the crawler" and stayed "crawling" forever. The same worker
// run with stdin from /dev/null, or under plain `tsx`, crawls normally. The
// worker never reads stdin, so it is simply not given one; stdout and stderr
// pass straight through so logs look the same.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const tsxCli = require.resolve("tsx/cli");
const entry = process.argv[2] ?? "src/index.ts";

const child = spawn(process.execPath, [tsxCli, "watch", "--env-file=.env", entry], {
  stdio: ["ignore", "inherit", "inherit"],
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));

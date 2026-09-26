// Route-handler tests against a real database, with Clerk and the job queue
// replaced (see tests/). Run from the repo root:
//   SEO_MAKER_DB_TESTS=1 pnpm --filter web test:routes
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

export default {
  resolve: { alias: { "@": root } },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // One file at a time: the tests share the database.
    fileParallelism: false,
  },
};

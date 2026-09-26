/**
 * Runs the AI evaluation benchmark (Phase 4.3, 4.4).
 *
 *   pnpm ai:benchmark                                       the default provider's model
 *   pnpm ai:benchmark --models groq:openai/gpt-oss-120b,gemini:gemini-3.5-flash
 *   pnpm ai:benchmark --models openai/gpt-oss-20b          (no prefix: the default provider)
 *   pnpm ai:benchmark --knowledge none                      prompts alone, no corpus
 *   pnpm ai:benchmark --cases meta-missing-service,schema-product
 *   pnpm ai:benchmark --baseline benchmark/results/<file>.json
 *   pnpm ai:benchmark --fail-under 0.8                      exit 1 below this overall score
 *
 * Every model is run on identical cases. The first is the baseline for the
 * printed comparison unless --baseline names a saved report, so a prompt or
 * knowledge change is measured by saving a report, changing, and re-running.
 * Reports are written to packages/ai/benchmark/results as JSON.
 *
 * This spends real tokens: one call per case per model (about eleven).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/** Loads the repo-root .env without overriding what the shell already set. */
function loadEnv(file: string) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
}

function args(): Map<string, string> {
  const map = new Map<string, string>();
  const argv = process.argv.slice(2);
  for (let index = 0; index < argv.length; index += 1) {
    const [key, inline] = argv[index].replace(/^--/, "").split("=", 2);
    map.set(key, inline ?? (argv[index + 1]?.startsWith("--") ? "true" : (argv[++index] ?? "true")));
  }
  return map;
}

async function main() {
  loadEnv(resolve(here, "../../../.env"));
  const options = args();

  // Imported after the environment is loaded: config reads it on each call,
  // but the database client reads DATABASE_URL when first constructed.
  const { isProviderId, loadAiConfig } = await import("../src/config");
  const { retrieveKnowledge } = await import("../src/knowledge");
  const { BENCHMARK_CASES, compareReports, formatComparison, formatReport, runBenchmark } = await import("../src/eval");
  const { prisma } = await import("@seo-maker/db");

  const config = loadAiConfig();
  if (!config.enabled) {
    console.error("No AI provider key is set (AI_API_KEY_GROQ, AI_API_KEY_GEMINI, AI_API_KEY_GEMINI2).");
    process.exit(1);
  }

  const defaultModel = `${config.defaultProvider}:${config.providers[config.defaultProvider].model}`;
  const variants = (options.get("models") ?? defaultModel)
    .split(",")
    .map((spec: string) => spec.trim())
    .filter(Boolean)
    .map((spec: string) => {
      const [prefix, ...rest] = spec.split(":");
      const providerId = isProviderId(prefix) && rest.length ? prefix : config.defaultProvider;
      const model = isProviderId(prefix) && rest.length ? rest.join(":") : spec;
      return { label: `${providerId}:${model}`, providerId, model };
    });
  const wanted = options.get("cases")?.split(",").map((id) => id.trim());
  const cases = wanted ? BENCHMARK_CASES.filter((item) => wanted.includes(item.id)) : BENCHMARK_CASES;
  const useKnowledge = options.get("knowledge") !== "none";

  console.log(`Benchmark: ${cases.length} cases x ${variants.length} model(s), knowledge ${useKnowledge ? "from the database" : "off"}\n`);

  const reports = await runBenchmark({
    variants,
    cases,
    knowledge: useKnowledge ? retrieveKnowledge : undefined,
    onCase: (variant, result) => {
      const score = result.overall == null ? "n/a" : `${Math.round(result.overall * 100)}%`;
      console.log(`  ${variant.label}  ${result.caseId.padEnd(26)} ${score}${result.error ? `  (${result.error.slice(0, 90)})` : ""}`);
    },
  });

  const outDir = resolve(here, "../benchmark/results");
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  for (const report of reports) {
    const file = join(outDir, `${stamp}-${report.label.replace(/[^a-z0-9.-]+/gi, "_")}.json`);
    writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`\n${formatReport(report)}\n  saved ${file}`);
  }

  const baselinePath = options.get("baseline");
  const baseline = baselinePath ? JSON.parse(readFileSync(resolve(baselinePath), "utf8")) : reports[0];
  for (const report of reports) {
    if (report === baseline) continue;
    console.log(`\n${formatComparison(compareReports(baseline, report))}`);
  }

  await prisma.$disconnect();

  const failUnder = Number(options.get("fail-under"));
  if (Number.isFinite(failUnder) && reports.some((report) => (report.overall ?? 0) < failUnder)) {
    console.error(`\nA model scored below ${failUnder}.`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

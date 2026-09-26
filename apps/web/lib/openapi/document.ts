import { OpenApiGeneratorV3 } from "@asteasolutions/zod-to-openapi";
import { registry } from "./registry";
// Importing for the registration side effects: both files call
// `registry.register(...)` / `registry.registerPath(...)` at module load,
// so they must run before `generateDocument` walks the registry.
import "./schemas";
import "./paths";
import "./paths-ai";

export function generateOpenApiDocument() {
  const generator = new OpenApiGeneratorV3(registry.definitions);
  return generator.generateDocument({
    openapi: "3.0.0",
    info: {
      title: "SEO Maker API",
      version: "0.1.0",
      description:
        "Generated from the Zod schemas in apps/web/lib/openapi — request bodies are the actual " +
        "validation the route handlers run, not a hand-maintained approximation. " +
        "All routes require a signed-in Clerk session (cookie-based); there is no API-key access.",
    },
    servers: [{ url: "/", description: "This deployment" }],
  });
}

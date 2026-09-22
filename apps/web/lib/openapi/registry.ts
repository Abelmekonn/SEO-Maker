import { OpenAPIRegistry, extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

/**
 * Single shared registry every route file registers into.
 *
 * Keeping one instance here (rather than one per route file importing a
 * fresh registry) is what lets `generate.ts` walk every registration and
 * produce one complete document. Route files import `registry` and call
 * `registry.registerPath(...)`; they never construct their own.
 */
export const registry = new OpenAPIRegistry();

/** Every error response uses this shape — matches every `NextResponse.json({ error })` in the app. */
export const ErrorResponse = registry.register(
  "ErrorResponse",
  z.object({
    error: z.string().openapi({ example: "Project not found." }),
    /** Only present on 409s that hand back the id of the conflicting resource. */
    id: z.string().optional(),
  }),
);

export const OkResponse = registry.register("OkResponse", z.object({ ok: z.literal(true) }));

registry.registerComponent("securitySchemes", "ClerkSession", {
  type: "apiKey",
  in: "cookie",
  name: "__session",
  description:
    "Every route reads the session via Clerk's `auth()`, which resolves from the `__session` cookie. " +
    "There is no bearer-token or API-key path — these endpoints are for the web app's own browser session, " +
    "not third-party API access. 'Try it out' in Swagger UI only works when you're signed in to SEO Maker " +
    "in the same browser, because it sends this cookie same-origin.",
});

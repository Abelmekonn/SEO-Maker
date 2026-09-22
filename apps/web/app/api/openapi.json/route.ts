import { NextResponse } from "next/server";
import { generateOpenApiDocument } from "@/lib/openapi/document";

/**
 * Raw OpenAPI 3.0 document. Swagger UI (/api-docs) points here, and this is
 * also what you'd feed to any other OpenAPI tool (Postman import, codegen, …).
 *
 * Intentionally unauthenticated — it describes the API, it doesn't call it —
 * mirroring the earlier decision to serve `robots.txt`/`sitemap.xml`-style
 * metadata publicly. The endpoints it documents still require a Clerk session.
 */
export function GET() {
  return NextResponse.json(generateOpenApiDocument());
}

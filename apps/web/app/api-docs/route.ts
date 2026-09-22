/**
 * Swagger UI, served as a plain HTML page rather than a React component.
 *
 * `swagger-ui-react`'s peer dependency range doesn't reach React 19 (this app's
 * version), and pinning the CDN-hosted standalone bundle here avoids that
 * conflict entirely while adding nothing to the app's own client bundle.
 *
 * Unauthenticated on purpose: this page only describes the API (fetched from
 * /api/openapi.json, also unauthenticated). "Try it out" still needs a real
 * signed-in session — it sends the browser's own Clerk cookie, so it only
 * works against endpoints you're actually allowed to call.
 */

const SWAGGER_UI_VERSION = "5";

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>SEO Maker API docs</title>
  <link
    rel="stylesheet"
    href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@${SWAGGER_UI_VERSION}/swagger-ui.css"
  />
  <style>
    body { margin: 0; background: #fafafa; }
    .topbar { display: none; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@${SWAGGER_UI_VERSION}/swagger-ui-bundle.js"></script>
  <script>
    window.addEventListener("load", () => {
      window.SwaggerUIBundle({
        url: "/api/openapi.json",
        dom_id: "#swagger-ui",
        presets: [window.SwaggerUIBundle.presets.apis],
        // Same-origin cookie (Clerk's session) rides along on "Try it out" calls.
        withCredentials: true,
        docExpansion: "list",
        persistAuthorization: true,
      });
    });
  </script>
</body>
</html>`;

export function GET() {
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

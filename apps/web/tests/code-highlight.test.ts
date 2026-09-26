/** Syntax colouring for the page detail's Code tab. */

import { type Token, highlightLines } from "@/components/project/code-highlight";

const kinds = (tokens: Token[]) => tokens.filter((token) => token.text.trim()).map((token) => `${token.kind}:${token.text}`);

describe("highlightLines", () => {
  it("colours an HTML tag's parts, and keeps every character", () => {
    const line = '<meta name="description" content="Fast &quot;payments&quot;" />';
    const [tokens] = highlightLines([line], "html");
    expect(tokens.map((token) => token.text).join("")).toBe(line);
    expect(kinds(tokens)).toEqual([
      "punctuation:<",
      "tag:meta",
      "attribute:name",
      "plain:=",
      'string:"description"',
      "attribute:content",
      "plain:=",
      'string:"Fast &quot;payments&quot;"',
      "punctuation:/>",
    ]);
  });

  it("colours element text and closing tags", () => {
    const [tokens] = highlightLines(["<h1>Payments for retailers</h1>"], "html");
    expect(kinds(tokens)).toEqual(["punctuation:<", "tag:h1", "punctuation:>", "plain:Payments for retailers", "punctuation:</", "tag:h1", "punctuation:>"]);
  });

  it("colours a comment as one comment", () => {
    const [tokens] = highlightLines(["<!-- You don't have an H1 on this page. -->"], "html");
    expect(kinds(tokens)).toEqual(["comment:<!-- You don't have an H1 on this page. -->"]);
  });

  it("reads JSON-LD inside its script as JSON, with bracket pairs coloured by depth", () => {
    const lines = highlightLines(
      ['<script type="application/ld+json">', "{", '  "@type": "Product",', '  "offers": { "price": 19.5, "inStock": true }', "}", "</script>"],
      "html",
    );
    expect(kinds(lines[2])).toEqual(['key:"@type"', "plain::", 'string:"Product"', "plain:,"]);
    expect(lines[3].filter((token) => token.kind === "bracket").map((token) => token.depth)).toEqual([1, 1]);
    expect(kinds(lines[3])).toContain("number:19.5");
    expect(kinds(lines[3])).toContain("tag:true");
    expect(kinds(lines[5])).toEqual(["punctuation:</", "tag:script", "punctuation:>"]);
  });

  it("colours robots.txt directives and HTTP lines", () => {
    expect(kinds(highlightLines(["Sitemap: https://example.com/sitemap.xml"], "text")[0])).toEqual([
      "tag:Sitemap",
      "punctuation::",
      "string:https://example.com/sitemap.xml",
    ]);
    const [request, status] = highlightLines(["GET https://example.com/a", "HTTP/1.1 404"], "http");
    expect(kinds(request)).toEqual(["keyword:GET", "attribute:https://example.com/a"]);
    expect(kinds(status)).toEqual(["tag:HTTP/1.1", "number:404"]);
  });
});

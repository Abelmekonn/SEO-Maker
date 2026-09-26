/**
 * Syntax colouring for the page detail's Code tab, in VS Code's Dark Modern
 * palette.
 *
 * The code there is short and of four kinds: HTML, the JSON-LD inside a
 * `<script type="application/ld+json">`, robots.txt lines and an HTTP
 * exchange. A small line tokenizer covers them without shipping a full
 * grammar engine to the browser. It works line by line because the editor
 * renders line by line (line numbers, removed and added lines), carrying one
 * piece of state across lines: whether it is inside a JSON-LD script.
 */

export type TokenKind =
  | "plain"
  | "punctuation"
  | "tag"
  | "attribute"
  | "string"
  | "comment"
  | "key"
  | "number"
  | "keyword"
  | "bracket";

export type Token = { text: string; kind: TokenKind; depth?: number };

export type HighlightLanguage = "html" | "text" | "http";

/** Colours as VS Code's Dark Modern theme draws them. */
export const TOKEN_CLASS: Record<Exclude<TokenKind, "bracket">, string> = {
  plain: "text-[#cccccc]",
  punctuation: "text-[#808080]",
  tag: "text-[#569cd6]",
  attribute: "text-[#9cdcfe]",
  string: "text-[#ce9178]",
  comment: "text-[#6a9955]",
  key: "text-[#9cdcfe]",
  number: "text-[#b5cea8]",
  keyword: "text-[#c586c0]",
};

/** Bracket pair colours, by nesting depth. */
export const BRACKET_CLASS = ["text-[#ffd700]", "text-[#da70d6]", "text-[#179fff]"];

export function tokenClass(token: Token): string {
  return token.kind === "bracket" ? BRACKET_CLASS[(token.depth ?? 0) % BRACKET_CLASS.length] : TOKEN_CLASS[token.kind];
}

/** Tokens for each line, in order. */
export function highlightLines(lines: string[], language: HighlightLanguage): Token[][] {
  let inJson = false;
  let depth = 0;
  return lines.map((line) => {
    if (language === "text") return textLine(line);
    if (language === "http") return httpLine(line);
    if (inJson && !/<\/script>/i.test(line)) {
      const result = jsonLine(line, depth);
      depth = result.depth;
      return result.tokens;
    }
    if (/<\/script>/i.test(line)) inJson = false;
    if (/<script[^>]*ld\+json/i.test(line) && !/<\/script>/i.test(line)) {
      inJson = true;
      depth = 0;
    }
    return htmlLine(line);
  });
}

function htmlLine(line: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  const push = (text: string, kind: TokenKind) => {
    if (text) tokens.push({ text, kind });
  };

  while (index < line.length) {
    if (line.startsWith("<!--", index)) {
      const end = line.indexOf("-->", index + 4);
      const stop = end === -1 ? line.length : end + 3;
      push(line.slice(index, stop), "comment");
      index = stop;
      continue;
    }
    if (line[index] === "<" && /[a-zA-Z/!]/.test(line[index + 1] ?? "")) {
      const open = line[index + 1] === "/" ? "</" : "<";
      push(open, "punctuation");
      index += open.length;
      const name = /^[a-zA-Z][\w:-]*|^![\w-]+/.exec(line.slice(index))?.[0] ?? "";
      push(name, "tag");
      index += name.length;
      // Attributes until the tag closes, or the line ends.
      while (index < line.length) {
        const rest = line.slice(index);
        const space = /^\s+/.exec(rest)?.[0];
        if (space) {
          push(space, "plain");
          index += space.length;
          continue;
        }
        if (rest.startsWith("/>") || rest.startsWith(">")) {
          const close = rest.startsWith("/>") ? "/>" : ">";
          push(close, "punctuation");
          index += close.length;
          break;
        }
        if (rest[0] === "=") {
          push("=", "plain");
          index += 1;
          continue;
        }
        const quoted = /^"[^"]*"?|^'[^']*'?/.exec(rest)?.[0];
        if (quoted) {
          push(quoted, "string");
          index += quoted.length;
          continue;
        }
        const attribute = /^[^\s=>"'/]+/.exec(rest)?.[0] ?? rest[0];
        push(attribute, "attribute");
        index += attribute.length;
      }
      continue;
    }
    const next = line.indexOf("<", index + 1);
    const stop = next === -1 ? line.length : next;
    push(line.slice(index, stop), "plain");
    index = stop;
  }
  return tokens;
}

function jsonLine(line: string, startDepth: number): { tokens: Token[]; depth: number } {
  const tokens: Token[] = [];
  let depth = startDepth;
  const pattern = /(\s+)|("(?:[^"\\]|\\.)*"?)(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|(true|false|null)\b|([{[])|([}\]])|([,:])|([^\s"{}[\],:]+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(line))) {
    const [, space, string, colon, number, literal, open, close, punctuation, other] = match;
    if (space) tokens.push({ text: space, kind: "plain" });
    else if (string) {
      tokens.push({ text: string, kind: colon ? "key" : "string" });
      if (colon) tokens.push({ text: colon, kind: "plain" });
    } else if (number) tokens.push({ text: number, kind: "number" });
    else if (literal) tokens.push({ text: literal, kind: "tag" });
    else if (open) tokens.push({ text: open, kind: "bracket", depth: depth++ });
    else if (close) tokens.push({ text: close, kind: "bracket", depth: (depth = Math.max(0, depth - 1)) });
    else if (punctuation) tokens.push({ text: punctuation, kind: "plain" });
    else if (other) tokens.push({ text: other, kind: "plain" });
  }
  return { tokens, depth };
}

/** robots.txt: `Directive: value` lines and `#` comments. */
function textLine(line: string): Token[] {
  if (/^\s*#/.test(line)) return [{ text: line, kind: "comment" }];
  const directive = /^(\s*)([A-Za-z][\w-]*)(:)(\s*)(.*)$/.exec(line);
  if (!directive) return [{ text: line, kind: "plain" }];
  const [, lead, name, colon, space, value] = directive;
  return [
    { text: lead, kind: "plain" },
    { text: name, kind: "tag" },
    { text: colon, kind: "punctuation" },
    { text: space, kind: "plain" },
    { text: value, kind: "string" },
  ].filter((token) => token.text) as Token[];
}

/** An HTTP exchange: the request line, the status line, and `#` comments. */
function httpLine(line: string): Token[] {
  if (/^\s*#/.test(line)) return [{ text: line, kind: "comment" }];
  const request = /^(GET|HEAD|POST)(\s+)(.*)$/.exec(line);
  if (request) {
    return [
      { text: request[1], kind: "keyword" },
      { text: request[2], kind: "plain" },
      { text: request[3], kind: "attribute" },
    ];
  }
  const status = /^(HTTP\/[\d.]+)(\s+)(\d{3})(.*)$/.exec(line);
  if (status) {
    return [
      { text: status[1], kind: "tag" },
      { text: status[2], kind: "plain" },
      { text: status[3], kind: "number" },
      ...(status[4] ? [{ text: status[4], kind: "plain" as const }] : []),
    ];
  }
  return [{ text: line, kind: "plain" }];
}

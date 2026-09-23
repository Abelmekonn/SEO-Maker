import { describe, expect, it } from "vitest";
import type { HeadingEvidence } from "../page/intelligence";
import { firstSentence, leadParagraph, opensWithAnswer, sectionSpans } from "./sections";

const content =
  "We build websites for small businesses. " +
  "What we do We design, build and maintain websites end to end for teams without an in-house developer. " +
  "Where we work Our studio is in Addis Ababa and we serve clients across East Africa. " +
  "Pricing Projects start at 40,000 birr.";

const headings: HeadingEvidence[] = [
  { level: 2, text: "What we do" },
  { level: 2, text: "Where we work" },
  { level: 3, text: "Pricing" },
];

describe("sectionSpans", () => {
  it("returns nothing without content", () => {
    expect(sectionSpans(null, headings)).toEqual([]);
    expect(sectionSpans("", headings)).toEqual([]);
  });

  // On most homepages the text above the first H2 is the most important copy
  // on the page, so it has to survive as its own section.
  it("keeps the text before the first heading as an unheaded section", () => {
    const sections = sectionSpans(content, headings);
    expect(sections[0]!.heading).toBeNull();
    expect(sections[0]!.level).toBeNull();
    expect(sections[0]!.text).toBe("We build websites for small businesses.");
  });

  it("cuts one section per located heading, in document order", () => {
    const sections = sectionSpans(content, headings);
    expect(sections.map((section) => section.heading)).toEqual([
      null,
      "What we do",
      "Where we work",
      "Pricing",
    ]);
    expect(sections[2]!.text).toContain("Addis Ababa");
    expect(sections[2]!.text).not.toContain("Projects start at");
  });

  it("counts words per section", () => {
    const sections = sectionSpans(content, headings);
    expect(sections[3]!.heading).toBe("Pricing");
    expect(sections[3]!.wordCount).toBe(5);
  });

  // A heading the extractor stripped from the body cannot be located. Guessing
  // a boundary there would invent a section that does not exist.
  it("skips a heading that is not present in the content", () => {
    const sections = sectionSpans(content, [
      { level: 2, text: "What we do" },
      { level: 2, text: "Careers" },
    ]);
    expect(sections.map((section) => section.heading)).toEqual([null, "What we do"]);
  });

  it("handles content with no headings at all", () => {
    const sections = sectionSpans("Just one block of prose.", []);
    expect(sections).toHaveLength(1);
    expect(sections[0]!.heading).toBeNull();
  });
});

describe("leadParagraph", () => {
  it("caps at the requested length and trims", () => {
    expect(leadParagraph(content, 20)).toBe("We build websites fo");
    expect(leadParagraph(null)).toBe("");
  });
});

describe("firstSentence", () => {
  it("stops at sentence punctuation followed by a new sentence", () => {
    expect(firstSentence("We repair boilers. We also fit them.")).toBe("We repair boilers.");
  });

  it("returns the whole text when there is no terminator", () => {
    expect(firstSentence("No terminator here")).toBe("No terminator here");
  });
});

describe("opensWithAnswer", () => {
  it("accepts a declarative opening of a usable length", () => {
    expect(
      opensWithAnswer(
        "Technical SEO is the work of making a site crawlable, indexable and fast for search engines.",
      ),
    ).toBe(true);
  });

  it("rejects an opening that is only a lead-in", () => {
    expect(opensWithAnswer("Here is what we cover:")).toBe(false);
  });

  it("rejects an opening that is too short to be an answer", () => {
    expect(opensWithAnswer("We help.")).toBe(false);
  });

  it("rejects an empty section", () => {
    expect(opensWithAnswer("")).toBe(false);
  });
});

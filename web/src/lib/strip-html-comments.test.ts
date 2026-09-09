import { describe, expect, it } from "vitest";

import { stripHtmlComments } from "./strip-html-comments";

describe("stripHtmlComments", () => {
  it("strips citation-span wrappers and keeps the claim", () => {
    expect(
      stripHtmlComments(
        "<!-- span:c0 -->Garchomp is fast.<!-- /span:c0 -->",
      ),
    ).toBe("Garchomp is fast.");
  });

  it("leaves surrounding prose", () => {
    expect(
      stripHtmlComments("X <!-- span:c0 -->Y<!-- /span:c0 --> Z"),
    ).toBe("X Y Z");
  });

  it("leaves comments inside a closed fence intact", () => {
    const source = "```\n<!-- span:c0 -->kept<!-- /span:c0 -->\n```";
    expect(stripHtmlComments(source)).toBe(source);
  });

  it("drops a trailing unclosed comment", () => {
    expect(stripHtmlComments("before <!-- span:c0")).toBe("before ");
  });

  it("never leaves an HTML comment delimiter in ordinary prose", () => {
    const raw =
      "<!-- span:c0 -->Ceruledge is Fire/Ghost.<!-- /span:c0 --> It has no Ground immunity.";
    const stripped = stripHtmlComments(raw);
    expect(stripped).toBe(
      "Ceruledge is Fire/Ghost. It has no Ground immunity.",
    );
    expect(stripped).not.toContain("<!--");
  });
});

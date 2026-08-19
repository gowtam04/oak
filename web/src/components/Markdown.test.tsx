import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Markdown from "./Markdown";

describe("Markdown — HTML comments", () => {
  it("does not render citation-span comments as visible text", () => {
    render(
      <Markdown markdown="<!-- span:c0 -->Ceruledge is Fire/Ghost.<!-- /span:c0 --> It has no Ground immunity." />,
    );
    const text = document.body.textContent ?? "";
    expect(text).not.toContain("<!--");
    expect(text).not.toContain("span:c0");
    expect(text).toContain("Ceruledge is Fire/Ghost.");
    expect(text).toContain("It has no Ground immunity.");
  });
});

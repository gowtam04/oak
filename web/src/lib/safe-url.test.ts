import { describe, expect, it } from "vitest";

import { safeHttpUrl } from "./safe-url";

describe("safeHttpUrl", () => {
  it("passes through an https URL unchanged", () => {
    const url = "https://pokeapi.co/api/v2/pokemon/garchomp";
    expect(safeHttpUrl(url)).toBe(url);
  });

  it("passes through an http URL unchanged", () => {
    const url = "http://example.test/sprite.png";
    expect(safeHttpUrl(url)).toBe(url);
  });

  it("rejects a javascript: URL", () => {
    expect(safeHttpUrl("javascript:alert(1)")).toBeUndefined();
  });

  it("rejects a data: URL", () => {
    expect(
      safeHttpUrl("data:text/html,<script>alert(1)</script>"),
    ).toBeUndefined();
  });

  it("rejects a vbscript: URL", () => {
    expect(safeHttpUrl("vbscript:msgbox(1)")).toBeUndefined();
  });

  it("rejects a relative path", () => {
    expect(safeHttpUrl("/api/v2/pokemon/garchomp")).toBeUndefined();
  });

  it("rejects garbage input", () => {
    expect(safeHttpUrl("not a url at all")).toBeUndefined();
  });

  it("rejects undefined", () => {
    expect(safeHttpUrl(undefined)).toBeUndefined();
  });

  it("rejects an empty string", () => {
    expect(safeHttpUrl("")).toBeUndefined();
  });

  it("rejects mixed-case JaVaScRiPt: (URL lowercases the scheme, still not http/https)", () => {
    expect(safeHttpUrl("JaVaScRiPt:alert(1)")).toBeUndefined();
  });

  it("rejects a whitespace-prefixed javascript: URL (URL trims leading whitespace before parsing)", () => {
    expect(safeHttpUrl(" javascript:alert(1)")).toBeUndefined();
  });

  it("rejects a whitespace-prefixed javascript: URL with a tab/newline prefix", () => {
    expect(safeHttpUrl("\n\tjavascript:alert(1)")).toBeUndefined();
  });
});

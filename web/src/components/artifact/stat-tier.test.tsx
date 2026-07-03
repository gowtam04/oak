import { describe, expect, it } from "vitest";

import { statValueTier } from "./stat-tier";

describe("statValueTier", () => {
  it("classifies values below 60 as danger", () => {
    expect(statValueTier(0)).toBe("danger");
    expect(statValueTier(59)).toBe("danger");
  });

  it("classifies 60-89 as warning", () => {
    expect(statValueTier(60)).toBe("warning");
    expect(statValueTier(89)).toBe("warning");
  });

  it("classifies 90-119 as success", () => {
    expect(statValueTier(90)).toBe("success");
    expect(statValueTier(119)).toBe("success");
  });

  it("classifies 120 and above as azure", () => {
    expect(statValueTier(120)).toBe("azure");
    expect(statValueTier(255)).toBe("azure");
  });
});

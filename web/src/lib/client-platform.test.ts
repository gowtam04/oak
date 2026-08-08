import { describe, expect, it } from "vitest";

import {
  clientPlatformLabel,
  formatClientPlatforms,
  parseClientPlatform,
} from "./client-platform";

describe("parseClientPlatform", () => {
  it("accepts the three first-party values (case-insensitive, trimmed)", () => {
    expect(parseClientPlatform("web")).toBe("web");
    expect(parseClientPlatform("iOS")).toBe("ios");
    expect(parseClientPlatform("  ANDROID  ")).toBe("android");
  });

  it("returns null for missing, empty, or unknown values", () => {
    expect(parseClientPlatform(null)).toBeNull();
    expect(parseClientPlatform(undefined)).toBeNull();
    expect(parseClientPlatform("")).toBeNull();
    expect(parseClientPlatform("   ")).toBeNull();
    expect(parseClientPlatform("desktop")).toBeNull();
    expect(parseClientPlatform("web,ios")).toBeNull();
  });
});

describe("clientPlatformLabel", () => {
  it("maps wire values to display labels", () => {
    expect(clientPlatformLabel("web")).toBe("Web");
    expect(clientPlatformLabel("ios")).toBe("iOS");
    expect(clientPlatformLabel("android")).toBe("Android");
  });
});

describe("formatClientPlatforms", () => {
  it("returns an em dash for empty / unknown", () => {
    expect(formatClientPlatforms([])).toBe("—");
  });

  it("dedupes and orders web → iOS → Android", () => {
    expect(formatClientPlatforms(["android", "web", "ios", "web"])).toBe(
      "Web, iOS, Android",
    );
    expect(formatClientPlatforms(["ios"])).toBe("iOS");
  });
});

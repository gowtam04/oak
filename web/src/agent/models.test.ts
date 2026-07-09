/**
 * Tests for the client-safe model registry + the server-side factory:
 * key validation, fallback-to-default resolution, per-provider wiring, and
 * validate-on-use (an unconfigured provider key throws / reads unconfigured).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// activeModelKey() dynamic-imports settings-repo (which reads the DB); mock it so
// the test never dials the default DATABASE_URL. Hoisted so per-test resolves win.
const settingsRepo = vi.hoisted(() => ({
  getActiveModelKey: vi.fn<() => Promise<string>>(),
}));
vi.mock("@/data/repos/settings-repo", () => settingsRepo);

import {
  DEFAULT_MODEL_KEY,
  isModelKey,
  MODELS,
  modelLabel,
} from "@/agent/models";
import {
  activeModelKey,
  isModelConfigured,
  providerFor,
  ProviderNotConfiguredError,
  resolveModel,
} from "@/agent/providers/factory";
import { GrokProvider } from "@/agent/providers/grok-provider";

describe("model registry", () => {
  it("exposes the five models in order with stable keys (Grok 4.3 primary)", () => {
    expect(MODELS.map((m) => m.key)).toEqual([
      "grok-4.3",
      "grok-4.5",
      "claude-sonnet-5",
      "claude-sonnet-4.6",
      "gpt-5.5",
    ]);
    expect(DEFAULT_MODEL_KEY).toBe("grok-4.3");
  });

  it("isModelKey only accepts known keys", () => {
    expect(isModelKey("claude-sonnet-5")).toBe(true);
    expect(isModelKey("claude-sonnet-4.6")).toBe(true);
    expect(isModelKey("gpt-5.5")).toBe(true);
    expect(isModelKey("grok-4.3")).toBe(true);
    expect(isModelKey("grok-4.5")).toBe(true);
    // Retired key — survives only in MODEL_PRICING (legacy), no longer a valid
    // registry key.
    expect(isModelKey("claude")).toBe(false);
    expect(isModelKey("gpt-4")).toBe(false);
    expect(isModelKey(undefined)).toBe(false);
    expect(isModelKey(123)).toBe(false);
  });

  it("modelLabel returns the display label", () => {
    expect(modelLabel("claude-sonnet-5")).toBe("Claude Sonnet 5");
    expect(modelLabel("claude-sonnet-4.6")).toBe("Claude Sonnet 4.6");
    expect(modelLabel("gpt-5.5")).toBe("OpenAI GPT-5.5");
    expect(modelLabel("grok-4.3")).toBe("xAI Grok 4.3");
    expect(modelLabel("grok-4.5")).toBe("xAI Grok 4.5");
  });
});

describe("activeModelKey (repo-backed, async)", () => {
  beforeEach(() => {
    settingsRepo.getActiveModelKey.mockReset();
  });

  it("passes through the admin-selected key from settings-repo", async () => {
    settingsRepo.getActiveModelKey.mockResolvedValue("claude-sonnet-4.6");
    await expect(activeModelKey()).resolves.toBe("claude-sonnet-4.6");
  });

  it("returns the default (Grok) when the repo resolves its fail-soft default", async () => {
    // The repo already fail-softs a missing/invalid setting to DEFAULT_MODEL_KEY;
    // activeModelKey re-validates through the safe resolver.
    settingsRepo.getActiveModelKey.mockResolvedValue("grok-4.3");
    await expect(activeModelKey()).resolves.toBe("grok-4.3");
  });
});

describe("resolveModel", () => {
  it("maps each key to its provider + api model id", () => {
    expect(resolveModel("claude-sonnet-5")).toMatchObject({
      key: "claude-sonnet-5",
      provider: "anthropic",
      apiModelId: "claude-sonnet-5",
    });
    expect(resolveModel("claude-sonnet-4.6")).toMatchObject({
      key: "claude-sonnet-4.6",
      provider: "anthropic",
      apiModelId: "claude-sonnet-4-6",
    });
    expect(resolveModel("gpt-5.5")).toMatchObject({
      key: "gpt-5.5",
      provider: "openai",
      apiModelId: "gpt-5.5",
      effort: "medium",
    });
    expect(resolveModel("grok-4.3")).toMatchObject({
      key: "grok-4.3",
      provider: "xai",
      apiModelId: "grok-4.3",
      effort: "high",
    });
    expect(resolveModel("grok-4.5")).toMatchObject({
      key: "grok-4.5",
      provider: "xai",
      apiModelId: "grok-4.5",
      effort: "high",
    });
  });

  it("falls back to the default (Grok) for unknown/missing keys", () => {
    expect(resolveModel("nonsense").key).toBe("grok-4.3");
    expect(resolveModel(undefined).key).toBe("grok-4.3");
    expect(resolveModel(null).key).toBe("grok-4.3");
  });
});

describe("providerFor / isModelConfigured (validate-on-use)", () => {
  it("builds the native Grok provider for grok-4.3 (XAI_API_KEY required at boot)", () => {
    expect(isModelConfigured("grok-4.3")).toBe(true);
    const provider = providerFor("grok-4.3");
    expect(provider.kind).toBe("xai");
    expect(provider.apiModelId).toBe("grok-4.3");
    // The primary path is the dedicated native adapter, not the OpenAI shim.
    expect(provider).toBeInstanceOf(GrokProvider);
  });

  it("builds the native Grok provider for grok-4.5 (shares XAI_API_KEY)", () => {
    expect(isModelConfigured("grok-4.5")).toBe(true);
    const provider = providerFor("grok-4.5");
    expect(provider.kind).toBe("xai");
    expect(provider.apiModelId).toBe("grok-4.5");
    expect(provider).toBeInstanceOf(GrokProvider);
  });

  it("builds the Anthropic provider when its (now-optional) key is configured", () => {
    // ANTHROPIC_API_KEY is no longer required at boot, but the test runner injects
    // a dummy so Claude stays selectable — validate-on-use, like every provider.
    expect(isModelConfigured("claude-sonnet-5")).toBe(true);
    const provider = providerFor("claude-sonnet-5");
    expect(provider.kind).toBe("anthropic");
    expect(provider.apiModelId).toBe("claude-sonnet-5");
  });

  it("providerFor agrees with isModelConfigured for every provider", () => {
    // Robust regardless of whether the alternate provider keys happen to be set in
    // the environment: when unconfigured, providerFor throws the typed error;
    // when configured, it builds the provider for that kind.
    const expectedApiModelId: Record<string, string> = {
      "claude-sonnet-5": "claude-sonnet-5",
      "claude-sonnet-4.6": "claude-sonnet-4-6",
      "gpt-5.5": "gpt-5.5",
      "grok-4.3": "grok-4.3",
      "grok-4.5": "grok-4.5",
    };
    for (const key of [
      "claude-sonnet-5",
      "claude-sonnet-4.6",
      "gpt-5.5",
      "grok-4.3",
      "grok-4.5",
    ] as const) {
      if (isModelConfigured(key)) {
        const provider = providerFor(key);
        expect(["anthropic", "openai", "xai"]).toContain(provider.kind);
        expect(provider.apiModelId).toBe(expectedApiModelId[key]);
      } else {
        expect(() => providerFor(key)).toThrow(ProviderNotConfiguredError);
      }
    }
  });
});

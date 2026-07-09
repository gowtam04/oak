import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

afterEach(() => cleanup());

import SettingsView, { type SettingsViewProps } from "./SettingsView";
import type { AdminSettingsModel } from "@/lib/admin/admin-types";

// Fixtures — the GET /api/admin/settings projection. Components render
// fixtures only; no db/repos imported (admin component-test rule).
const MODELS: AdminSettingsModel[] = [
  { key: "grok-4.3", label: "xAI Grok 4.3", provider: "xai", configured: true },
  {
    key: "claude-sonnet-5",
    label: "Claude Sonnet 5",
    provider: "anthropic",
    configured: true,
  },
  {
    key: "claude-sonnet-4.6",
    label: "Claude Sonnet 4.6",
    provider: "anthropic",
    configured: true,
  },
  {
    key: "gpt-5.5",
    label: "OpenAI GPT-5.5",
    provider: "openai",
    configured: false,
  },
];

function renderView(overrides: Partial<SettingsViewProps> = {}) {
  const props: SettingsViewProps = {
    activeModel: "grok-4.3",
    source: "default",
    models: MODELS,
    updatedBy: null,
    updatedAt: null,
    onSelect: vi.fn(),
    ...overrides,
  };
  render(<SettingsView {...props} />);
  return props;
}

describe("SettingsView", () => {
  it("renders all four models", () => {
    renderView();
    expect(screen.getByTestId("settings-model-grok-4.3")).toBeInTheDocument();
    expect(
      screen.getByTestId("settings-model-claude-sonnet-5"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("settings-model-claude-sonnet-4.6"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("settings-model-gpt-5.5")).toBeInTheDocument();
  });

  it("checks the active model only", () => {
    renderView({ activeModel: "claude-sonnet-5" });
    expect(
      (screen.getByTestId("settings-model-claude-sonnet-5") as HTMLInputElement)
        .checked,
    ).toBe(true);
    expect(
      (screen.getByTestId("settings-model-grok-4.3") as HTMLInputElement)
        .checked,
    ).toBe(false);
  });

  it("disables an unconfigured model and never calls onSelect when clicked", () => {
    const props = renderView();
    const gpt = screen.getByTestId("settings-model-gpt-5.5") as HTMLInputElement;
    expect(gpt.disabled).toBe(true);
    fireEvent.click(gpt);
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it("calls onSelect with the key when a configured, non-active model is clicked", () => {
    const props = renderView({ activeModel: "grok-4.3" });
    fireEvent.click(screen.getByTestId("settings-model-claude-sonnet-5"));
    expect(props.onSelect).toHaveBeenCalledWith("claude-sonnet-5");
  });

  it("shows the audit line for a db-sourced selection", () => {
    renderView({
      source: "db",
      updatedBy: "owner@oak.test",
      updatedAt: Date.UTC(2026, 5, 1, 12, 0),
    });
    expect(screen.getByTestId("settings-audit")).toHaveTextContent(
      "Last changed by owner@oak.test",
    );
  });

  it("shows the default hint when no operator selection is stored", () => {
    renderView({ source: "default", updatedBy: null, updatedAt: null });
    expect(screen.getByTestId("settings-audit")).toHaveTextContent(
      "Default — no operator selection yet.",
    );
  });

  it("renders an error banner when an error is provided", () => {
    renderView({ error: "Failed to load settings." });
    expect(screen.getByTestId("settings-error")).toHaveTextContent(
      "Failed to load settings.",
    );
  });

  it("disables every option while pending", () => {
    renderView({ pending: true });
    for (const m of MODELS.filter((mm) => mm.configured)) {
      expect(
        (screen.getByTestId(`settings-model-${m.key}`) as HTMLInputElement)
          .disabled,
      ).toBe(true);
    }
  });
});

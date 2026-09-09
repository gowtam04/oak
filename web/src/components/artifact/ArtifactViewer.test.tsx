/**
 * B-4 Phase 5 — panel shell. Renders ArtifactViewer inside the provider and
 * drives the captured API: hidden when closed; loading → ok (dispatches to the
 * right renderer + grounding chrome); not_found / unavailable / error states;
 * structured (payload-derived) dispatch; back + close controls; Esc closes.
 * The entity-client is mocked so there is no network.
 */

import type { ComponentType } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, act, waitFor, fireEvent, cleanup } from "@testing-library/react";

vi.mock("@/lib/api/entity-client", () => ({ fetchEntityArtifact: vi.fn() }));

const { createPinnedArtifact } = vi.hoisted(() => ({
  createPinnedArtifact: vi.fn(),
}));
vi.mock("@/lib/api/artifact-pin-client", () => ({
  createPinnedArtifact,
  listPinnedArtifacts: vi.fn().mockResolvedValue([]),
  deletePinnedArtifact: vi.fn(),
  getPinnedArtifact: vi.fn(),
}));

import { fetchEntityArtifact } from "@/lib/api/entity-client";
import { DAMAGE_CALC_GARCHOMP, SUBJECT_GARCHOMP } from "@/components/test-fixtures";

import { ArtifactViewerProvider } from "./ArtifactViewerProvider";
import ArtifactViewer from "./ArtifactViewer";
import { useArtifactViewer } from "./useArtifactViewer";
import type { ArtifactViewerApi } from "./types";
import {
  ABILITY_ARTIFACT,
  ITEM_ARTIFACT,
  MOVE_ARTIFACT,
  NOT_FOUND_ARTIFACT,
  POKEMON_ARTIFACT,
  POKEMON_ARTIFACT_ND_FALLBACK,
  TYPE_ARTIFACT,
  UNAVAILABLE_ARTIFACT,
} from "./artifact-fixtures";

let api: ArtifactViewerApi;
function Capture() {
  api = useArtifactViewer();
  return null;
}

function mount() {
  return render(
    <ArtifactViewerProvider format="scarlet-violet">
      <Capture />
      <ArtifactViewer />
    </ArtifactViewerProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ArtifactViewer — visibility + ok dispatch", () => {
  it("renders nothing until something is open", () => {
    mount();
    expect(screen.queryByTestId("artifact-viewer")).toBeNull();
  });

  it("shows loading, then dispatches an ok pokemon to PokemonArtifact with grounding", async () => {
    let resolveFetch: (r: typeof POKEMON_ARTIFACT) => void = () => {};
    vi.mocked(fetchEntityArtifact).mockReturnValue(
      new Promise((r) => {
        resolveFetch = r;
      }),
    );
    mount();

    act(() => api.openEntity({ kind: "pokemon", q: "garchomp" }));
    expect(screen.getByTestId("artifact-viewer")).toBeInTheDocument();
    expect(screen.getByTestId("artifact-loading")).toBeInTheDocument();

    await act(async () => {
      resolveFetch(POKEMON_ARTIFACT);
    });
    expect(screen.getByTestId("pokemon-artifact")).toBeInTheDocument();
    expect(screen.getByTestId("artifact-title")).toHaveTextContent("Garchomp");
    expect(screen.getByTestId("artifact-format-tag")).toHaveTextContent(
      "Scarlet/Violet",
    );
    // Grounding footer (citations) is present.
    expect(screen.getByTestId("artifact-sources")).toBeInTheDocument();
    // Specimen plate wash from species types (Phase 2).
    const panel = screen.getByTestId("artifact-viewer");
    expect(panel.getAttribute("data-plate")).toBe("typed");
    expect(panel.style.getPropertyValue("--plate-a")).toBe(
      "var(--type-dragon)",
    );
    expect(panel.style.getPropertyValue("--plate-b")).toBe(
      "var(--type-ground)",
    );
  });

  it("uses an ink plate while loading (no types yet)", () => {
    vi.mocked(fetchEntityArtifact).mockReturnValue(new Promise(() => {}));
    mount();
    act(() => api.openEntity({ kind: "pokemon", q: "garchomp" }));
    const panel = screen.getByTestId("artifact-viewer");
    expect(panel.getAttribute("data-plate")).toBe("ink");
    expect(panel.className).toContain("answer-card--ink");
  });
});

describe("ArtifactViewer — format tag exhaustiveness", () => {
  it("renders the National Dex format tag while loading (national-dex scope)", () => {
    vi.mocked(fetchEntityArtifact).mockReturnValue(new Promise(() => {}));
    render(
      <ArtifactViewerProvider format="national-dex">
        <Capture />
        <ArtifactViewer />
      </ArtifactViewerProvider>,
    );
    act(() => api.openEntity({ kind: "pokemon", q: "garchomp" }));
    expect(screen.getByTestId("artifact-format-tag")).toHaveTextContent(
      "National Dex",
    );
  });

  it("renders a mainline gen format tag while loading (gen-1 scope)", () => {
    vi.mocked(fetchEntityArtifact).mockReturnValue(new Promise(() => {}));
    render(
      <ArtifactViewerProvider format="gen-1">
        <Capture />
        <ArtifactViewer />
      </ArtifactViewerProvider>,
    );
    act(() => api.openEntity({ kind: "pokemon", q: "clefairy" }));
    expect(screen.getByTestId("artifact-format-tag")).toHaveTextContent(
      "Gen 1",
    );
  });
});

describe("ArtifactViewer — honest states", () => {
  it("renders the not_found state with suggestions", async () => {
    vi.mocked(fetchEntityArtifact).mockResolvedValue(NOT_FOUND_ARTIFACT);
    mount();
    act(() => api.openEntity({ kind: "pokemon", q: "garchom" }));
    await waitFor(() =>
      expect(screen.getByTestId("artifact-not-found")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("artifact-not-found")).toHaveTextContent(
      "Garchomp",
    );
  });

  it("renders the unavailable state", async () => {
    vi.mocked(fetchEntityArtifact).mockResolvedValue(UNAVAILABLE_ARTIFACT);
    mount();
    act(() => api.openEntity({ kind: "pokemon", q: "garchomp" }));
    await waitFor(() =>
      expect(screen.getByTestId("artifact-unavailable")).toBeInTheDocument(),
    );
  });

  it("renders the error state on a transport fault", async () => {
    vi.mocked(fetchEntityArtifact).mockResolvedValue(null);
    mount();
    act(() => api.openEntity({ kind: "move", q: "earthquake" }));
    await waitFor(() =>
      expect(screen.getByTestId("artifact-error")).toBeInTheDocument(),
    );
  });
});

describe("ArtifactViewer — National-Dex fallback (#2)", () => {
  it("renders the fallback banner naming the requested scope for a source_format ok payload", async () => {
    vi.mocked(fetchEntityArtifact).mockResolvedValue(POKEMON_ARTIFACT_ND_FALLBACK);
    render(
      <ArtifactViewerProvider format="gen-6">
        <Capture />
        <ArtifactViewer />
      </ArtifactViewerProvider>,
    );
    await act(async () => {
      api.openEntity({ kind: "pokemon", q: "eternatus" });
    });
    const banner = await screen.findByTestId("caveat-fallback");
    expect(banner).toHaveTextContent("Not found in Gen 6");
    expect(banner).toHaveTextContent("showing National Dex data");
    // The species itself still renders below the banner.
    expect(screen.getByTestId("pokemon-artifact")).toBeInTheDocument();
  });

  it("makes not_found suggestions clickable, firing a fresh entity fetch", async () => {
    vi.mocked(fetchEntityArtifact).mockResolvedValue(NOT_FOUND_ARTIFACT);
    mount();
    await act(async () => {
      api.openEntity({ kind: "pokemon", q: "garchom" });
    });
    await waitFor(() =>
      expect(screen.getByTestId("artifact-not-found")).toBeInTheDocument(),
    );

    const suggestion = screen.getByTestId("artifact-suggestion");
    expect(suggestion).toHaveTextContent("Garchomp");

    vi.mocked(fetchEntityArtifact).mockClear();
    await act(async () => {
      fireEvent.click(suggestion);
    });
    // Clicking re-opens as the suggested entity → a new fetch for that name.
    expect(fetchEntityArtifact).toHaveBeenCalledWith(
      "pokemon",
      "Garchomp",
      "scarlet-violet",
    );
  });
});

describe("ArtifactViewer — structured + controls", () => {
  it("dispatches a structured damage-calc from payload (no fetch)", () => {
    mount();
    act(() =>
      api.openStructured({
        kind: "damage-calc",
        damageCalc: DAMAGE_CALC_GARCHOMP,
      }),
    );
    expect(fetchEntityArtifact).not.toHaveBeenCalled();
    expect(screen.getByTestId("damage-calc-artifact")).toBeInTheDocument();
    expect(screen.getByTestId("artifact-title")).toHaveTextContent(
      "Damage calculation",
    );
  });

  it("shows back only after a drill-down, and back returns to the prior artifact", async () => {
    vi.mocked(fetchEntityArtifact).mockResolvedValue(MOVE_ARTIFACT);
    mount();

    await act(async () => {
      api.openEntity({ kind: "move", q: "earthquake" });
    });
    expect(screen.queryByTestId("artifact-back")).toBeNull();

    vi.mocked(fetchEntityArtifact).mockResolvedValue(POKEMON_ARTIFACT);
    await act(async () => {
      api.openEntity({ kind: "pokemon", q: "garchomp" });
    });
    expect(screen.getByTestId("artifact-back")).toBeInTheDocument();
    expect(screen.getByTestId("artifact-title")).toHaveTextContent("Garchomp");

    fireEvent.click(screen.getByTestId("artifact-back"));
    await waitFor(() =>
      expect(screen.getByTestId("artifact-title")).toHaveTextContent(
        "Earthquake",
      ),
    );
  });

  it("close dismisses the viewer; Esc also closes", async () => {
    vi.mocked(fetchEntityArtifact).mockResolvedValue(POKEMON_ARTIFACT);
    mount();

    await act(async () => {
      api.openEntity({ kind: "pokemon", q: "garchomp" });
    });

    fireEvent.click(screen.getByTestId("artifact-close"));
    expect(screen.queryByTestId("artifact-viewer")).toBeNull();

    // Re-open then close via Escape.
    await act(async () => {
      api.openEntity({ kind: "pokemon", q: "garchomp" });
    });
    expect(screen.getByTestId("artifact-viewer")).toBeInTheDocument();
    act(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(screen.queryByTestId("artifact-viewer")).toBeNull();
  });
});

/**
 * P6 — header verbs: Open in Dex (four kinds only), Compare with…, Pin
 * (rich artifacts, signed-in), Add to team (Pokémon, signed-in).
 *
 * Extra props (`signedIn`, `conversationId`, `onPinCap`) are passed at
 * runtime before ArtifactViewer declares them.
 *
 * Requirement refs: DEX-US-1, DEX-AC-1.1–1.4, DEX-BR-2, CMP-US-1,
 * PIN-US-1, PIN-AC-1.1–1.4, PIN-AC-3.1, ADD-US-1, AUTH-BR-1.
 */
type ViewerP6Props = {
  signedIn?: boolean;
  conversationId?: string;
};

function mountP6(over: ViewerP6Props = {}) {
  const Viewer = ArtifactViewer as unknown as ComponentType<ViewerP6Props>;
  return render(
    <ArtifactViewerProvider format="scarlet-violet">
      <Capture />
      <Viewer signedIn={over.signedIn} conversationId={over.conversationId} />
    </ArtifactViewerProvider>,
  );
}

async function openOk(artifact: typeof POKEMON_ARTIFACT | typeof MOVE_ARTIFACT | typeof ABILITY_ARTIFACT | typeof ITEM_ARTIFACT | typeof TYPE_ARTIFACT) {
  vi.mocked(fetchEntityArtifact).mockResolvedValue(artifact);
  await act(async () => {
    api.openEntity({ kind: artifact.kind, q: artifact.resolved.slug });
  });
}

describe("ArtifactViewer — Open in Dex (DEX-US-1, DEX-BR-2)", () => {
  it("opens the Pokémon Dex profile with the artifact format (DEX-AC-1.1, DEX-AC-2.1)", async () => {
    mountP6();
    await openOk(POKEMON_ARTIFACT);
    const dex = screen.getByRole("link", { name: /open in dex/i });
    expect(dex).toHaveAttribute("href", "/pokedex/garchomp?format=scarlet-violet");
  });

  it("opens move / ability / item Dex pages with ?format= (DEX-AC-1.1, DEX-BR-2)", async () => {
    mountP6();
    await openOk(MOVE_ARTIFACT);
    expect(screen.getByRole("link", { name: /open in dex/i })).toHaveAttribute(
      "href",
      "/moves/earthquake?format=scarlet-violet",
    );

    await act(async () => {
      api.close();
    });
    await openOk(ABILITY_ARTIFACT);
    expect(screen.getByRole("link", { name: /open in dex/i })).toHaveAttribute(
      "href",
      "/abilities/rough-skin?format=scarlet-violet",
    );

    await act(async () => {
      api.close();
    });
    await openOk(ITEM_ARTIFACT);
    expect(screen.getByRole("link", { name: /open in dex/i })).toHaveAttribute(
      "href",
      "/items/leftovers?format=scarlet-violet",
    );
  });

  it("does not offer Open in Dex on a type artifact (DEX-AC-1.3, DEX-BR-2)", async () => {
    mountP6();
    await openOk(TYPE_ARTIFACT);
    expect(screen.getByTestId("artifact-viewer")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /open in dex/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /open in dex/i })).toBeNull();
  });

  it("is available to guests on the four kinds (DEX-AC-1.4)", async () => {
    mountP6({ signedIn: false });
    await openOk(POKEMON_ARTIFACT);
    expect(screen.getByRole("link", { name: /open in dex/i })).toBeInTheDocument();
  });
});

describe("ArtifactViewer — Compare with… (CMP-US-1)", () => {
  it("offers Compare with… on a Pokémon artifact (CMP-AC-1.1)", async () => {
    mountP6();
    await openOk(POKEMON_ARTIFACT);
    expect(
      screen.getByRole("button", { name: /compare with/i }),
    ).toBeInTheDocument();
  });

  it("does not offer Compare with… on type / move / ability / item", async () => {
    mountP6();
    await openOk(TYPE_ARTIFACT);
    expect(screen.queryByRole("button", { name: /compare with/i })).toBeNull();
    await act(async () => {
      api.close();
    });
    await openOk(MOVE_ARTIFACT);
    expect(screen.queryByRole("button", { name: /compare with/i })).toBeNull();
  });
});

describe("ArtifactViewer — Pin (PIN-US-1, AUTH-BR-1)", () => {
  it("shows Pin on team / comparison / calc when signed in (PIN-AC-1.1)", async () => {
    mountP6({ signedIn: true, conversationId: "conv-1" });
    act(() =>
      api.openStructured({
        kind: "damage-calc",
        damageCalc: DAMAGE_CALC_GARCHOMP,
      }),
    );
    expect(screen.getByRole("button", { name: /^pin$/i })).toBeInTheDocument();

    await act(async () => {
      api.close();
    });
    act(() =>
      api.openStructured({
        kind: "comparison",
        subjects: [SUBJECT_GARCHOMP],
      }),
    );
    expect(screen.getByRole("button", { name: /^pin$/i })).toBeInTheDocument();

    await act(async () => {
      api.close();
    });
    act(() =>
      api.openTeam({
        team: {
          name: "Rain",
          format: "scarlet-violet",
          members: [],
        },
      }),
    );
    expect(screen.getByRole("button", { name: /^pin$/i })).toBeInTheDocument();
  });

  it("has no Pin on entity artifacts (PIN-AC-1.2)", async () => {
    mountP6({ signedIn: true, conversationId: "conv-1" });
    await openOk(POKEMON_ARTIFACT);
    expect(screen.queryByRole("button", { name: /^pin$/i })).toBeNull();
    await act(async () => {
      api.close();
    });
    await openOk(MOVE_ARTIFACT);
    expect(screen.queryByRole("button", { name: /^pin$/i })).toBeNull();
    await act(async () => {
      api.close();
    });
    await openOk(TYPE_ARTIFACT);
    expect(screen.queryByRole("button", { name: /^pin$/i })).toBeNull();
  });

  it("hides Pin for guests — absent, not disabled (PIN-AC-1.4, AUTH-BR-1)", () => {
    mountP6({ signedIn: false, conversationId: "conv-1" });
    act(() =>
      api.openStructured({
        kind: "damage-calc",
        damageCalc: DAMAGE_CALC_GARCHOMP,
      }),
    );
    expect(screen.queryByRole("button", { name: /^pin$/i })).toBeNull();
    expect(screen.queryByText(/^pin$/i)).toBeNull();
  });

  it("explains the 5-pin cap instead of replacing an existing pin (PIN-AC-3.1)", async () => {
    createPinnedArtifact.mockResolvedValue({
      ok: false,
      error: "pin_cap",
      max: 5,
    });
    mountP6({ signedIn: true, conversationId: "conv-1" });
    act(() =>
      api.openStructured({
        kind: "damage-calc",
        damageCalc: DAMAGE_CALC_GARCHOMP,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: /^pin$/i }));
    expect(await screen.findByTestId("pin-cap-message")).toHaveTextContent(
      /5|five/i,
    );
  });
});

describe("ArtifactViewer — Add to team on Pokémon (ADD-US-1, AUTH-BR-1)", () => {
  it("shows Add to team on a Pokémon artifact when signed in (ADD-AC-1.1)", async () => {
    mountP6({ signedIn: true });
    await openOk(POKEMON_ARTIFACT);
    expect(
      screen.getByRole("button", { name: /add to team/i }),
    ).toBeInTheDocument();
  });

  it("hides Add to team for guests — absent, not disabled (ADD-AC-1.2, AUTH-BR-1)", async () => {
    mountP6({ signedIn: false });
    await openOk(POKEMON_ARTIFACT);
    expect(screen.queryByRole("button", { name: /add to team/i })).toBeNull();
    expect(screen.queryByText(/add to team/i)).toBeNull();
  });

  it("does not put Add to team on move / type artifacts", async () => {
    mountP6({ signedIn: true });
    await openOk(MOVE_ARTIFACT);
    expect(screen.queryByRole("button", { name: /add to team/i })).toBeNull();
  });
});

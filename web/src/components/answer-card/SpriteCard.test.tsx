import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

// Spy on the artifact viewer: the sprite (and name) open the Pokémon's artifact.
const { openEntity } = vi.hoisted(() => ({ openEntity: vi.fn() }));
vi.mock("@/components/artifact/useArtifactViewer", () => ({
  useArtifactViewer: () => ({
    isOpen: false,
    current: null,
    canGoBack: false,
    openEntity,
    openStructured: () => {},
    openTeam: () => {},
    back: () => {},
    close: () => {},
  }),
}));

afterEach(() => {
  cleanup();
  openEntity.mockClear();
});
import type { ComponentProps } from "react";
import SpriteCard from "./SpriteCard";
import { SUBJECT_GARCHOMP, SUBJECT_MEWTWO_FALLBACK } from "@/components/test-fixtures";

type SpriteCardP6Props = ComponentProps<typeof SpriteCard> & {
  signedIn?: boolean;
};

function renderSprite(over: SpriteCardP6Props) {
  render(<SpriteCard {...(over as ComponentProps<typeof SpriteCard>)} />);
}

describe("SpriteCard", () => {
  describe("normal (non-fallback) subject", () => {
    it("renders the subject name", () => {
      render(<SpriteCard subject={SUBJECT_GARCHOMP} />);
      expect(screen.getByText(/Garchomp/)).toBeInTheDocument();
    });

    it("renders the dex number when present", () => {
      render(<SpriteCard subject={SUBJECT_GARCHOMP} />);
      expect(screen.getByText(/#445/)).toBeInTheDocument();
    });

    it("renders the sprite image with alt text", () => {
      render(<SpriteCard subject={SUBJECT_GARCHOMP} />);
      const img = screen.getByRole("img", { name: "Garchomp" });
      expect(img).toHaveAttribute("src", SUBJECT_GARCHOMP.sprite_url);
    });

    it("opens the Pokémon's artifact when the sprite is clicked", () => {
      render(<SpriteCard subject={SUBJECT_GARCHOMP} />);
      fireEvent.click(screen.getByTestId("sprite-card-sprite-link"));
      expect(openEntity).toHaveBeenCalledWith({
        kind: "pokemon",
        q: SUBJECT_GARCHOMP.name,
      });
    });

    it("renders a TypeBadge for each type", () => {
      render(<SpriteCard subject={SUBJECT_GARCHOMP} />);
      expect(screen.getByTestId("type-badge-dragon")).toBeInTheDocument();
      expect(screen.getByTestId("type-badge-ground")).toBeInTheDocument();
    });

    it("does not show a fallback badge when is_fallback=false", () => {
      render(<SpriteCard subject={SUBJECT_GARCHOMP} />);
      expect(
        screen.queryByTestId("sprite-card-fallback"),
      ).not.toBeInTheDocument();
    });
  });

  describe("fallback subject (pre-Gen 9 data)", () => {
    it("shows the fallback badge when is_fallback=true", () => {
      render(<SpriteCard subject={SUBJECT_MEWTWO_FALLBACK} />);
      expect(screen.getByTestId("sprite-card-fallback")).toBeInTheDocument();
    });

    it("shows the source_generation in the fallback badge", () => {
      render(<SpriteCard subject={SUBJECT_MEWTWO_FALLBACK} />);
      expect(screen.getByTestId("sprite-card-fallback")).toHaveTextContent(
        "gen-1",
      );
    });

    it("renders the type badge for a mono-type Pokémon", () => {
      render(<SpriteCard subject={SUBJECT_MEWTWO_FALLBACK} />);
      expect(screen.getByTestId("type-badge-psychic")).toBeInTheDocument();
    });
  });

  it("renders without dex_number when omitted", () => {
    const subjectNoDex = { ...SUBJECT_GARCHOMP, dex_number: undefined };
    render(<SpriteCard subject={subjectNoDex} />);
    // Name is present, but no #N text
    expect(screen.getByText(/Garchomp/)).toBeInTheDocument();
    expect(screen.queryByText(/#/)).not.toBeInTheDocument();
  });

  it("does not render a javascript: sprite_url as an img src, falling back to the dex-number art (FE-02)", () => {
    const maliciousSubject = {
      ...SUBJECT_GARCHOMP,
      sprite_url: "javascript:alert(1)",
    };
    render(<SpriteCard subject={maliciousSubject} />);
    const img = screen.getByRole("img", { name: "Garchomp" });
    expect(img.getAttribute("src")).not.toMatch(/^javascript:/);
  });
});

describe("SpriteCard — Add to team (ADD-US-1, AUTH-BR-1)", () => {
  it("shows Add to team when signed in (ADD-AC-1.1)", () => {
    renderSprite({ subject: SUBJECT_GARCHOMP, signedIn: true });
    expect(
      screen.getByRole("button", { name: /add to team/i }),
    ).toBeInTheDocument();
  });

  it("hides Add to team for guests — absent, not disabled (ADD-AC-1.2, AUTH-BR-1)", () => {
    renderSprite({ subject: SUBJECT_GARCHOMP, signedIn: false });
    expect(screen.queryByRole("button", { name: /add to team/i })).toBeNull();
    expect(screen.queryByText(/add to team/i)).toBeNull();
  });

  it("does not put Open in Dex on the sprite card (DEX-AC-1.2)", () => {
    renderSprite({ subject: SUBJECT_GARCHOMP, signedIn: true });
    expect(screen.queryByRole("link", { name: /open in dex/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /open in dex/i })).toBeNull();
  });
});

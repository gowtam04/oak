import { afterEach, describe, expect, it } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

import { SITE_ORIGIN } from "@/lib/site";

import SpriteImg from "./SpriteImg";

afterEach(cleanup);

// Legacy third-party URLs — SpriteImg must rewrite these onto Oak media.
const SRC = "https://play.pokemonshowdown.com/sprites/ani/dragonite-mega.gif";
const FALLBACK =
  "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/149.png";
const REWRITTEN_SRC = `${SITE_ORIGIN}/api/media/sprite/dragonite-mega`;
const REWRITTEN_FALLBACK = `${SITE_ORIGIN}/api/media/dex-sprite/149`;

describe("SpriteImg", () => {
  it("rewrites legacy Showdown src onto the Oak media proxy", () => {
    render(<SpriteImg src={SRC} fallbackSrc={FALLBACK} alt="Dragonite (Mega)" />);
    expect(screen.getByRole("img")).toHaveAttribute("src", REWRITTEN_SRC);
  });

  it("swaps to the rewritten fallbackSrc on the first error", () => {
    render(<SpriteImg src={SRC} fallbackSrc={FALLBACK} alt="Dragonite (Mega)" />);
    const img = screen.getByRole("img");
    fireEvent.error(img);
    expect(img).toHaveAttribute("src", REWRITTEN_FALLBACK);
  });

  it("does not loop when the fallback also errors", () => {
    render(<SpriteImg src={SRC} fallbackSrc={FALLBACK} alt="x" />);
    const img = screen.getByRole("img");
    fireEvent.error(img); // src → fallback
    fireEvent.error(img); // fallback also fails
    expect(img).toHaveAttribute("src", REWRITTEN_FALLBACK); // stays put
  });

  it("leaves a failed rewritten src in place when no fallback is given", () => {
    render(<SpriteImg src={SRC} alt="x" />);
    const img = screen.getByRole("img");
    fireEvent.error(img);
    expect(img).toHaveAttribute("src", REWRITTEN_SRC);
  });

  it("does not render a javascript: src as the img src (FE-02)", () => {
    const { container } = render(
      <SpriteImg src="javascript:alert(1)" alt="x" />,
    );
    expect(container.querySelector("img")).not.toBeInTheDocument();
  });

  it("falls through to a safe rewritten fallbackSrc when the primary src is unsafe", () => {
    render(<SpriteImg src="javascript:alert(1)" fallbackSrc={FALLBACK} alt="x" />);
    expect(screen.getByRole("img")).toHaveAttribute("src", REWRITTEN_FALLBACK);
  });

  it("renders nothing when both src and fallbackSrc are unsafe", () => {
    const { container } = render(
      <SpriteImg
        src="javascript:alert(1)"
        fallbackSrc="data:text/html,<script>alert(1)</script>"
        alt="x"
      />,
    );
    expect(container.querySelector("img")).not.toBeInTheDocument();
  });
});

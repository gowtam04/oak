/**
 * Pokémon artifact Usage tab — full species drill-in from GET /api/usage/:slug.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";

vi.mock("@/lib/api/usage-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/usage-client")>(
    "@/lib/api/usage-client",
  );
  return {
    ...actual,
    fetchUsageSpecies: vi.fn(),
  };
});

import { fetchUsageSpecies } from "@/lib/api/usage-client";
import PokemonUsagePanel from "./PokemonUsagePanel";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const found = {
  available: true as const,
  found: true as const,
  slug: "garchomp",
  saved_name: "Garchomp",
  attribution: "championsbattledata.com — community",
  season: "Current",
  fetched_at: 1_700_000_000_000,
  format: "doubles",
  moves: [{ name: "Earthquake", pct: 90.3, rank: 1 }],
  items: [{ name: "Life Orb", pct: 41.5, rank: 1 }],
  abilities: [{ name: "Rough Skin", pct: 100, rank: 1 }],
  natures: [{ name: "Jolly", pct: 73.4, rank: 1 }],
  spreads: [{ name: "32/0/0/0/2/32", pct: 31, rank: 1 }],
  teammates: [{ name: "Farigiraf", pct: 28.6, rank: 1 }],
  source_url: "https://example.test",
};

describe("PokemonUsagePanel", () => {
  it("renders the six usage lists, set, and apply from a found payload", async () => {
    vi.mocked(fetchUsageSpecies).mockResolvedValue(found);
    render(<PokemonUsagePanel slug="garchomp" />);

    await waitFor(() => {
      expect(screen.getByText("Earthquake")).toBeInTheDocument();
    });
    expect(screen.getByText("Life Orb")).toBeInTheDocument();
    expect(screen.getByText("Rough Skin")).toBeInTheDocument();
    expect(screen.getByText("Jolly")).toBeInTheDocument();
    expect(screen.getByText("32/0/0/0/2/32")).toBeInTheDocument();
    expect(screen.getByText("Farigiraf")).toBeInTheDocument();
    expect(screen.getByText("90.3%")).toBeInTheDocument();
    expect(screen.getByTestId("copy-showdown-set")).toBeInTheDocument();
    expect(screen.getByTestId("apply-usage-set")).toBeInTheDocument();
    expect(fetchUsageSpecies).toHaveBeenCalledWith("garchomp", "doubles");
  });

  it("refetches when switching to Singles", async () => {
    vi.mocked(fetchUsageSpecies).mockResolvedValue(found);
    render(<PokemonUsagePanel slug="garchomp" />);
    await waitFor(() => screen.getByText("Earthquake"));

    fireEvent.click(screen.getByTestId("pokemon-usage-ladder-singles"));
    await waitFor(() => {
      expect(fetchUsageSpecies).toHaveBeenCalledWith("garchomp", "singles");
    });
  });

  it("shows the unavailable copy when the ladder is down", async () => {
    vi.mocked(fetchUsageSpecies).mockResolvedValue({
      available: false,
      error: "upstream_unavailable",
    });
    render(<PokemonUsagePanel slug="garchomp" />);
    await waitFor(() => {
      expect(screen.getByTestId("pokemon-usage-unavailable")).toBeInTheDocument();
    });
    expect(screen.queryByText("Earthquake")).not.toBeInTheDocument();
  });

  it("shows not-listed copy when no set exists", async () => {
    vi.mocked(fetchUsageSpecies).mockResolvedValue({
      available: true,
      found: false,
      suggestions: ["Garchomp"],
    });
    render(<PokemonUsagePanel slug="missingno" />);
    await waitFor(() => {
      expect(screen.getByTestId("pokemon-usage-not-found")).toHaveTextContent(
        "Garchomp",
      );
    });
  });
});

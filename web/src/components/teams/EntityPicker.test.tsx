import { afterEach, describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";

const search = vi.hoisted(() => ({ searchEntities: vi.fn() }));
vi.mock("@/lib/api/search-client", () => search);

import EntityPicker from "./EntityPicker";
import { NATURE_OPTIONS } from "./dex-constants";

afterEach(() => {
  cleanup();
  search.searchEntities.mockReset();
});

describe("EntityPicker", () => {
  it("commits raw typed text via onChange (preserves free-text contract)", () => {
    const onChange = vi.fn();
    search.searchEntities.mockResolvedValue([]);
    render(
      <EntityPicker
        kind="pokemon"
        format="scarlet-violet"
        value=""
        onChange={onChange}
        testid="member-0-species"
      />,
    );
    fireEvent.change(screen.getByTestId("member-0-species"), {
      target: { value: "dragapult" },
    });
    expect(onChange).toHaveBeenLastCalledWith("dragapult");
  });

  it("shows network suggestions and selects a slug on click", async () => {
    const onChange = vi.fn();
    search.searchEntities.mockResolvedValue([
      { slug: "garchomp", display_name: "Garchomp", kind: "pokemon" },
    ]);
    render(
      <EntityPicker
        kind="pokemon"
        format="scarlet-violet"
        value=""
        onChange={onChange}
        testid="member-0-species"
      />,
    );
    fireEvent.change(screen.getByTestId("member-0-species"), {
      target: { value: "garch" },
    });
    const option = await screen.findByText("Garchomp");
    fireEvent.mouseDown(option);
    expect(onChange).toHaveBeenLastCalledWith("garchomp");
  });

  it("filters a static option list locally and selects via keyboard", () => {
    const onChange = vi.fn();
    render(
      <EntityPicker
        options={NATURE_OPTIONS}
        format="scarlet-violet"
        value=""
        onChange={onChange}
        testid="member-0-nature"
      />,
    );
    const input = screen.getByTestId("member-0-nature");
    fireEvent.change(input, { target: { value: "jol" } });
    expect(screen.getByText("Jolly")).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith("jolly");
    // The static list never calls the network.
    expect(search.searchEntities).not.toHaveBeenCalled();
  });

  it("does not query the network for a blank query", async () => {
    render(
      <EntityPicker
        kind="item"
        format="scarlet-violet"
        value=""
        onChange={vi.fn()}
        testid="member-0-item"
      />,
    );
    fireEvent.focus(screen.getByTestId("member-0-item"));
    await waitFor(() => {
      expect(search.searchEntities).not.toHaveBeenCalled();
    });
  });
});

import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
import CopyShowdownSet from "./CopyShowdownSet";

const EXPORT_TEXT = `Gholdengo @ Choice Scarf
Ability: Good as Gold
EVs: 252 SpA / 4 SpD / 252 Spe
Timid Nature
- Make It Rain
- Shadow Ball
- Nasty Plot
- Recover`;

function mockClipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });
  return writeText;
}

describe("CopyShowdownSet", () => {
  it("renders the export text in a pre block", () => {
    render(<CopyShowdownSet exportText={EXPORT_TEXT} />);
    expect(screen.getByTestId("copy-showdown-set-text")).toHaveTextContent(
      "Gholdengo @ Choice Scarf",
    );
  });

  it("uses the default label when none is given", () => {
    render(<CopyShowdownSet exportText={EXPORT_TEXT} />);
    expect(screen.getByRole("button", { name: "Copy set" })).toBeInTheDocument();
  });

  it("uses a custom label when given", () => {
    render(<CopyShowdownSet exportText={EXPORT_TEXT} label="Copy this set" />);
    expect(
      screen.getByRole("button", { name: "Copy this set" }),
    ).toBeInTheDocument();
  });

  it("copies the export text and shows a transient Copied! confirmation", async () => {
    const writeText = mockClipboard();
    render(<CopyShowdownSet exportText={EXPORT_TEXT} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy set" }));

    expect(writeText).toHaveBeenCalledWith(EXPORT_TEXT);
    expect(await screen.findByText("Copied!")).toBeInTheDocument();
  });
});

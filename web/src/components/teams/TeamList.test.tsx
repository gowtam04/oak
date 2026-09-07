import { afterEach, describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  within,
} from "@testing-library/react";

import TeamList from "./TeamList";
import type { TeamSummary } from "@/lib/api/teams-client";

afterEach(() => cleanup());

const TEAMS: TeamSummary[] = [
  {
    id: "t1",
    name: "Rain Offense",
    format: "champions",
    memberCount: 6,
    incomplete: false,
    updatedAt: 2,
  },
  {
    id: "t2",
    name: "Draft WIP",
    format: "champions",
    memberCount: 3,
    incomplete: true,
    updatedAt: 1,
  },
];

const ARCHIVED: TeamSummary[] = [
  {
    id: "old-gen7",
    name: "Gen 7 rain",
    format: "gen-7",
    memberCount: 6,
    incomplete: false,
    updatedAt: 3,
  },
  {
    id: "old-sv",
    name: "Old SV core",
    format: "scarlet-violet",
    memberCount: 4,
    incomplete: true,
    updatedAt: 2,
  },
];

/**
 * P6b archive list is a separate section. The page fetches living via GET
 * `/api/teams` and archived via `?archived=1`, then passes `archivedTeams`.
 * Extra keys are ignored until that prop exists (tests fail red until then).
 */
type TeamListProps = React.ComponentProps<typeof TeamList> & {
  archivedTeams?: TeamSummary[];
};

function setup(overrides: Partial<TeamListProps> = {}) {
  const props = {
    teams: TEAMS,
    selectedId: null as string | null,
    onSelect: vi.fn(),
    onNew: vi.fn(),
    onImport: vi.fn(),
    onDuplicate: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
  render(<TeamList {...(props as React.ComponentProps<typeof TeamList>)} />);
  return props;
}

function archiveSection() {
  return screen.queryByTestId("team-list-archived");
}

describe("TeamList", () => {
  it("shows an empty state when there are no teams", () => {
    setup({ teams: [] });
    expect(screen.getByTestId("team-list-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("team-list-items")).not.toBeInTheDocument();
  });

  it("renders a row per living team with name and member count (CF-TEAM-AC-1.7)", () => {
    setup();
    expect(screen.getByText("Rain Offense")).toBeInTheDocument();
    expect(screen.getByTestId("team-row-t1")).toHaveTextContent(/6\/6/);
    // Living list is Champions — other-format teams are not mixed in.
    expect(screen.queryByText("Gen 7 rain")).not.toBeInTheDocument();
  });

  it("flags incomplete teams", () => {
    setup();
    expect(screen.getByTestId("team-incomplete-t2")).toBeInTheDocument();
    expect(screen.queryByTestId("team-incomplete-t1")).not.toBeInTheDocument();
  });

  it("calls onNew / onImport", () => {
    const props = setup();
    fireEvent.click(screen.getByTestId("team-new"));
    fireEvent.click(screen.getByTestId("team-import"));
    expect(props.onNew).toHaveBeenCalledOnce();
    expect(props.onImport).toHaveBeenCalledOnce();
  });

  it("selects a team when its name is clicked", () => {
    const props = setup();
    fireEvent.click(screen.getByTestId("team-open-t1"));
    expect(props.onSelect).toHaveBeenCalledWith("t1");
  });

  it("duplicates a team", () => {
    const props = setup();
    fireEvent.click(screen.getByTestId("team-duplicate-t2"));
    expect(props.onDuplicate).toHaveBeenCalledWith("t2");
  });

  it("requires a two-step confirm before deleting", () => {
    const props = setup();
    fireEvent.click(screen.getByTestId("team-delete-t1"));
    // Nothing deleted yet — only the confirm controls appear.
    expect(props.onDelete).not.toHaveBeenCalled();
    expect(
      screen.getByTestId("team-delete-confirm-t1"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("team-delete-confirm-t1"));
    expect(props.onDelete).toHaveBeenCalledWith("t1");
  });

  it("can cancel a pending delete", () => {
    const props = setup();
    fireEvent.click(screen.getByTestId("team-delete-t1"));
    fireEvent.click(screen.getByTestId("team-delete-cancel-t1"));
    expect(props.onDelete).not.toHaveBeenCalled();
    expect(screen.getByTestId("team-delete-t1")).toBeInTheDocument();
  });

  it("marks the selected row", () => {
    setup({ selectedId: "t1" });
    expect(screen.getByTestId("team-row-t1")).toHaveAttribute(
      "data-selected",
      "true",
    );
    expect(screen.getByTestId("team-row-t2")).toHaveAttribute(
      "data-selected",
      "false",
    );
  });
});

describe("TeamList — Archived section (CF-TEAM-US-5, CF-UI-US-4)", () => {
  it("keeps living Champions teams as the primary list (CF-TEAM-AC-1.7, CF-UI-AC-4.1)", () => {
    setup({ archivedTeams: ARCHIVED });
    const living =
      screen.queryByTestId("team-list-living") ??
      screen.getByTestId("team-list-items");
    expect(within(living).getByText("Rain Offense")).toBeInTheDocument();
    expect(within(living).getByText("Draft WIP")).toBeInTheDocument();
    expect(within(living).queryByText("Gen 7 rain")).not.toBeInTheDocument();
  });

  it("renders archived other-format teams in a separate Archived section (CF-TEAM-AC-5.1, CF-UI-AC-4.1)", () => {
    setup({ archivedTeams: ARCHIVED });
    const archive = archiveSection();
    expect(archive).toBeInTheDocument();
    expect(archive).toHaveTextContent(/archived/i);
    expect(within(archive!).getByText("Gen 7 rain")).toBeInTheDocument();
    expect(within(archive!).getByText("Old SV core")).toBeInTheDocument();
  });

  it("archived rows are view + delete only — no edit, duplicate, apply, or use-in-chat (CF-TEAM-AC-5.2–5.3, CF-UI-AC-4.2)", () => {
    const props = setup({ archivedTeams: ARCHIVED });
    const archive = archiveSection()!;
    expect(archive).toBeInTheDocument();

    // View: opening the row still selects it (read-only editor is the page).
    fireEvent.click(within(archive).getByTestId("team-open-old-gen7"));
    expect(props.onSelect).toHaveBeenCalledWith("old-gen7");

    // Delete (two-step confirm) is still offered.
    expect(
      within(archive).getByTestId("team-delete-old-gen7"),
    ).toBeInTheDocument();

    expect(
      within(archive).queryByTestId("team-duplicate-old-gen7"),
    ).not.toBeInTheDocument();
    expect(
      within(archive).queryByRole("button", { name: /duplicate/i }),
    ).not.toBeInTheDocument();
    expect(
      within(archive).queryByRole("button", { name: /edit/i }),
    ).not.toBeInTheDocument();
    expect(
      within(archive).queryByRole("button", {
        name: /apply( this)?( champions)? set/i,
      }),
    ).not.toBeInTheDocument();
    expect(
      within(archive).queryByRole("button", {
        name: /use in chat|bind|active team/i,
      }),
    ).not.toBeInTheDocument();
  });

  it("omits the Archived section (or leaves it empty, no error) when there are none (CF-TEAM-AC-5.5)", () => {
    setup({ archivedTeams: [] });
    const archive = archiveSection();
    if (archive) {
      expect(archive).not.toHaveTextContent(/error|failed|couldn't/i);
      expect(within(archive).queryByTestId(/team-row-/)).not.toBeInTheDocument();
    }
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("omits Archived when the prop is absent and living teams exist (CF-TEAM-AC-5.5)", () => {
    setup();
    const archive = archiveSection();
    if (archive) {
      expect(within(archive).queryByTestId(/team-row-/)).not.toBeInTheDocument();
    }
  });

  it("empty living list still offers create/import; archive stays a separate section", () => {
    setup({ teams: [], archivedTeams: ARCHIVED });
    expect(screen.getByTestId("team-list-empty")).toBeInTheDocument();
    expect(screen.getByTestId("team-new")).toBeInTheDocument();
    expect(screen.getByTestId("team-import")).toBeInTheDocument();
    const archive = archiveSection();
    expect(archive).toBeInTheDocument();
    expect(within(archive!).getByText("Gen 7 rain")).toBeInTheDocument();
  });
});

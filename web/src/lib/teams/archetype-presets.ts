/**
 * Archetype starter presets for the team builder (Phase 3).
 * Role checklists + assistant seed prompts — not fixed illegal rosters.
 */

import type { Format } from "@/data/formats";

export interface ArchetypePreset {
  id: string;
  label: string;
  /** Formats this preset applies to; empty = all. */
  formats: readonly Format[] | "all";
  /** Short blurb for the create picker. */
  blurb: string;
  /** Message auto-sent to the Teams Assistant after create. */
  seedPrompt: string;
}

export const ARCHETYPE_PRESETS: readonly ArchetypePreset[] = [
  {
    id: "balance",
    label: "Balance",
    formats: "all",
    blurb: "Pivot + bulk + breaker — flexible answers.",
    seedPrompt:
      "Build a Balance team for this format: a pivot, physical and special bulk, and a win condition. State win condition, archetype, cores, speed plan, and known holes. Propose full legal sets.",
  },
  {
    id: "ho",
    label: "Hyper Offense",
    formats: "all",
    blurb: "Fast breakers and continuous pressure.",
    seedPrompt:
      "Build a Hyper Offense team: multiple breakers, speed control or revenge tools, and a clear late-game cleaner. State win condition, cores, speed plan, and holes. Full legal sets.",
  },
  {
    id: "stall",
    label: "Stall / control",
    formats: [
      "national-dex",
      "scarlet-violet",
      "gen-8",
      "gen-7",
      "gen-6",
      "gen-5",
      "gen-4",
      "gen-3",
      "gen-2",
      "gen-1",
    ],
    blurb: "Walls, hazards, and attrition.",
    seedPrompt:
      "Build a Stall/control team with a defensive core, hazard stack, hazard removal or phazing, and a cleric or recovery. State win condition, cores, and holes. Full legal sets.",
  },
  {
    id: "trick-room",
    label: "Trick Room",
    formats: "all",
    blurb: "TR setter plus slow abusers.",
    seedPrompt:
      "Build a Trick Room team: a dedicated setter and slow abusers that win under TR. Clarify singles vs doubles if unclear. Full legal sets with win condition and cores.",
  },
  {
    id: "weather-sun",
    label: "Sun",
    formats: [
      "national-dex",
      "scarlet-violet",
      "gen-8",
      "gen-7",
      "gen-6",
      "gen-5",
      "gen-4",
      "gen-3",
    ],
    blurb: "Drought setter and sun abusers.",
    seedPrompt:
      "Build a sun team around a Drought setter and Chlorophyll / sun-boosted abusers. Full legal sets; explain the core and weather plan.",
  },
  {
    id: "weather-rain",
    label: "Rain",
    formats: [
      "national-dex",
      "scarlet-violet",
      "gen-8",
      "gen-7",
      "gen-6",
      "gen-5",
      "gen-4",
      "gen-3",
    ],
    blurb: "Drizzle setter and rain abusers.",
    seedPrompt:
      "Build a rain team around a Drizzle setter and Swift Swim / rain-boosted abusers. Full legal sets; explain the core and weather plan.",
  },
  {
    id: "vgc-balance",
    label: "VGC Balance",
    formats: ["champions"],
    blurb: "Intimidate, Fake Out, redirect, speed control.",
    seedPrompt:
      "Build a Champions VGC Balance team: Intimidate support, Fake Out, redirection, speed control (Tailwind or Trick Room), and two win-condition attackers. Full legal Champions sets (Stat Points 66). State roles and holes.",
  },
  {
    id: "vgc-ho",
    label: "VGC Hyper Offense",
    formats: ["champions"],
    blurb: "Tailwind + dual attackers.",
    seedPrompt:
      "Build a Champions VGC Hyper Offense team: Tailwind speed control and dual hard hitters (Mega optional). Full legal Champions sets. State win condition and fragility holes.",
  },
];

export function presetsForFormat(format: Format): ArchetypePreset[] {
  return ARCHETYPE_PRESETS.filter(
    (p) => p.formats === "all" || p.formats.includes(format),
  );
}

export function presetById(id: string): ArchetypePreset | undefined {
  return ARCHETYPE_PRESETS.find((p) => p.id === id);
}

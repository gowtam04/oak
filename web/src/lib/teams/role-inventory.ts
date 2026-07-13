/**
 * Deterministic role / utility inventory for a team draft.
 *
 * Flags are inferred from move slugs + a few abilities/items — no LLM.
 * `roles_missing` is format-aware and deliberately conservative.
 */

import type { Format } from "@/data/formats";

/** Wire-stable role flag ids (snake_case). */
export const ROLE_FLAGS = [
  "stealth_rock",
  "spikes",
  "toxic_spikes",
  "sticky_web",
  "hazard_removal",
  "priority",
  "status_spread",
  "setup",
  "recovery",
  "cleric",
  "pivot",
  "tailwind",
  "trick_room",
  "redirection",
  "fake_out",
  "protect",
  "intimidate",
  "spread_damage",
  "speed_control",
] as const;

export type RoleFlag = (typeof ROLE_FLAGS)[number];

export interface PhysicalSpecialSummary {
  physical_moves: number;
  special_moves: number;
  status_moves: number;
  attacker_bias: "physical" | "special" | "mixed" | "none";
}

export interface MemberRoles {
  member: string;
  flags: RoleFlag[];
}

export interface RoleInventory {
  roles: MemberRoles[];
  roles_present: RoleFlag[];
  roles_missing: RoleFlag[];
  physical_special: PhysicalSpecialSummary;
}

const MOVE_FLAGS: ReadonlyArray<{ flag: RoleFlag; moves: readonly string[] }> =
  [
    { flag: "stealth_rock", moves: ["stealth-rock"] },
    { flag: "spikes", moves: ["spikes"] },
    { flag: "toxic_spikes", moves: ["toxic-spikes"] },
    { flag: "sticky_web", moves: ["sticky-web"] },
    {
      flag: "hazard_removal",
      moves: ["defog", "rapid-spin", "court-change", "tidy-up", "mortal-spin"],
    },
    {
      flag: "priority",
      moves: [
        "sucker-punch",
        "extreme-speed",
        "aqua-jet",
        "bullet-punch",
        "ice-shard",
        "mach-punch",
        "shadow-sneak",
        "accelerock",
        "grassy-glide",
        "water-shuriken",
        "first-impression",
        "jet-punch",
        "upper-hand",
      ],
    },
    {
      flag: "status_spread",
      moves: [
        "will-o-wisp",
        "thunder-wave",
        "toxic",
        "spore",
        "sleep-powder",
        "stun-spore",
        "glare",
        "nuzzle",
        "yawn",
        "dark-void",
      ],
    },
    {
      flag: "setup",
      moves: [
        "swords-dance",
        "calm-mind",
        "dragon-dance",
        "nasty-plot",
        "quiver-dance",
        "shell-smash",
        "shift-gear",
        "bulk-up",
        "iron-defense",
        "acid-armor",
        "agility",
        "rock-polish",
        "coil",
        "victory-dance",
        "clangorous-soul",
        "tidy-up",
        "hone-claws",
        "work-up",
      ],
    },
    {
      flag: "recovery",
      moves: [
        "recover",
        "roost",
        "soft-boiled",
        "moonlight",
        "morning-sun",
        "synthesis",
        "shore-up",
        "slack-off",
        "wish",
        "strength-sap",
        "drain-punch",
        "giga-drain",
        "leech-life",
      ],
    },
    {
      flag: "cleric",
      moves: ["heal-bell", "aromatherapy"],
    },
    {
      flag: "pivot",
      moves: [
        "u-turn",
        "volt-switch",
        "flip-turn",
        "parting-shot",
        "teleport",
        "chilly-reception",
        "shed-tail",
      ],
    },
    { flag: "tailwind", moves: ["tailwind"] },
    { flag: "trick_room", moves: ["trick-room"] },
    {
      flag: "redirection",
      moves: ["follow-me", "rage-powder", "ally-switch"],
    },
    { flag: "fake_out", moves: ["fake-out"] },
    {
      flag: "protect",
      moves: ["protect", "detect", "spiky-shield", "kings-shield", "baneful-bunker", "silk-trap", "burning-bulwark"],
    },
    {
      flag: "spread_damage",
      moves: [
        "earthquake",
        "rock-slide",
        "heat-wave",
        "blizzard",
        "hyper-voice",
        "dazzling-gleam",
        "snarl",
        "icy-wind",
        "muddy-water",
        "make-it-rain",
        "breaking-swipe",
        "discharge",
        "lava-plume",
        "sludge-wave",
        "surf",
        "eruption",
        "water-spout",
        "expanding-force",
      ],
    },
  ];

const PRIORITY_ABILITIES = new Set(["prankster", "gale-wings", "triage"]);

function flagsForMember(
  moves: readonly string[],
  ability: string | null,
): RoleFlag[] {
  const set = new Set<RoleFlag>();
  const moveSet = new Set(moves);

  for (const { flag, moves: list } of MOVE_FLAGS) {
    if (list.some((m) => moveSet.has(m))) set.add(flag);
  }
  if (ability === "intimidate") set.add("intimidate");
  if (ability && PRIORITY_ABILITIES.has(ability)) set.add("priority");

  // Composite: any of Tailwind / Trick Room / Icy Wind counts as speed control.
  if (
    set.has("tailwind") ||
    set.has("trick_room") ||
    moveSet.has("icy-wind") ||
    moveSet.has("electroweb") ||
    moveSet.has("bulldoze")
  ) {
    set.add("speed_control");
  }

  return ROLE_FLAGS.filter((f) => set.has(f));
}

function missingForFormat(
  present: ReadonlySet<RoleFlag>,
  format: Format,
  hasHazards: boolean,
): RoleFlag[] {
  const missing: RoleFlag[] = [];

  if (format === "champions") {
    if (!present.has("speed_control")) missing.push("speed_control");
    // Soft expectations — still surface as missing so VGC builders notice.
    if (!present.has("fake_out")) missing.push("fake_out");
    if (!present.has("redirection")) missing.push("redirection");
    return missing;
  }

  // Mainline singles: only flag hazard removal when the team sets hazards.
  if (hasHazards && !present.has("hazard_removal")) {
    missing.push("hazard_removal");
  }

  return missing;
}

export interface RoleMemberInput {
  /** Species slug (member id in analysis). */
  slug: string;
  moves: readonly string[];
  ability?: string | null;
  damageClasses?: readonly ("physical" | "special" | "status" | null)[];
}

/**
 * Build the team role inventory + physical/special move summary.
 */
export function buildRoleInventory(
  members: readonly RoleMemberInput[],
  format: Format,
): RoleInventory {
  const roles: MemberRoles[] = [];
  const present = new Set<RoleFlag>();
  let physical = 0;
  let special = 0;
  let status = 0;

  for (const m of members) {
    if (!m.slug) continue;
    const flags = flagsForMember(m.moves, m.ability ?? null);
    roles.push({ member: m.slug, flags });
    for (const f of flags) present.add(f);

    if (m.damageClasses) {
      for (const dc of m.damageClasses) {
        if (dc === "physical") physical += 1;
        else if (dc === "special") special += 1;
        else if (dc === "status") status += 1;
      }
    }
  }

  const hasHazards =
    present.has("stealth_rock") ||
    present.has("spikes") ||
    present.has("toxic_spikes") ||
    present.has("sticky_web");

  let attacker_bias: PhysicalSpecialSummary["attacker_bias"] = "none";
  if (physical === 0 && special === 0) attacker_bias = "none";
  else if (physical > 0 && special === 0) attacker_bias = "physical";
  else if (special > 0 && physical === 0) attacker_bias = "special";
  else if (Math.abs(physical - special) <= 1) attacker_bias = "mixed";
  else attacker_bias = physical > special ? "physical" : "special";

  const roles_present = ROLE_FLAGS.filter((f) => present.has(f));
  const roles_missing = missingForFormat(present, format, hasHazards);

  return {
    roles,
    roles_present,
    roles_missing,
    physical_special: {
      physical_moves: physical,
      special_moves: special,
      status_moves: status,
      attacker_bias,
    },
  };
}

/** Human labels for role flags (UI). */
export const ROLE_LABELS: Readonly<Record<RoleFlag, string>> = {
  stealth_rock: "Stealth Rock",
  spikes: "Spikes",
  toxic_spikes: "Toxic Spikes",
  sticky_web: "Sticky Web",
  hazard_removal: "Hazard removal",
  priority: "Priority",
  status_spread: "Status",
  setup: "Setup",
  recovery: "Recovery",
  cleric: "Cleric",
  pivot: "Pivot",
  tailwind: "Tailwind",
  trick_room: "Trick Room",
  redirection: "Redirection",
  fake_out: "Fake Out",
  protect: "Protect",
  intimidate: "Intimidate",
  spread_damage: "Spread damage",
  speed_control: "Speed control",
};

/**
 * Suggested assistant chip prompts from analysis holes.
 */
export function analysisSuggestionChips(input: {
  roles_missing: readonly string[];
  defense_weak_counts: ReadonlyArray<{ type: string; count: number }>;
  uncovered: readonly string[];
  unanswered_threats?: readonly string[];
}): string[] {
  const chips: string[] = [];
  if (input.roles_missing.includes("speed_control")) {
    chips.push("Add Tailwind or Trick Room for speed control");
  }
  if (input.roles_missing.includes("hazard_removal")) {
    chips.push("Add hazard removal (Defog / Rapid Spin)");
  }
  if (input.roles_missing.includes("fake_out")) {
    chips.push("Add a Fake Out user");
  }
  if (input.roles_missing.includes("redirection")) {
    chips.push("Add redirection (Follow Me / Rage Powder)");
  }

  const worst = [...input.defense_weak_counts]
    .filter((r) => r.count >= 2)
    .sort((a, b) => b.count - a.count)[0];
  if (worst) {
    const label = worst.type.charAt(0).toUpperCase() + worst.type.slice(1);
    chips.push(`Patch ${label} weakness (×${worst.count})`);
  }

  if (input.uncovered.length > 0 && input.uncovered.length <= 6) {
    const t = input.uncovered[0]!;
    const label = t.charAt(0).toUpperCase() + t.slice(1);
    chips.push(`Cover ${label}-types offensively`);
  } else if (input.uncovered.length > 6) {
    chips.push("Improve offensive type coverage");
  }

  if (input.unanswered_threats?.[0]) {
    chips.push(`Help me beat ${input.unanswered_threats[0]}`);
  }

  // Fallbacks
  if (chips.length === 0) {
    chips.push("Check my coverage");
    chips.push("Suggest a set for a weak slot");
  }

  return chips.slice(0, 5);
}

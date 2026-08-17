/**
 * Deterministic "Explain this calc" chat message (api-design.md, CALC-AC-8.3).
 *
 * Portable: no I/O. The overlay/screen POSTs this string as a normal user
 * message; it is not JSON and not an OakAnswer.
 */

import type { CalcResult, CalcScenario, CalcSide } from "./calc-schema";

function dash(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function formatEvs(evs: CalcSide["evs"]): string {
  if (!evs) return "—";
  const parts = Object.entries(evs)
    .filter(([, n]) => typeof n === "number")
    .map(([k, n]) => `${n} ${k}`);
  return parts.length > 0 ? parts.join(" / ") : "—";
}

function formatSide(side: CalcSide): string {
  return (
    `${dash(side.species)} @ ${dash(side.item)} / ${dash(side.ability)} / ` +
    `${dash(side.nature)} / ${formatEvs(side.evs)} / L${dash(side.level)} / ` +
    `Tera ${dash(side.tera)}`
  );
}

function formatScreens(scenario: CalcScenario): string {
  const screens: string[] = [];
  if (scenario.field?.reflect) screens.push("Reflect");
  if (scenario.field?.light_screen) screens.push("Light Screen");
  if (screens.length === 0) return "none";
  return screens.join(", ");
}

function formatMove(scenario: CalcScenario): string {
  return scenario.move.name?.trim() || scenario.move.slug?.trim() || "—";
}

function formatUnsupported(result: CalcResult): string {
  if (!result.ok) return "—";
  const list = result.applied.unsupported;
  return list.length > 0 ? list.join(", ") : "none";
}

function formatEstimate(result: CalcResult): string {
  if (!result.ok) return "unavailable";
  const { min_damage, max_damage, percent_min, percent_max, ko } =
    result.estimate;
  return `${min_damage}–${max_damage} (${percent_min}–${percent_max}%); ${ko.hits}HKO`;
}

export function explainCalcPrompt(
  scenario: CalcScenario,
  result: CalcResult,
): string {
  const weather = scenario.field?.weather ?? "none";
  return [
    "Explain this damage estimate (do not re-roll unless needed).",
    `Format: ${scenario.format}`,
    `Attacker: ${formatSide(scenario.attacker)}`,
    `Defender: ${formatSide(scenario.defender)}`,
    `Move: ${formatMove(scenario)}`,
    `Field: ${weather}, screens ${formatScreens(scenario)}`,
    `Estimate: ${formatEstimate(result)}`,
    `Unsupported: ${formatUnsupported(result)}`,
  ].join("\n");
}

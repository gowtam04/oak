import type { OrbSize, OrbState } from "@/lib/orbs/types";

/**
 * 22px CSS Poké Ball used as the thinking mark (enamel-paper.md Key Decision 17).
 * Same props as the old canvas orb so OrbPlayground still compiles; the ball
 * does not change geometry per `state`. Reduce-motion / paused: static, no spin.
 */
export default function ThinkingOrbMark({
  state,
  size = 20,
  paused = false,
  live = true,
}: {
  state: OrbState;
  size?: OrbSize;
  paused?: boolean;
  live?: boolean;
}) {
  return (
    <span
      className="ball thinking-trace__orb"
      data-state={state}
      data-size={size}
      data-paused={paused ? "true" : "false"}
      data-live={live ? "true" : "false"}
      aria-hidden="true"
    />
  );
}

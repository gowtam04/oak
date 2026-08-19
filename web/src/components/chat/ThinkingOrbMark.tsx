"use client";

import { useEffect, useRef } from "react";
import { MODE_DRAWS } from "@/lib/orbs/engine/registry";
import { resolvePreset } from "@/lib/orbs/presets";
import type { OrbSize, OrbState } from "@/lib/orbs/types";

/**
 * 20px (or 64px) canvas mark for the thinking-trace header.
 * Geometry is the vendored thinking-orbs 0.3.1 engine; Oak paints it.
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
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const readDark = () =>
      document.documentElement.getAttribute("data-theme") === "dark";
    let dark = readDark();
    const reduced =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { mode, speed, opts } = resolvePreset(state, size);
    const draw = MODE_DRAWS[mode];

    const frame = (tSec: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      draw(ctx, size, tSec, dark, opts);
    };

    if (reduced) {
      frame(0.6);
      return;
    }

    let raf = 0;
    let running = false;
    const loop = () => {
      frame((performance.now() / 1000) * speed);
      if (running) raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (running || paused) return;
      running = true;
      raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    frame((performance.now() / 1000) * speed);

    let visible = true;
    const io =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(([entry]) => {
            visible = entry.isIntersecting;
            if (visible && document.visibilityState !== "hidden") start();
            else stop();
          })
        : null;
    io?.observe(canvas);
    const onVis = () => {
      if (document.visibilityState === "hidden") stop();
      else if (visible) start();
    };
    document.addEventListener("visibilitychange", onVis);
    const themeObs =
      typeof MutationObserver !== "undefined"
        ? new MutationObserver(() => {
            dark = readDark();
            if (paused || reduced) frame((performance.now() / 1000) * speed);
          })
        : null;
    themeObs?.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    if (!io) start();

    return () => {
      stop();
      io?.disconnect();
      themeObs?.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [state, size, paused]);

  return (
    <canvas
      ref={ref}
      className="thinking-trace__orb"
      width={size}
      height={size}
      data-size={size}
      data-live={live ? "true" : "false"}
      aria-hidden="true"
    />
  );
}

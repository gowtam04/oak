"use client";

import { useEffect, useRef } from "react";
import type { OrbFrame } from "@/lib/orbs/engine/core";
import { MODE_FRAMES } from "@/lib/orbs/engine/registry";
import { resolvePreset } from "@/lib/orbs/presets";
import type { OrbSize, OrbState } from "@/lib/orbs/types";

/** Parse `#rrggbb` from `--poke-red` (or fall back to the light token). */
function readPokeRed(): { r: number; g: number; b: number } {
  if (typeof window === "undefined") return { r: 227, g: 53, b: 13 };
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--poke-red")
    .trim();
  const m = /^#([0-9a-f]{6})$/i.exec(raw);
  if (!m) return { r: 227, g: 53, b: 13 };
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Depth stays in alpha: near dots (low `white`) are stronger red. */
function paintTinted(ctx: CanvasRenderingContext2D, frame: OrbFrame, rgb: { r: number; g: number; b: number }) {
  for (const l of frame.lines) {
    const w = Math.min(1, Math.max(0, l.white));
    ctx.strokeStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${(l.a ?? 1) * (1 - w)})`;
    ctx.lineWidth = l.w;
    ctx.beginPath();
    ctx.moveTo(l.x1, l.y1);
    ctx.lineTo(l.x2, l.y2);
    ctx.stroke();
  }
  for (const d of frame.dots) {
    const w = Math.min(1, Math.max(0, d.white));
    ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${(d.a ?? 1) * (1 - w)})`;
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

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
    const drawFrame = MODE_FRAMES[mode];
    let rgb = readPokeRed();

    const frame = (tSec: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      paintTinted(ctx, drawFrame(size, tSec, opts), rgb);
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
            rgb = readPokeRed();
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

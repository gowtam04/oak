// Vendored from thinking-orbs 0.3.1 (MIT © Jakub Antalik).

import type { ModeOpts } from "./profiles";
import type { OrbFrame } from "./core";

export type { Dot, Line, OrbFrame } from "./core";

export type ModeFrame = (size: number, t: number, opts: ModeOpts) => OrbFrame;

export type ModeDraw = (
  ctx: CanvasRenderingContext2D,
  size: number,
  t: number,
  dark: boolean,
  opts: ModeOpts,
) => void;

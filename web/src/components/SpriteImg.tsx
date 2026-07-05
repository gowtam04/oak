"use client";

import { useState } from "react";
import { safeHttpUrl } from "@/lib/safe-url";

export interface SpriteImgProps {
  /** Primary sprite URL (for a form, the Showdown `ani/<spriteid>.gif`). */
  src: string;
  /**
   * Shown if `src` fails to load — typically the base-species PokeAPI art by
   * national dex number. Lets an alternate form degrade to base art (the
   * pre-fix behaviour) instead of a broken image when a Showdown sprite is
   * missing. Omit it to leave a failed `src` as-is.
   */
  fallbackSrc?: string;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
  /**
   * Native `<img loading>` hint. Pass `"lazy"` for offscreen sprites (the
   * reference card grids render ~1000 at once) so the browser defers the fetch
   * until each is near the viewport. Optional/additive — omit for eager loads.
   */
  loading?: "lazy" | "eager";
}

/**
 * `<img>` that swaps to `fallbackSrc` the first time `src` fails to load.
 *
 * The error is tracked per-`src` (not a bare boolean) so that a later prop
 * change to a fresh, working `src` isn't stuck on the previous fallback; and
 * because we only swap while the errored value still equals `src`, a fallback
 * that also 404s can't loop.
 *
 * `src`/`fallbackSrc` are model-composed (subject/candidate `sprite_url`,
 * `artwork_url`) and pass through `safeHttpUrl` (http/https only) before
 * reaching the DOM (FE-02). An unsafe `src` falls through to `fallbackSrc`
 * immediately — there's no real `<img>` to fire a load error on a rejected
 * scheme; if `fallbackSrc` is also unsafe/absent, nothing renders.
 */
export default function SpriteImg({
  src,
  fallbackSrc,
  alt,
  className,
  width,
  height,
  loading,
}: SpriteImgProps) {
  const [erroredSrc, setErroredSrc] = useState<string | null>(null);
  const safeSrc = safeHttpUrl(src);
  const safeFallbackSrc = safeHttpUrl(fallbackSrc);
  const useFallback =
    safeFallbackSrc != null && (safeSrc == null || erroredSrc === src);
  const resolvedSrc = useFallback ? safeFallbackSrc : safeSrc;

  if (resolvedSrc == null) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={resolvedSrc}
      alt={alt}
      className={className}
      width={width}
      height={height}
      loading={loading}
      onError={() => {
        if (safeFallbackSrc != null && safeFallbackSrc !== safeSrc) {
          setErroredSrc(src);
        }
      }}
    />
  );
}

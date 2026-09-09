"use client";

/**
 * Fetched-at stamp in the *browser* time zone. The usage pages are SSR, so a
 * server render cannot know the user's zone — format after mount.
 */

import { useEffect, useState } from "react";

import { formatUsageFetchedAtLocal } from "./usage-format";

export default function UsageFetchedAt({ ms }: { ms: number }) {
  const iso = new Date(ms).toISOString();
  const [label, setLabel] = useState("");
  useEffect(() => {
    setLabel(formatUsageFetchedAtLocal(ms));
  }, [ms]);
  return <time dateTime={iso}>{label}</time>;
}

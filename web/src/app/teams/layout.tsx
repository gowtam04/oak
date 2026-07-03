import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Pokémon Team Builder",
  description:
    "Build, import, and edit competitive Pokémon teams — EVs, natures, items, and legality-checked movesets — with Oak's AI assistant.",
  alternates: {
    canonical: "/teams",
  },
};

export default function TeamsLayout({ children }: { children: ReactNode }) {
  return children;
}

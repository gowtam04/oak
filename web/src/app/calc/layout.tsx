import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Champions Damage Calculator",
  description:
    "Estimate Pokémon Champions damage ranges — attacker, defender, move, and field knobs at Level 50 — without sending a chat turn.",
  alternates: {
    canonical: "/calc",
  },
};

export default function CalcLayout({ children }: { children: ReactNode }) {
  return children;
}

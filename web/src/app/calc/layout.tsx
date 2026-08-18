import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Damage Calculator",
  description:
    "Estimate Pokémon damage ranges — attacker, defender, move, and field knobs — without sending a chat turn.",
  alternates: {
    canonical: "/calc",
  },
};

export default function CalcLayout({ children }: { children: ReactNode }) {
  return children;
}

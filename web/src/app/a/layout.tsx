/**
 * `/a/*` layout — public share pages are always request-rendered so a revoke
 * is visible immediately (ADR-6: Cache-Control private, no-store). Every
 * share URL is noindex (SHARE-BR-4).
 */

import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./share.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function ShareLayout({ children }: { children: ReactNode }) {
  return children;
}

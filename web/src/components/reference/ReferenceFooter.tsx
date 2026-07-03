/**
 * ReferenceFooter — the fan-project disclaimer shared by every reference page,
 * plus links to /privacy and home. Copies `LANDING_DISCLAIMER` verbatim (single
 * source of truth already established by the landing section) rather than
 * retyping the wording. Takes no props — server-safe, no hooks. The home link
 * uses `next/link` (not a plain `<a>`) because `@next/next/no-html-link-for-pages`
 * flags a bare `<a href="/">` now that the root page already exists.
 */

import Link from "next/link";

import { LANDING_DISCLAIMER } from "@/components/landing/landing-content";

export default function ReferenceFooter() {
  return (
    <footer className="ref-footer" data-testid="reference-footer">
      <span className="ref-footer__disclaimer">{LANDING_DISCLAIMER}</span>
      <span className="ref-footer__sep" aria-hidden="true">
        ·
      </span>
      <a href="/privacy" className="ref-footer__link">
        Privacy
      </a>
      <span className="ref-footer__sep" aria-hidden="true">
        ·
      </span>
      <Link href="/" className="ref-footer__link">
        Oak home
      </Link>
    </footer>
  );
}

/**
 * Dedicated unavailable state for a revoked or unknown share URL
 * (SHARE-AC-2.3, ADR-6). Not the signed-in app shell.
 */

import Link from "next/link";

import OakWordmark from "@/components/brand/OakWordmark";

export default function ShareUnavailable() {
  return (
    <div className="share-page__unavailable" data-testid="share-unavailable">
      <Link href="/" className="share-page__wordmark" aria-label="Oak — home">
        <OakWordmark />
      </Link>
      <h1 className="share-page__unavailable-title">This share is unavailable</h1>
      <p className="share-page__unavailable-body">
        The link may have been revoked or never existed. Ask the owner for a new
        one, or open Oak to start your own chat.
      </p>
      <Link href="/" className="tm-btn tm-btn--primary">
        Open Oak
      </Link>
    </div>
  );
}

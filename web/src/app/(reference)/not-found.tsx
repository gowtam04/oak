/**
 * Reference 404 — a slug that is not on the Champions roster.
 * Does not list other-game suggestions (CF-UI-AC-7.1).
 */

export default function ReferenceNotFound() {
  return (
    <main className="ref-page">
      <h1 className="ref-hero__title">Not on the Champions roster</h1>
      <p className="ref-intro">
        That Pokémon, move, ability, or item isn&apos;t in the current
        Champions roster.
      </p>
    </main>
  );
}

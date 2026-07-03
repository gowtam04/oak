/**
 * EvolutionChain — an inline chain of linked Pokémon names with the
 * evolution condition (e.g. "Level 36", "Trade holding Metal Coat") between
 * each pair. Renders nothing when there are no edges (a Pokémon with no
 * evolutionary relatives) so callers can render it unconditionally.
 */

export interface EvolutionEdge {
  fromSlug: string;
  fromName: string;
  toSlug: string;
  toName: string;
  condition?: string | null;
}

export interface EvolutionChainProps {
  edges: EvolutionEdge[];
}

export default function EvolutionChain({ edges }: EvolutionChainProps) {
  if (edges.length === 0) return null;

  return (
    <div className="ref-evolution" data-testid="evolution-chain">
      {edges.map((e, i) => (
        <span
          key={`${e.fromSlug}-${e.toSlug}`}
          className="ref-evolution__link"
        >
          {i === 0 && (
            <a href={`/pokedex/${e.fromSlug}`} className="ref-evolution__node">
              {e.fromName}
            </a>
          )}
          <span className="ref-evolution__arrow" aria-hidden="true">
            →
          </span>
          {e.condition && (
            <span className="ref-evolution__condition">{e.condition}</span>
          )}
          <a href={`/pokedex/${e.toSlug}`} className="ref-evolution__node">
            {e.toName}
          </a>
        </span>
      ))}
    </div>
  );
}

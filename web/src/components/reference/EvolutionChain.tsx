/**
 * EvolutionChain — an inline chain of linked Pokémon nodes (sprite + name)
 * with the evolution condition (e.g. "Level 36", "Trade holding Metal Coat")
 * between each pair. Renders nothing when there are no edges (a Pokémon with
 * no evolutionary relatives) so callers can render it unconditionally.
 */

import SpriteImg from "@/components/SpriteImg";
import { guessOakMediaSpriteUrl } from "@/lib/sprites";

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

function EvolutionNode({ slug, name }: { slug: string; name: string }) {
  return (
    <a href={`/pokedex/${slug}`} className="ref-evolution__node">
      <span className="ref-evolution__well">
        <SpriteImg
          src={guessOakMediaSpriteUrl(slug)}
          alt=""
          width={48}
          height={48}
          className="ref-evolution__sprite"
          loading="lazy"
        />
      </span>
      <span className="ref-evolution__name">{name}</span>
    </a>
  );
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
          {i === 0 && <EvolutionNode slug={e.fromSlug} name={e.fromName} />}
          <span className="ref-evolution__arrow" aria-hidden="true">
            →
          </span>
          {e.condition && (
            <span className="ref-evolution__condition">{e.condition}</span>
          )}
          <EvolutionNode slug={e.toSlug} name={e.toName} />
        </span>
      ))}
    </div>
  );
}

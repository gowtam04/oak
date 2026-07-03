/**
 * AbilityBlock — a Pokémon's abilities, name linked to `/abilities/[slug]`,
 * a "(hidden)" marker for the hidden-ability slot, and short effect prose
 * when available.
 */

export interface AbilityRow {
  slug: string;
  displayName: string;
  isHidden?: boolean;
  effectShort?: string | null;
}

export interface AbilityBlockProps {
  abilities: AbilityRow[];
}

export default function AbilityBlock({ abilities }: AbilityBlockProps) {
  return (
    <ul className="ref-abilities" data-testid="ability-block">
      {abilities.map((a) => (
        <li key={a.slug} className="ref-abilities__item">
          <a href={`/abilities/${a.slug}`} className="ref-abilities__name">
            {a.displayName}
          </a>
          {a.isHidden && (
            <span className="ref-abilities__hidden">(hidden)</span>
          )}
          {a.effectShort && (
            <p className="ref-abilities__effect">{a.effectShort}</p>
          )}
        </li>
      ))}
    </ul>
  );
}

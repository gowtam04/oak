import type { SpriteCardProps } from "@/components/types";
import TypeBadge from "@/components/TypeBadge";

/**
 * SpriteCard — renders one entry from `subjects[]`: sprite image, display
 * name, optional Dex number, type badges, and a fallback indicator when
 * `is_fallback` is true (pre-Gen-9 data used per BR-1).
 *
 * Sprite URL comes directly from the agent payload (PokeAPI CDN). Visual layout
 * deferred to `frontend-design`.
 */
export default function SpriteCard({ subject }: SpriteCardProps) {
  const {
    name,
    dex_number,
    sprite_url,
    types,
    is_fallback,
    source_generation,
  } = subject;

  return (
    <div className="sprite-card" data-testid="sprite-card">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="sprite-card__sprite"
        src={sprite_url}
        alt={name}
        width={96}
        height={96}
      />
      <div className="sprite-card__info">
        <span className="sprite-card__name">
          {name}
          {dex_number != null && (
            <span className="sprite-card__dex"> #{dex_number}</span>
          )}
        </span>
        {is_fallback && (
          <span
            className="sprite-card__fallback-badge"
            title={
              source_generation
                ? `Data from ${source_generation}`
                : "Pre-Gen 9 data"
            }
            data-testid="sprite-card-fallback"
          >
            {source_generation ?? "Fallback"}
          </span>
        )}
        <div className="sprite-card__types">
          {types.map((type) => (
            <TypeBadge key={type} type={type} />
          ))}
        </div>
      </div>
    </div>
  );
}

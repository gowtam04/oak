"use client";

/**
 * ChampionsToggle — a controlled switch that scopes the chat to Pokémon
 * Champions. Lives in the composer's controls row (above the input), mirroring
 * the iOS app's placement so the current scope is always visible — not buried
 * behind a header gear.
 *
 * STATELESS: the parent (`page.tsx`) owns the on/off boolean and its
 * localStorage persistence. This component only renders the control and reports
 * intent via `onChange(!checked)`.
 *
 * The control IS the Pokémon Champions logo (the logo already reads
 * "Champions", so there's no separate text label). Styling lives in
 * `globals.css` (`.champions-toggle*`) and is driven off the `aria-checked`
 * attribute (no inline style branches): full-color when on, greyscale + dimmed
 * when off. The accessible name is carried by `aria-label`, so screen readers
 * still hear the on/off state even though the visible content is an image.
 */
type ChampionsToggleProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Disabled while a turn is streaming (mirrors the iOS composer control). */
  disabled?: boolean;
};

export default function ChampionsToggle({
  checked,
  onChange,
  disabled = false,
}: ChampionsToggleProps) {
  const label = checked
    ? "Champions mode on — answers are scoped to Pokémon Champions"
    : "Champions mode off — answers use Generation 9";

  return (
    <button
      type="button"
      role="switch"
      className="champions-toggle"
      aria-checked={checked}
      aria-label={label}
      title={label}
      data-testid="champions-toggle"
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      {/* The Pokémon Champions logo. Currently a placeholder SVG — swap in the
          official artwork by replacing web/public/champions-logo.svg (or drop a
          champions-logo.png and update this src). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="champions-toggle__logo"
        src="/champions-logo.svg"
        alt=""
        aria-hidden="true"
        draggable={false}
      />
    </button>
  );
}

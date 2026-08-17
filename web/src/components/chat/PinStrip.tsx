"use client";

/**
 * PinStrip — compact jump list of pinned assistant cards (PIN-US-1).
 * Thread order is the caller's; pin time is ignored. Renders nothing
 * when there are no pins (PIN-AC-1.6).
 */

export interface PinStripItem {
  id: string;
  label: string;
}

export interface PinStripProps {
  pins: PinStripItem[];
  onJump: (id: string) => void;
}

export default function PinStrip({ pins, onJump }: PinStripProps) {
  if (pins.length === 0) return null;

  return (
    <nav className="pin-strip" data-testid="pin-strip" aria-label="Pinned turns">
      {pins.map((pin) => (
        <a
          key={pin.id}
          className="pin-strip__link"
          href={`#turn-${pin.id}`}
          onClick={(e) => {
            e.preventDefault();
            onJump(pin.id);
          }}
        >
          {pin.label}
        </a>
      ))}
    </nav>
  );
}

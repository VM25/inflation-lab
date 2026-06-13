"use client";

import type { Tenor } from "@/types/data";
import { TENORS } from "@/types/data";

/**
 * Miniature shock-shape: the four pillar shocks drawn against a zero line
 * on a fixed +/-380bp scale, so every scenario's shape is comparable at a
 * glance. A steepener, a flattener and a parallel shift read as shapes
 * before they read as numbers.
 */
export function ShockGlyph({
  shocks,
  inverted = false,
}: {
  shocks: Record<Tenor, number>;
  /** true when drawn on an ink-filled selected chip */
  inverted?: boolean;
}) {
  const W = 46;
  const H = 22;
  const PAD = 3;
  const RANGE = 380;

  const xs = TENORS.map((_, i) => PAD + (i / 3) * (W - 2 * PAD));
  const yOf = (bps: number) =>
    H / 2 - (Math.max(-RANGE, Math.min(RANGE, bps)) / RANGE) * (H / 2 - 2);
  const pts = TENORS.map((t, i) => `${xs[i].toFixed(1)},${yOf(shocks[t]).toFixed(1)}`);
  const net = TENORS.reduce((a, t) => a + shocks[t], 0);
  const isFlat = TENORS.every((t) => shocks[t] === 0);

  const zero = inverted ? "oklch(60% 0.01 240)" : "var(--rule-strong)";
  const stroke = isFlat
    ? inverted
      ? "oklch(80% 0.01 240)"
      : "var(--ink-3)"
    : net >= 0
      ? inverted
        ? "oklch(72% 0.15 38)"
        : "var(--shock)"
      : inverted
        ? "oklch(75% 0.09 178)"
        : "var(--gain)";

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden className="shrink-0">
      <line x1={PAD} x2={W - PAD} y1={H / 2} y2={H / 2} stroke={zero} strokeWidth="1" strokeDasharray="2 2" />
      {isFlat ? (
        <line x1={PAD} x2={W - PAD} y1={H / 2} y2={H / 2} stroke={stroke} strokeWidth="1.6" />
      ) : (
        <polyline points={pts.join(" ")} fill="none" stroke={stroke} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      )}
    </svg>
  );
}

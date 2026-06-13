"use client";

const W = 230;
const H = 52;
const PAD = 4;

/** History trace for the regime panel: one series, end value pinned. */
export function TraceStrip({
  values,
  color = "var(--ink)",
  zeroRule = false,
  label,
}: {
  values: number[];
  color?: string;
  zeroRule?: boolean;
  label: string;
}) {
  if (values.length < 2) return null;
  const lo = Math.min(...values, zeroRule ? 0 : Infinity);
  const hi = Math.max(...values, zeroRule ? 0 : -Infinity);
  const span = hi - lo || 1;
  const xOf = (i: number) => PAD + (i / (values.length - 1)) * (W - 2 * PAD);
  const yOf = (v: number) => PAD + ((hi - v) / span) * (H - 2 * PAD);
  const d = values.map((v, i) => `${i === 0 ? "M" : "L"}${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(" ");
  const last = values[values.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={label}>
      {zeroRule && lo < 0 && (
        <line x1={PAD} x2={W - PAD} y1={yOf(0)} y2={yOf(0)} stroke="var(--rule-strong)" strokeDasharray="3 3" />
      )}
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" />
      <rect x={xOf(values.length - 1) - 2.5} y={yOf(last) - 2.5} width="5" height="5" fill={color} />
    </svg>
  );
}

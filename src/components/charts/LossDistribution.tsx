"use client";

import { fmtUsd } from "@/lib/formatters/numberFormatters";
import type { VaRResult } from "@/types/data";

const W = 600;
const H = 232;
const PAD = { top: 34, right: 16, bottom: 38, left: 16 };

/** One-year loss distribution with VaR rules and a vermilion tail. */
export function LossDistribution({
  result,
  color,
  variant = "fill",
}: {
  result: VaRResult;
  color: string;
  /** "outline" renders open bars (Vasicek); "fill" renders solid (CIR) */
  variant?: "outline" | "fill";
}) {
  const { bin_edges: edges, counts } = result.histogram;
  const maxCount = Math.max(...counts, 1);
  const lo = edges[0];
  const hi = edges[edges.length - 1];
  const span = hi - lo || 1;

  const xOf = (v: number) => PAD.left + ((v - lo) / span) * (W - PAD.left - PAD.right);
  const hOf = (c: number) => (c / maxCount) * (H - PAD.top - PAD.bottom);

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`Loss distribution. VaR 95 ${fmtUsd(result.var_95)}, VaR 99 ${fmtUsd(result.var_99)}, expected shortfall 99 ${fmtUsd(result.es_99)}.`}
      >
        <line x1={PAD.left} x2={W - PAD.right} y1={H - PAD.bottom} y2={H - PAD.bottom} stroke="var(--rule-strong)" strokeWidth="1.2" />

        {counts.map((c, i) => {
          const x = xOf(edges[i]);
          const w = xOf(edges[i + 1]) - x;
          const inTail = edges[i] >= result.var_95;
          return (
            <rect
              key={i}
              x={x + 0.5}
              y={H - PAD.bottom - hOf(c)}
              width={Math.max(w - 1, 0.5)}
              height={hOf(c)}
              fill={inTail ? "var(--loss)" : variant === "outline" ? "none" : color}
              stroke={inTail ? "none" : variant === "outline" ? color : "none"}
              strokeWidth={variant === "outline" ? 1 : 0}
              opacity={inTail ? 0.95 : variant === "outline" ? 0.8 : 0.45}
            />
          );
        })}

        {/* VaR rules */}
        {[
          { v: result.var_95, label: "VaR95", strong: false, row: 0 },
          { v: result.var_99, label: "VaR99", strong: true, row: 1 },
        ].map((m) => (
          <g key={m.label}>
            <line
              x1={xOf(m.v)}
              x2={xOf(m.v)}
              y1={m.row === 0 ? 16 : 28}
              y2={H - PAD.bottom}
              stroke="var(--loss)"
              strokeWidth={m.strong ? 1.6 : 1}
              strokeDasharray={m.strong ? undefined : "4 3"}
            />
            <text
              x={Math.min(xOf(m.v), W - PAD.right) - 5}
              y={m.row === 0 ? 12 : 24}
              textAnchor="end"
              fontSize="9.5"
              fontWeight={m.strong ? 600 : 400}
              fontFamily="var(--font-data)"
              fill="var(--loss)"
            >
              {m.label} {fmtUsd(m.v)}
            </text>
          </g>
        ))}

        <text x={PAD.left} y={H - 9} fontSize="9.5" fontFamily="var(--font-data)" fill="var(--ink-3)">
          gains
        </text>
        <text x={W - PAD.right} y={H - 9} textAnchor="end" fontSize="9.5" fontFamily="var(--font-data)" fill="var(--ink-3)">
          losses
        </text>
      </svg>
      <figcaption className="t-note px-1 pt-1">
        1Y rates-driven P&L per $1M book. tail beyond VaR95 in vermilion. ES95 {fmtUsd(result.es_95)}, ES99 {fmtUsd(result.es_99)}.
      </figcaption>
    </figure>
  );
}

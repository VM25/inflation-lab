"use client";

import { motion, useReducedMotion } from "framer-motion";
import { fmtSignedUsd } from "@/lib/formatters/numberFormatters";
import type { AttributionComponents } from "@/types/data";

const W = 800;
const H = 296;
const PAD = { top: 32, right: 18, bottom: 52, left: 64 };

/** Channel identity colors: the attribution palette is the design system. */
const CHANNELS: { key: keyof AttributionComponents; label: string; color: string }[] = [
  { key: "duration", label: "Duration", color: "var(--ink-2)" },
  { key: "real_rate", label: "Real rate", color: "var(--real)" },
  { key: "breakeven", label: "Breakeven", color: "var(--breakeven)" },
  { key: "convexity", label: "Convexity", color: "var(--gain)" },
  { key: "curve_shape", label: "Curve shape", color: "var(--warn)" },
  { key: "residual", label: "Residual", color: "var(--residual)" },
];

/**
 * Running attribution ledger: each channel steps the P&L from zero to the
 * exact repriced total. Residual is hatched: it is the honest remainder,
 * not a hidden plug. Bars rebuild with a short stagger when the state
 * changes so cause and effect read clearly.
 */
export function AttributionWaterfall({
  attribution,
  total,
  stateKey,
}: {
  attribution: AttributionComponents;
  total: number;
  stateKey: string;
}) {
  const reduced = useReducedMotion();

  const steps: { label: string; from: number; to: number; value: number; color: string; hatched: boolean }[] = [];
  let running = 0;
  for (const c of CHANNELS) {
    const v = attribution[c.key];
    if (Math.abs(v) < 0.5) continue;
    steps.push({
      label: c.label,
      from: running,
      to: running + v,
      value: v,
      color: c.color,
      hatched: c.key === "residual",
    });
    running += v;
  }

  const lo = Math.min(0, ...steps.map((s) => Math.min(s.from, s.to)), total);
  const hi = Math.max(0, ...steps.map((s) => Math.max(s.from, s.to)), total);
  const span = hi - lo || 1;
  const yOf = (v: number) => PAD.top + ((hi - v) / span) * (H - PAD.top - PAD.bottom);

  const n = steps.length + 1;
  const slot = (W - PAD.left - PAD.right) / n;
  const barW = Math.min(58, slot - 30);

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`Attribution waterfall. ${steps
          .map((s) => `${s.label} ${fmtSignedUsd(s.value)}`)
          .join(", ")}. Exact P&L ${fmtSignedUsd(total)}.`}
      >
        <defs>
          <pattern id="hatch" width="5" height="5" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <rect width="5" height="5" fill="var(--face-plate)" />
            <line x1="0" y1="0" x2="0" y2="5" stroke="var(--residual)" strokeWidth="1.6" />
          </pattern>
        </defs>

        <line x1={PAD.left} x2={W - PAD.right} y1={yOf(0)} y2={yOf(0)} stroke="var(--rule-strong)" strokeWidth="1.2" />
        <text x={PAD.left - 9} y={yOf(0) + 3.5} textAnchor="end" fontSize="10" fontFamily="var(--font-data)" fill="var(--ink-3)">
          $0
        </text>

        {steps.map((s, i) => {
          const x = PAD.left + i * slot + (slot - barW) / 2;
          const yTop = yOf(Math.max(s.from, s.to));
          const h = Math.abs(yOf(s.from) - yOf(s.to));
          const nextX = PAD.left + (i + 1) * slot + (slot - barW) / 2;
          const d = reduced ? 0 : i * 0.05;
          return (
            <g key={`${stateKey}-${s.label}`}>
              <motion.rect
                x={x}
                width={barW}
                y={yTop}
                height={Math.max(h, 1)}
                initial={reduced ? false : { scaleY: 0, opacity: 0 }}
                animate={{ scaleY: 1, opacity: 1 }}
                style={{ transformOrigin: `${x + barW / 2}px ${yOf(s.from)}px` }}
                transition={{ duration: 0.3, delay: d, ease: [0.23, 1, 0.32, 1] }}
                fill={s.hatched ? "url(#hatch)" : s.color}
                stroke={s.hatched ? "var(--residual)" : "none"}
                strokeWidth={s.hatched ? 1 : 0}
              />
              {/* carry rule to the next step */}
              <motion.line
                x1={x + barW}
                x2={nextX + (i === steps.length - 1 ? 0 : 0)}
                y1={yOf(s.to)}
                y2={yOf(s.to)}
                initial={reduced ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2, delay: d + 0.18 }}
                stroke="var(--rule-strong)"
                strokeDasharray="3 3"
              />
              <motion.text
                x={x + barW / 2}
                y={yTop - 7}
                initial={reduced ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2, delay: d + 0.12 }}
                textAnchor="middle"
                fontSize="10"
                fontFamily="var(--font-data)"
                fill="var(--ink-2)"
              >
                {fmtSignedUsd(s.value)}
              </motion.text>
              <text x={x + barW / 2} y={H - PAD.bottom + 16} textAnchor="middle" fontSize="10.5" fontFamily="var(--font-label)" fill="var(--ink-2)">
                {s.label}
              </text>
            </g>
          );
        })}

        {(() => {
          const x = PAD.left + steps.length * slot + (slot - barW) / 2;
          const yTop = yOf(Math.max(0, total));
          const h = Math.abs(yOf(0) - yOf(total));
          return (
            <g key={`${stateKey}-total`}>
              <rect
                x={x}
                y={yTop}
                width={barW}
                height={Math.max(h, 1)}
                fill={total < 0 ? "var(--loss-soft)" : "var(--gain-soft)"}
                stroke={total < 0 ? "var(--loss)" : "var(--gain)"}
                strokeWidth="1.6"
              />
              <text
                x={x + barW / 2}
                y={yTop - 7}
                textAnchor="middle"
                fontSize="10.5"
                fontFamily="var(--font-data)"
                fill={total < 0 ? "var(--loss)" : "var(--gain)"}
              >
                {fmtSignedUsd(total)}
              </text>
              <text x={x + barW / 2} y={H - PAD.bottom + 16} textAnchor="middle" fontSize="10.5" fontFamily="var(--font-label)" fontWeight="600" fill="var(--ink)">
                Exact P&L
              </text>
            </g>
          );
        })()}
      </svg>
      <figcaption className="t-note px-1 pt-1">
        channels step left to right and reconcile to the exact repriced total. hatched bar is the model residual.
      </figcaption>
    </figure>
  );
}

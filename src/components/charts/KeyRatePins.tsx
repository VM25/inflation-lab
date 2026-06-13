"use client";

import { motion, useReducedMotion } from "framer-motion";
import { fmtUsd } from "@/lib/formatters/numberFormatters";
import type { Tenor } from "@/types/data";
import { TENORS } from "@/types/data";

const W = 520;
const H = 212;
const PAD = { top: 26, right: 14, bottom: 30, left: 14 };

/**
 * Pin gauge for key-rate exposure: one stem per tenor with a square head,
 * read like indicator pins on a test rig. Supports a second series for
 * pre/post overlay comparison and signed values for key-rate P&L.
 */
export function KeyRatePins({
  series,
  unit,
  signed = false,
}: {
  series: { name: string; color: string; values: Record<Tenor, number> }[];
  unit: string;
  signed?: boolean;
}) {
  const reduced = useReducedMotion();
  const all = series.flatMap((s) => TENORS.map((t) => s.values[t]));
  const maxAbs = Math.max(...all.map(Math.abs), 1e-9);
  const zeroY = signed ? PAD.top + (H - PAD.top - PAD.bottom) / 2 : H - PAD.bottom;
  const scale = (signed ? (H - PAD.top - PAD.bottom) / 2 : H - PAD.top - PAD.bottom) / maxAbs;

  const slot = (W - PAD.left - PAD.right) / TENORS.length;
  const t = reduced ? { duration: 0 } : { duration: 0.28, ease: [0.23, 1, 0.32, 1] as const };

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`Key-rate ${unit} by tenor. ${series
          .map((s) => `${s.name}: ${TENORS.map((tn) => `${tn} ${fmtUsd(s.values[tn])}`).join(", ")}`)
          .join(". ")}`}
      >
        <line x1={PAD.left} x2={W - PAD.right} y1={zeroY} y2={zeroY} stroke="var(--rule-strong)" strokeWidth="1.2" />
        <text x={W - PAD.right} y={PAD.top - 10} textAnchor="end" fontSize="9" fontFamily="var(--font-data)" fill="var(--ink-3)">
          {unit}
        </text>

        {TENORS.map((tn, gi) => {
          const cx = PAD.left + gi * slot + slot / 2;
          const n = series.length;
          return (
            <g key={tn}>
              <text x={cx} y={H - 8} textAnchor="middle" fontSize="11" fontFamily="var(--font-data)" fill="var(--ink-2)">
                {tn}
              </text>
              {series.map((s, si) => {
                const v = s.values[tn];
                const stemH = Math.abs(v) * scale;
                const x = cx + (si - (n - 1) / 2) * 16;
                const headY = v >= 0 ? zeroY - stemH : zeroY + stemH;
                const other = n === 2 ? series[1 - si].values[tn] : null;
                const collide =
                  other != null && Math.abs(Math.abs(other) - Math.abs(v)) * scale < 14;
                const labelBelow = v >= 0 ? collide && si === 1 : !(collide && si === 1);
                return (
                  <g key={s.name}>
                    <motion.line
                      x1={x}
                      x2={x}
                      y1={zeroY}
                      initial={false}
                      animate={{ y2: headY }}
                      transition={t}
                      stroke={s.color}
                      strokeWidth="3"
                    />
                    <motion.rect
                      x={x - 4}
                      width="9"
                      height="9"
                      initial={false}
                      animate={{ y: headY - 4 }}
                      transition={t}
                      fill={s.color}
                    />
                    <motion.text
                      x={x}
                      initial={false}
                      animate={{ y: labelBelow ? headY + 18 : headY - 9 }}
                      transition={t}
                      textAnchor="middle"
                      fontSize="9.5"
                      fontFamily="var(--font-data)"
                      fill="var(--ink-2)"
                    >
                      {fmtUsd(v)}
                    </motion.text>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
      {series.length > 1 && (
        <figcaption className="flex gap-4 px-1 pt-1">
          {series.map((s) => (
            <span key={s.name} className="t-note flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-2 w-2" style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
        </figcaption>
      )}
    </figure>
  );
}

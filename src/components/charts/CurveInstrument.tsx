"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useMemo } from "react";
import type { Tenor } from "@/types/data";
import { TENORS } from "@/types/data";

const W = 820;
const H = 272;
const PAD = { top: 40, right: 26, bottom: 34, left: 50 };

/** sqrt-of-maturity scale: the front end gets the room a desk gives it */
const xOf = (years: number) =>
  PAD.left + (Math.sqrt(years) / Math.sqrt(30)) * (W - PAD.left - PAD.right);

/**
 * The shock instrument. The shaded region between the base and shocked
 * curves is the damage area: it is the picture of what the book at link 2
 * is about to pay for. Per-pillar deltas are labeled directly at the
 * displaced points; everything morphs with one spring.
 */
export function CurveInstrument({
  shortRate,
  nominal,
  shocks,
}: {
  shortRate: number;
  nominal: Record<Tenor, number>;
  shocks: Record<Tenor, number>;
}) {
  const reduced = useReducedMotion();

  const pts = useMemo(() => {
    const front = {
      years: 0.25,
      label: "3M",
      base: shortRate,
      shocked: shortRate + shocks["2Y"] / 10000,
      shock: shocks["2Y"],
    };
    const rest = TENORS.map((t) => ({
      years: { "2Y": 2, "5Y": 5, "10Y": 10, "30Y": 30 }[t],
      label: t as string,
      base: nominal[t],
      shocked: nominal[t] + shocks[t] / 10000,
      shock: shocks[t],
    }));
    return [front, ...rest];
  }, [shortRate, nominal, shocks]);

  const allY = pts.flatMap((p) => [p.base, p.shocked]);
  const yMin = Math.floor((Math.min(...allY) * 100 - 0.3) * 2) / 2;
  const yMax = Math.ceil((Math.max(...allY) * 100 + 0.45) * 2) / 2;
  const yOf = (d: number) =>
    PAD.top + (1 - (d * 100 - yMin) / (yMax - yMin)) * (H - PAD.top - PAD.bottom);

  const path = (k: "base" | "shocked") =>
    pts.map((p, i) => `${i === 0 ? "M" : "L"}${xOf(p.years).toFixed(1)},${yOf(p[k]).toFixed(1)}`).join(" ");
  const areaPath = () =>
    `${path("shocked")} ${[...pts]
      .reverse()
      .map((p) => `L${xOf(p.years).toFixed(1)},${yOf(p.base).toFixed(1)}`)
      .join(" ")} Z`;

  const yTicks: number[] = [];
  for (let v = yMin; v <= yMax + 1e-9; v += 0.5) yTicks.push(Number(v.toFixed(1)));
  const hasShock = TENORS.some((t) => shocks[t] !== 0);
  const netUp = TENORS.reduce((a, t) => a + shocks[t], 0) >= 0;
  const spring = reduced
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 170, damping: 26 };

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`Treasury curve, base versus shocked. ${pts
          .map((p) => `${p.label}: base ${(p.base * 100).toFixed(2)}%, shocked ${(p.shocked * 100).toFixed(2)}%`)
          .join(". ")}`}
      >
        {/* graticule */}
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={yOf(v / 100)} y2={yOf(v / 100)} stroke="var(--grid-line)" />
            <text x={PAD.left - 9} y={yOf(v / 100) + 3.5} textAnchor="end" fontSize="10.5" fontFamily="var(--font-data)" fill="var(--ink-3)">
              {v.toFixed(1)}
            </text>
          </g>
        ))}
        <text x={PAD.left - 9} y={PAD.top - 24} textAnchor="end" fontSize="9.5" fontFamily="var(--font-data)" fill="var(--ink-3)">
          %
        </text>

        {/* tenor pillars */}
        {pts.map((p) => (
          <g key={p.label}>
            <line x1={xOf(p.years)} x2={xOf(p.years)} y1={PAD.top - 6} y2={H - PAD.bottom} stroke="var(--grid-line)" />
            <text x={xOf(p.years)} y={H - PAD.bottom + 18} textAnchor="middle" fontSize="11.5" fontFamily="var(--font-data)" fill="var(--ink-2)">
              {p.label}
            </text>
          </g>
        ))}
        <text x={W - PAD.right} y={H - 6} textAnchor="end" fontSize="9.5" fontFamily="var(--font-data)" fill="var(--ink-3)">
          maturity, sqrt scale
        </text>

        {/* the damage area */}
        {hasShock && (
          <motion.path
            initial={false}
            animate={{ d: areaPath() }}
            transition={spring}
            fill={netUp ? "var(--loss-soft)" : "var(--gain-soft)"}
            stroke="none"
          />
        )}

        {/* base trace */}
        <path d={path("base")} fill="none" stroke="var(--ink)" strokeWidth="1.7" />
        {pts.map((p) => (
          <rect
            key={`b-${p.label}`}
            x={xOf(p.years) - 2.5}
            y={yOf(p.base) - 2.5}
            width="5"
            height="5"
            fill="var(--paper)"
            stroke="var(--ink)"
            strokeWidth="1.4"
          />
        ))}
        <text
          x={xOf(30) - 8}
          y={yOf(pts[4].base) + (netUp ? 16 : -10)}
          textAnchor="end"
          fontSize="10"
          fontFamily="var(--font-data)"
          fill="var(--ink-2)"
        >
          base
        </text>

        {/* shocked trace + direct per-pillar deltas */}
        {hasShock && (
          <>
            <motion.path
              initial={false}
              animate={{ d: path("shocked") }}
              transition={spring}
              fill="none"
              stroke="var(--shock)"
              strokeWidth="2.4"
            />
            {pts.slice(1).map((p) => {
              const up = p.shock >= 0;
              return (
                <g key={`s-${p.label}`}>
                  <motion.circle
                    cx={xOf(p.years)}
                    initial={false}
                    animate={{ cy: yOf(p.shocked) }}
                    transition={spring}
                    r="3.6"
                    fill="var(--shock)"
                  />
                  {p.shock !== 0 && (
                    <motion.text
                      x={xOf(p.years)}
                      initial={false}
                      animate={{ y: yOf(p.shocked) + (up ? -10 : 17) }}
                      transition={spring}
                      textAnchor="middle"
                      fontSize="10.5"
                      fontWeight="600"
                      fontFamily="var(--font-data)"
                      fill={up ? "var(--shock)" : "var(--gain)"}
                    >
                      {`${p.shock > 0 ? "+" : ""}${Math.round(p.shock)}`}
                    </motion.text>
                  )}
                </g>
              );
            })}
            <motion.circle
              cx={xOf(0.25)}
              initial={false}
              animate={{ cy: yOf(pts[0].shocked) }}
              transition={spring}
              r="3"
              fill="var(--shock)"
              opacity="0.7"
            />
          </>
        )}
      </svg>
      <figcaption className="flex items-center gap-5 px-1 pt-1">
        <span className="t-note flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-[2px] w-4 bg-ink" />
          base curve
        </span>
        <span className="t-note flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-[2.5px] w-4 bg-shock" />
          shocked curve, deltas in bp
        </span>
        <span className="t-note ml-auto hidden sm:flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-2.5 w-3.5" style={{ background: "var(--loss-soft)", outline: "1px solid var(--rule)" }} />
          repricing region
        </span>
      </figcaption>
    </figure>
  );
}

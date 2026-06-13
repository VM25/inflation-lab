"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useMemo } from "react";
import { Claim, Footnote, PanelHead, Roll } from "@/components/chain/bits";
import { ChainStep } from "@/components/chain/ChainStep";
import { useTokens } from "@/components/chain/useTokens";
import { useDesk } from "@/components/DeskContext";
import { computePortfolio } from "@/lib/calculations/portfolio";
import { fmtSignedUsd, fmtUsd } from "@/lib/formatters/numberFormatters";
import { useDerivedRisk } from "@/lib/hooks/useDerivedRisk";
import { TENORS } from "@/types/data";

/* ------------------------- the estimate ruler ------------------------- */

const RW = 660;
const RH = 132;
const RPAD = { top: 46, right: 30, bottom: 30, left: 30 };

function EstimateRuler({
  duration,
  convexity,
  exact,
}: {
  duration: number;
  convexity: number;
  exact: number;
}) {
  const reduced = useReducedMotion();
  const vals = [duration, convexity, exact];
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = Math.max(hi - lo, 1) * 1.18;
  const mid = (hi + lo) / 2;
  const xOf = (v: number) =>
    RPAD.left + ((v - (mid - span / 2)) / span) * (RW - RPAD.left - RPAD.right);
  const y = RH - RPAD.bottom - 24;
  const spring = reduced ? { duration: 0 } : { duration: 0.45, ease: [0.23, 1, 0.32, 1] as const };

  const marks = [
    { label: "duration only", v: duration, color: "var(--ink-3)", dy: -26 },
    { label: "plus convexity", v: convexity, color: "var(--ink-2)", dy: -26 },
    { label: "exact", v: exact, color: "var(--loss)", dy: -26 },
  ];
  // separate labels that land too close on the ruler
  const xs = marks.map((m) => xOf(m.v));
  if (Math.abs(xs[0] - xs[1]) < 86) marks[0].dy = -42;
  if (Math.abs(xs[1] - xs[2]) < 86) marks[1].dy = Math.abs(xs[0] - xs[1]) < 86 ? -26 : -42;

  return (
    <svg viewBox={`0 0 ${RW} ${RH}`} className="w-full" role="img"
      aria-label={`Estimate ruler. Duration only ${fmtSignedUsd(duration)}, plus convexity ${fmtSignedUsd(convexity)}, exact ${fmtSignedUsd(exact)}.`}>
      {/* the gap, shaded */}
      <motion.rect
        initial={false}
        animate={{ x: Math.min(xOf(duration), xOf(exact)), width: Math.abs(xOf(exact) - xOf(duration)) }}
        transition={spring}
        y={y - 7}
        height={14}
        fill="var(--loss-soft)"
      />
      <line x1={RPAD.left} x2={RW - RPAD.right} y1={y} y2={y} stroke="var(--rule-strong)" strokeWidth="1.4" />
      {marks.map((m) => (
        <g key={m.label}>
          <motion.line
            initial={false}
            animate={{ x1: xOf(m.v), x2: xOf(m.v) }}
            transition={spring}
            y1={y - 11}
            y2={y + 11}
            stroke={m.color}
            strokeWidth={m.label === "exact" ? 3 : 2}
          />
          <motion.text
            initial={false}
            animate={{ x: xOf(m.v) }}
            transition={spring}
            y={y + m.dy}
            textAnchor="middle"
            fontSize="10"
            fontWeight="600"
            fontFamily="var(--font-label)"
            fill={m.color}
          >
            {m.label}
          </motion.text>
          <motion.text
            initial={false}
            animate={{ x: xOf(m.v) }}
            transition={spring}
            y={y + m.dy + 12}
            textAnchor="middle"
            fontSize="10"
            fontFamily="var(--font-data)"
            fill={m.color}
          >
            {fmtSignedUsd(m.v)}
          </motion.text>
        </g>
      ))}
      <text x={RW - RPAD.right} y={RH - 6} textAnchor="end" fontSize="9.5" fontFamily="var(--font-data)" fill="var(--ink-3)">
        scenario P&L, $
      </text>
    </svg>
  );
}

/* --------------------- error vs shock size scatter --------------------- */

const SW = 660;
const SH = 252;
const SPAD = { top: 26, right: 26, bottom: 40, left: 56 };

function GapScatter({
  points,
  activeId,
}: {
  points: { id: string; name: string; size: number; err: number }[];
  activeId: string;
}) {
  const maxX = Math.max(...points.map((p) => p.size)) * 1.12;
  const maxY = Math.max(...points.map((p) => p.err)) * 1.15;
  const xOf = (v: number) => SPAD.left + (v / maxX) * (SW - SPAD.left - SPAD.right);
  const yOf = (v: number) => SPAD.top + (1 - v / maxY) * (SH - SPAD.top - SPAD.bottom);

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round((maxY * f) / 5000) * 5000);
  const labeled = new Set(
    [...points].sort((a, b) => b.err - a.err).slice(0, 2).map((p) => p.id),
  );

  return (
    <svg viewBox={`0 0 ${SW} ${SH}`} className="w-full" role="img"
      aria-label={`Duration-only error versus shock size across all scenarios. ${points
        .map((p) => `${p.name}: ${Math.round(p.size)} basis points average shock, ${fmtUsd(p.err)} error`)
        .join(". ")}`}>
      {[...new Set(yTicks)].map((v) => (
        <g key={v}>
          <line x1={SPAD.left} x2={SW - SPAD.right} y1={yOf(v)} y2={yOf(v)} stroke="var(--grid-line)" />
          <text x={SPAD.left - 8} y={yOf(v) + 3.5} textAnchor="end" fontSize="9.5" fontFamily="var(--font-data)" fill="var(--ink-3)">
            {v >= 1000 ? `${Math.round(v / 1000)}k` : v}
          </text>
        </g>
      ))}
      <line x1={SPAD.left} x2={SW - SPAD.right} y1={yOf(0)} y2={yOf(0)} stroke="var(--rule-strong)" strokeWidth="1.2" />
      {[100, 200, 300].map((v) => v <= maxX && (
        <text key={v} x={xOf(v)} y={SH - 24} textAnchor="middle" fontSize="9.5" fontFamily="var(--font-data)" fill="var(--ink-3)">
          {v}
        </text>
      ))}
      <text x={SW - SPAD.right} y={SH - 8} textAnchor="end" fontSize="9.5" fontFamily="var(--font-data)" fill="var(--ink-3)">
        average |shock|, bp
      </text>
      <text x={SPAD.left - 8} y={SPAD.top - 10} textAnchor="end" fontSize="9.5" fontFamily="var(--font-data)" fill="var(--ink-3)">
        $ error
      </text>

      {points.map((p) => {
        const active = p.id === activeId;
        return (
          <g key={p.id}>
            <circle
              cx={xOf(p.size)}
              cy={yOf(p.err)}
              r={active ? 6 : 4}
              fill={active ? "var(--loss)" : "var(--paper)"}
              stroke={active ? "var(--loss)" : "var(--ink-3)"}
              strokeWidth="1.5"
            />
            {(active || labeled.has(p.id)) && (
              <text
                x={xOf(p.size)}
                y={yOf(p.err) - 11}
                textAnchor={xOf(p.size) > SW - 150 ? "end" : "middle"}
                fontSize="9.5"
                fontWeight={active ? 700 : 500}
                fontFamily="var(--font-label)"
                fill={active ? "var(--loss)" : "var(--ink-2)"}
              >
                {p.name}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/* ------------------------------ the step ------------------------------ */

export function GapStep() {
  const { scenarios, bonds, instrumentScenarioResults } = useDesk();
  const { scenario, weights, pre } = useDerivedRisk();
  const tokens = useTokens();

  const points = useMemo(
    () =>
      scenarios
        .filter((s) => s.scenario_type !== "base")
        .map((s) => {
          const r = computePortfolio(weights, bonds, instrumentScenarioResults, s.scenario_id);
          return {
            id: s.scenario_id,
            name: s.name,
            size: TENORS.reduce((a, t) => a + Math.abs(s.shocks_bps[t]), 0) / 4,
            err: Math.abs(r.pnlDurationOnly - r.pnlExact),
          };
        }),
    [scenarios, weights, bonds, instrumentScenarioResults],
  );

  const errDuration = Math.abs(pre.pnlDurationOnly - pre.pnlExact);
  const pctErr =
    pre.pnlExact !== 0 ? `${(Math.abs(errDuration / pre.pnlExact) * 100).toFixed(1)}%` : "0.0%";

  return (
    <ChainStep id="gap" kicker="Link 4 · The shortcut gap">
      <Claim>
        The duration shortcut misses this loss by{" "}
        <Roll text={fmtUsd(errDuration)} order={errDuration} ghosts={["$888,888"]} tone="loss" />{" "}
        (
        <Roll text={pctErr} order={errDuration} ghosts={["88.8%"]} tone="loss" />
        ); the miss compounds with the size of the move and the twist in the curve.
      </Claim>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div className="panel flex flex-col">
          <PanelHead
            title="Three answers to one question"
            right={
              <Roll
                text={scenario.name}
                order={tokens.scenarioOrder(scenario.scenario_id)}
                ghosts={tokens.scenarioNames}
                align="right"
              />
            }
          />
          <div className="chart-scroll flex-1">
            <div className="flex h-full min-w-[420px] flex-col justify-center p-3">
              <EstimateRuler
                duration={pre.pnlDurationOnly}
                convexity={pre.pnlConvexityAdjusted}
                exact={pre.pnlExact}
              />
            </div>
          </div>
          <p className="border-t border-rule px-4 py-2.5 text-[12px] leading-relaxed text-ink-3">
            Shaded span = what the first-order shortcut gets wrong under this
            shock. Convexity closes most of it; curve shape does the rest.
          </p>
        </div>

        <div className="panel">
          <PanelHead title="The same gap, across all ten shocks" right="this book, duration-only error" />
          <div className="chart-scroll">
            <div className="min-w-[480px] p-3">
              <GapScatter points={points} activeId={scenario.scenario_id} />
            </div>
          </div>
        </div>
      </div>
      <div className="mt-3">
        <Footnote>
          First-order estimates price the average pillar move around today&apos;s
          curve. Convexity makes the error grow roughly with the square of a parallel move, and curve twists add a key-rate gap on top,
          which is why the engine reprices cash flows directly rather than relying on a duration estimate.
        </Footnote>
      </div>
    </ChainStep>
  );
}

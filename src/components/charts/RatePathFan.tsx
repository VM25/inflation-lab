"use client";

import type { ModelPathSummary } from "@/types/data";

const W = 600;
const H = 252;
const PAD = { top: 22, right: 76, bottom: 30, left: 44 };

export interface FanModel {
  name: string;
  color: string;
  soft: string;
  /** dashed mean + edge-ruled bands distinguish the second model */
  dashed?: boolean;
  summary: ModelPathSummary;
}

/**
 * Simulated short-rate fan. Each model has its own visual signature:
 * Vasicek runs graphite with a dashed mean and open, edge-ruled bands;
 * CIR runs iris with a solid mean and filled bands. End labels claim
 * their own vertical space so the combined view never overlaps.
 */
export function RatePathFan({ models }: { models: FanModel[] }) {
  const allVals = models.flatMap((m) => [...m.summary.p05_path, ...m.summary.p95_path]);
  const lo = Math.min(...allVals, 0) * 100;
  const hi = Math.max(...allVals) * 100;
  const span = hi - lo || 1;

  const xOf = (t: number) => PAD.left + t * (W - PAD.left - PAD.right);
  const yOf = (rate: number) => PAD.top + ((hi - rate * 100) / span) * (H - PAD.top - PAD.bottom);

  const line = (grid: number[], vals: number[]) =>
    grid.map((t, i) => `${i === 0 ? "M" : "L"}${xOf(t).toFixed(1)},${yOf(vals[i]).toFixed(1)}`).join(" ");
  const band = (grid: number[], up: number[], down: number[]) =>
    `${line(grid, up)} ${[...grid].reverse().map((t, i) => `L${xOf(t).toFixed(1)},${yOf(down[down.length - 1 - i]).toFixed(1)}`).join(" ")} Z`;

  const yTicks: number[] = [];
  const step = span > 6 ? 2 : 1;
  for (let v = Math.ceil(lo); v <= hi; v += step) yTicks.push(v);

  // end labels: push apart if the means finish too close together
  const ends = models.map((m) => yOf(m.summary.mean_path[m.summary.mean_path.length - 1]));
  const labelYs = [...ends];
  if (labelYs.length === 2 && Math.abs(labelYs[0] - labelYs[1]) < 18) {
    const mid = (labelYs[0] + labelYs[1]) / 2;
    const orderTop = labelYs[0] <= labelYs[1] ? 0 : 1;
    labelYs[orderTop] = mid - 10;
    labelYs[1 - orderTop] = mid + 10;
  }

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`Simulated short-rate paths over one year. ${models
          .map(
            (m) =>
              `${m.name}: median terminal ${(m.summary.terminal_distribution.median * 100).toFixed(2)}%, p05 to p95 ${(m.summary.terminal_distribution.p05 * 100).toFixed(2)}% to ${(m.summary.terminal_distribution.p95 * 100).toFixed(2)}%`,
          )
          .join(". ")}`}
      >
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={yOf(v / 100)} y2={yOf(v / 100)} stroke="var(--grid-line)" />
            <text x={PAD.left - 8} y={yOf(v / 100) + 3.5} textAnchor="end" fontSize="10.5" fontFamily="var(--font-data)" fill="var(--ink-3)">
              {v}%
            </text>
          </g>
        ))}
        {lo < 0 && (
          <line x1={PAD.left} x2={W - PAD.right} y1={yOf(0)} y2={yOf(0)} stroke="var(--loss)" strokeDasharray="4 4" />
        )}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <text key={t} x={xOf(t)} y={H - 8} textAnchor="middle" fontSize="10.5" fontFamily="var(--font-data)" fill="var(--ink-2)">
            {t === 0 ? "0" : `${t}y`}
          </text>
        ))}

        {models.map((m, i) => (
          <g key={m.name}>
            {m.dashed ? (
              <>
                {/* open band: ruled edges, barely-there fill */}
                <path d={band(m.summary.time_grid, m.summary.p95_path, m.summary.p05_path)} fill={m.soft} opacity="0.55" />
                <path d={line(m.summary.time_grid, m.summary.p95_path)} fill="none" stroke={m.color} strokeWidth="1" strokeDasharray="2 4" />
                <path d={line(m.summary.time_grid, m.summary.p05_path)} fill="none" stroke={m.color} strokeWidth="1" strokeDasharray="2 4" />
              </>
            ) : (
              <>
                <path d={band(m.summary.time_grid, m.summary.p95_path, m.summary.p05_path)} fill={m.soft} />
                <path d={band(m.summary.time_grid, m.summary.p75_path, m.summary.p25_path)} fill={m.soft} />
              </>
            )}
            <path
              d={line(m.summary.time_grid, m.summary.mean_path)}
              fill="none"
              stroke={m.color}
              strokeWidth="2"
              strokeDasharray={m.dashed ? "7 5" : undefined}
            />
            {/* leader to its own label slot */}
            <line
              x1={xOf(1)}
              x2={xOf(1) + 8}
              y1={ends[i]}
              y2={labelYs[i]}
              stroke={m.color}
              strokeWidth="1"
            />
            <text
              x={xOf(1) + 11}
              y={labelYs[i] + 3.5}
              fontSize="10.5"
              fontWeight="600"
              fontFamily="var(--font-data)"
              fill={m.color}
            >
              {m.name}
            </text>
          </g>
        ))}
      </svg>
      <figcaption className="flex flex-wrap items-center gap-x-5 gap-y-1 px-1 pt-1">
        {models.map((m) => (
          <span key={m.name} className="t-note flex items-center gap-1.5">
            <svg width="22" height="8" aria-hidden>
              <line x1="0" y1="4" x2="22" y2="4" stroke={m.color} strokeWidth="2" strokeDasharray={m.dashed ? "5 3" : undefined} />
            </svg>
            {m.name} mean, bands p05 to p95
          </span>
        ))}
        {lo < 0 && <span className="t-note text-loss">dashed red rule marks 0%</span>}
      </figcaption>
    </figure>
  );
}

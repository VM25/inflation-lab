"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ShockGlyph } from "@/components/engine/ShockGlyph";
import { fmtSignedUsd } from "@/lib/formatters/numberFormatters";
import type { Tenor } from "@/types/data";

/**
 * The stress ladder: every scenario's exact P&L for the active book,
 * bars running left (loss) or right (gain) of a center zero rail.
 * Rows are controls: selecting one re-aims the whole engine.
 */
export function ScenarioLadder({
  rows,
  selectedId,
  onSelect,
}: {
  rows: { id: string; name: string; pnl: number; shocks: Record<Tenor, number> }[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const reduced = useReducedMotion();
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.pnl)), 1);

  return (
    <div role="listbox" aria-label="Scenario stress ladder. Select to load a scenario.">
      {rows.map((r) => {
        const selected = r.id === selectedId;
        const frac = Math.abs(r.pnl) / maxAbs;
        const isLoss = r.pnl < 0;
        return (
          <button
            key={r.id}
            type="button"
            role="option"
            aria-selected={selected}
            onClick={() => onSelect(r.id)}
            className={`grid w-full grid-cols-[44px_130px_1fr_96px] items-center gap-3 px-3 py-[6px] text-left transition-colors duration-150 sm:grid-cols-[46px_180px_1fr_110px] ${
              selected ? "bg-paper-2" : "hover:bg-paper-2/60"
            }`}
            style={selected ? { boxShadow: "inset 2px 0 0 var(--ink)" } : undefined}
          >
            <ShockGlyph shocks={r.shocks} inverted={selected} />
            <span
              className={`truncate font-[family-name:var(--font-label)] text-[12px] ${
                selected ? "font-semibold text-ink" : "font-medium text-ink-2"
              }`}
            >
              {r.name}
            </span>
            <span className="relative block h-[11px]">
              <span aria-hidden className="absolute inset-y-0 left-1/2 w-px bg-rule-strong" />
              <motion.span
                initial={false}
                animate={{ width: `${(frac * 49).toFixed(2)}%` }}
                transition={reduced ? { duration: 0 } : { duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                className="absolute inset-y-[2px]"
                style={{
                  background: isLoss ? "var(--loss)" : "var(--gain)",
                  opacity: selected ? 1 : 0.55,
                  left: isLoss ? undefined : "50%",
                  right: isLoss ? "50%" : undefined,
                }}
              />
            </span>
            <span
              className={`t-data text-right text-[12px] ${
                isLoss ? "text-loss" : r.pnl > 0 ? "text-gain" : "text-ink-3"
              }`}
            >
              {fmtSignedUsd(r.pnl)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

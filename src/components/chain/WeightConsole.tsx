"use client";

import { useMemo } from "react";
import { Slider } from "@/components/ui/slider";
import { useDesk } from "@/components/DeskContext";
import { normalizeWeights } from "@/lib/calculations/portfolio";
import { fmtWeight } from "@/lib/formatters/numberFormatters";
import { useRiskStore } from "@/stores/riskStore";

const SLEEVES = [
  { id: "CASH", label: "Cash 3M" },
  { id: "UST_2Y", label: "UST 2Y" },
  { id: "UST_5Y", label: "UST 5Y" },
  { id: "UST_10Y", label: "UST 10Y" },
  { id: "UST_30Y", label: "UST 30Y" },
  { id: "TIPS_10Y", label: "TIPS 10Y" },
];

/**
 * Sleeve weight console. Moving one fader rescales the others
 * proportionally, so the book always sums to exactly 100%:
 * the console cannot express an invalid state.
 */
export function WeightConsole() {
  const { presets } = useDesk();
  const { selectedPortfolioId, customWeights, setCustomWeights } = useRiskStore();

  const preset =
    presets.find((p) => p.portfolio_id === selectedPortfolioId) ?? presets[0];
  const weights = customWeights ?? preset.weights;
  const isCustom = customWeights != null;

  const handle = useMemo(
    () => (id: string, raw: number) => {
      const target = Math.min(Math.max(raw / 100, 0), 0.9);
      const others = SLEEVES.map((s) => s.id).filter((k) => k !== id);
      const othersTotal = others.reduce((a, k) => a + (weights[k] ?? 0), 0);
      const next: Record<string, number> = { [id]: target };
      const remaining = 1 - target;
      for (const k of others) {
        next[k] =
          othersTotal > 0
            ? ((weights[k] ?? 0) / othersTotal) * remaining
            : remaining / others.length;
      }
      setCustomWeights(normalizeWeights(next));
    },
    [weights, setCustomWeights],
  );

  return (
    <div>
      <div className="space-y-3">
        {SLEEVES.map((s) => {
          const w = weights[s.id] ?? 0;
          return (
            <div
              key={s.id}
              className="grid grid-cols-[78px_1fr_46px] items-center gap-3"
            >
              <label
                htmlFor={`fader-${s.id}`}
                className={`t-label ${s.id === "TIPS_10Y" ? "text-real" : "text-ink-2"}`}
              >
                {s.label}
              </label>
              <Slider
                id={`fader-${s.id}`}
                aria-label={`${s.label} weight percent`}
                value={[Math.round(w * 100)]}
                min={0}
                max={90}
                step={5}
                onValueChange={([v]) => handle(s.id, v)}
                className="**:data-[slot=slider-track]:h-[5px] **:data-[slot=slider-track]:rounded-none **:data-[slot=slider-range]:rounded-none **:data-[slot=slider-thumb]:size-4 **:data-[slot=slider-thumb]:rounded-none **:data-[slot=slider-thumb]:border-2"
              />
              <span className="t-data text-right text-[13px] text-ink">
                {fmtWeight(w)}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-rule pt-3">
        <p className="t-note">sums to 100% by construction. no leverage, no shorts.</p>
        {isCustom && (
          <button
            type="button"
            onClick={() => setCustomWeights(null)}
            className="t-label text-hedge underline-offset-2 hover:underline"
          >
            Reset to book
          </button>
        )}
      </div>
    </div>
  );
}

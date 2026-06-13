"use client";

import { useState } from "react";
import { KeyRatePins } from "@/components/charts/KeyRatePins";
import { Claim, ControlCue, Footnote, PanelHead, Roll, Subject, TokenChip } from "@/components/chain/bits";
import { useTokens } from "@/components/chain/useTokens";
import { ChainStep } from "@/components/chain/ChainStep";
import { WeightConsole } from "@/components/chain/WeightConsole";
import { useDesk } from "@/components/DeskContext";
import { fmtPct, fmtUsd, fmtWeight } from "@/lib/formatters/numberFormatters";
import { useDerivedRisk } from "@/lib/hooks/useDerivedRisk";
import { useRiskStore } from "@/stores/riskStore";
import { TENORS } from "@/types/data";

const fmtBp = (v: number) => `$${v.toFixed(0)}/bp`;

export function BookStep() {
  const { presets, bonds } = useDesk();
  const { preset, weights, isCustom, pre } = useDerivedRisk();
  const { selectedPortfolioId, setPortfolio } = useRiskStore();
  const [editing, setEditing] = useState(false);
  const [showHoldings, setShowHoldings] = useState(false);
  const tokens = useTokens();

  const peak = TENORS.reduce((m, t) =>
    pre.keyRateDv01[t] > pre.keyRateDv01[m] ? t : m,
  );
  const pinsSum = TENORS.reduce((a, t) => a + pre.keyRateDv01[t], 0);
  const cashBond = bonds.find((b) => b.instrument_id === "CASH");
  const cashDv01 = (weights["CASH"] ?? 0) * 1_000_000 * (cashBond?.duration_modified ?? 0) * 1e-4;
  const convGap = pre.dv01 - pinsSum - cashDv01;

  return (
    <ChainStep id="book" kicker="Link 2 · The book">
      <Subject
        items={[
          <TokenChip
            key="b"
            text={preset.name}
            order={tokens.bookOrder(preset.portfolio_id)}
            ghosts={tokens.bookNames}
          />,
        ]}
      />
      <Claim>
        Carries{" "}
        <Roll text={`${pre.durationModified.toFixed(2)}y`} order={pre.durationModified} ghosts={["88.88y"]} tone="ink" />{" "}
        of duration and{" "}
        <Roll text={fmtUsd(pre.dv01)} order={pre.dv01} ghosts={["$8,888"]} tone="ink" />
        /bp of DV01, concentrated at the{" "}
        <Roll text={`${peak}.`} order={["2Y","5Y","10Y","30Y"].indexOf(peak)} ghosts={["30Y."]} tone="ink" />
      </Claim>
      <div className="mt-1.5 max-w-[68ch] text-[13.5px] leading-relaxed text-ink-2">
        <Roll
          text={preset.description}
          order={tokens.bookOrder(preset.portfolio_id)}
          ghosts={presets.map((x) => x.description)}
          block
        />
      </div>

      <div className="mt-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4">
          <ControlCue>Choose the book the shock hits. The loss below follows it.</ControlCue>
          <button
            type="button"
            aria-expanded={editing}
            onClick={() => setEditing((v) => !v)}
            className={`t-label mb-2 underline-offset-4 transition-colors ${
              editing || isCustom ? "text-hedge underline" : "text-ink-3 hover:text-ink-2 hover:underline"
            }`}
          >
            {isCustom ? "weights edited · adjust" : "adjust sleeve weights"}
          </button>
        </div>
        <div role="radiogroup" aria-label="Treasury book" className="flex flex-wrap gap-2">
          {presets.map((p) => {
            const active = p.portfolio_id === selectedPortfolioId;
            return (
              <button
                key={p.portfolio_id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setPortfolio(p.portfolio_id)}
                title={p.description}
                className="option px-3 py-2 font-[family-name:var(--font-label)] text-[12.5px] font-semibold"
              >
                {p.name}
              </button>
            );
          })}

        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {editing && (
          <div className="panel">
            <PanelHead title="Sleeve weights" right="always sums to 100%, no shorts" />
            <div className="p-4 sm:p-5">
              <WeightConsole />
            </div>
          </div>
        )}
        <div className={`panel ${editing ? "" : "lg:col-span-2"}`}>
          <PanelHead
            title="Where the rate risk sits, key-rate DV01"
            right={`${fmtUsd(1_000_000)} book`}
          />
          <div className="chart-scroll">
            <div className={`min-w-[460px] p-3 sm:p-4 ${editing ? "" : "mx-auto max-w-[640px]"}`}>
              <KeyRatePins
                unit="$/bp"
                series={[{ name: "Key-rate DV01", color: "var(--ink-2)", values: pre.keyRateDv01 }]}
              />
            </div>
          </div>
          <p className="t-note border-t border-rule px-4 py-2 leading-relaxed">
            pins sum to{" "}
            <Roll text={fmtBp(pinsSum)} order={pinsSum} ghosts={["$8,888/bp"]} className="text-ink-2" />{" "}
            of curve sensitivity; total DV01{" "}
            <Roll text={fmtBp(pre.dv01)} order={pre.dv01} ghosts={["$8,888/bp"]} className="text-ink-2" />{" "}
            is yield-based. the difference is the 3M cash position (
            <Roll text={fmtBp(cashDv01)} order={cashDv01} ghosts={["$888/bp"]} className="text-ink-2" />
            ) plus the yield-vs-curve convention (
            <Roll text={fmtBp(convGap)} order={convGap} ghosts={["$888/bp"]} className="text-ink-2" />
            ).
          </p>
        </div>
      </div>

      {/* holdings, tucked away until asked for */}
      <div className="mt-3">
        <button
          type="button"
          aria-expanded={showHoldings}
          onClick={() => setShowHoldings((v) => !v)}
          className="t-label text-ink-2 underline-offset-4 hover:text-ink hover:underline"
        >
          {showHoldings ? "Hide the six instruments" : "See the six instruments behind the book"}
        </button>
        {showHoldings && (
          <div className="panel chart-scroll mt-2">
            <table className="w-full min-w-[680px] text-[12px]">
              <caption className="sr-only">Holdings with weight, coupon, yield, duration and DV01</caption>
              <thead>
                <tr>
                  {["Instrument", "Weight", "Coupon", "Yield", "ModDur", "DV01/100"].map((h, i) => (
                    <th key={h} className={`t-label px-4 py-2 ${i > 0 ? "text-right" : "text-left"}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="t-data">
                {bonds.map((b) => {
                  const w = weights[b.instrument_id] ?? 0;
                  return (
                    <tr key={b.instrument_id} className={`border-t border-rule ${w === 0 ? "opacity-40" : ""}`}>
                      <td className="px-4 py-1.5 font-[family-name:var(--font-label)] text-ink-2">
                        {b.name}
                        {b.is_tips_style && <span className="ml-2 text-[10px] text-real">real curve</span>}
                      </td>
                      <td className="px-4 py-1.5 text-right font-medium text-ink">{fmtWeight(w)}</td>
                      <td className="px-4 py-1.5 text-right text-ink-2">{fmtPct(b.coupon_rate)}</td>
                      <td className="px-4 py-1.5 text-right text-ink-2">{fmtPct(b.base_yield)}</td>
                      <td className="px-4 py-1.5 text-right text-ink-2">{b.duration_modified.toFixed(2)}</td>
                      <td className="px-4 py-1.5 text-right text-ink-2">${b.dv01_per_100_face.toFixed(3)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="mt-3">
        <Footnote>
          A book can look tame on total duration while hiding a concentrated
          30Y position. The pins above are what the shock at link 1 actually
          finds.
        </Footnote>
      </div>
    </ChainStep>
  );
}

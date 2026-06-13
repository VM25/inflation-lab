"use client";

import { KeyRatePins } from "@/components/charts/KeyRatePins";
import { Claim, ControlCue, Footnote, LivePnl, PanelHead, Roll, Subject, TokenChip } from "@/components/chain/bits";
import { useTokens } from "@/components/chain/useTokens";
import { ChainStep } from "@/components/chain/ChainStep";
import { useDesk } from "@/components/DeskContext";
import { fmtPct, fmtUsd, fmtWeight } from "@/lib/formatters/numberFormatters";
import { useDerivedRisk } from "@/lib/hooks/useDerivedRisk";
import { useRiskStore } from "@/stores/riskStore";

const TARGET: Record<string, string> = {
  parallel_rate_increase: "targets total DV01",
  bear_steepener_term_premium: "targets 10Y/30Y key rates",
  breakeven_inflation_shock: "targets breakeven risk",
  concentrated_key_rate_exposure: "shifts 10Y/30Y DV01 to the front",
};

const SLEEVES = ["CASH", "UST_2Y", "UST_5Y", "UST_10Y", "UST_30Y", "TIPS_10Y"];
const SHORT: Record<string, string> = {
  CASH: "Cash", UST_2Y: "2Y", UST_5Y: "5Y", UST_10Y: "10Y", UST_30Y: "30Y", TIPS_10Y: "TIPS",
};

export function HedgeStep() {
  const { overlays } = useDesk();
  const { scenario, overlay, weights, postWeights, pre, post, effectiveness, overlayImpact, residualLoss } =
    useDerivedRisk();
  const { selectedOverlayId, setOverlay } = useRiskStore();
  const tokens = useTokens();

  const isBase = scenario.scenario_type === "base";

  return (
    <ChainStep id="hedge" kicker="Link 5 · The hedge">
      <Subject
        items={[
          <TokenChip
            key="o"
            text={overlay.name.replace(" Overlay", "")}
            order={tokens.overlayOrder(overlay.overlay_id)}
            ghosts={tokens.overlayNames}
          />,
        ]}
      />
      <Claim>
        Recovers{" "}
        <Roll
          text={effectiveness == null ? "n/a" : fmtUsd(Math.abs(overlayImpact))}
          order={Math.abs(overlayImpact)}
          ghosts={["$888,888"]}
          tone="hedge"
        />{" "}
        (
        <Roll
          text={effectiveness == null ? "0%" : fmtPct(effectiveness, 0)}
          order={effectiveness ?? 0}
          ghosts={["88%"]}
          tone="hedge"
        />
        ) of the scenario loss and leaves <LivePnl value={residualLoss} reserve="-$888,888" /> on the book.
      </Claim>

      <div className="mt-5">
        <ControlCue>Choose the overlay. The recovery and the ledger below follow it.</ControlCue>
        <div role="radiogroup" aria-label="Hedge overlay" className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {overlays.map((o) => {
            const active = o.overlay_id === selectedOverlayId;
            return (
              <button
                key={o.overlay_id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setOverlay(o.overlay_id)}
                className="option px-3 py-2.5"
              >
                <span className="block font-[family-name:var(--font-label)] text-[12.5px] font-semibold">
                  {o.name.replace(" Overlay", "")}
                </span>
                <span className={`mt-0.5 block text-[11px] ${active ? "text-paper/80" : "text-ink-3"}`}>
                  {TARGET[o.target_risk] ?? o.target_risk}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* what the overlay moves */}
        <div className="panel">
          <PanelHead title="What the overlay moves" right="no leverage, no shorts" />
          <div className="chart-scroll">
            <table className="w-full min-w-[320px] text-[12.5px]">
              <caption className="sr-only">Sleeve weights before and after the overlay</caption>
              <thead>
                <tr>
                  <th className="t-label px-4 py-2 text-left">Sleeve</th>
                  <th className="t-label px-4 py-2 text-right">Before</th>
                  <th className="t-label px-4 py-2 text-right">After</th>
                  <th className="t-label px-4 py-2 text-right">Shift</th>
                </tr>
              </thead>
              <tbody className="t-data">
                {SLEEVES.map((id) => {
                  const w0 = weights[id] ?? 0;
                  const w1 = postWeights[id] ?? 0;
                  const d = w1 - w0;
                  const still = Math.abs(d) < 0.005;
                  return (
                    <tr key={id} className="border-t border-rule">
                      <td className="px-4 py-1.5 font-[family-name:var(--font-label)] text-ink-2">{SHORT[id]}</td>
                      <td className="px-4 py-1.5 text-right text-ink-3">{fmtWeight(w0)}</td>
                      <td className="px-4 py-1.5 text-right font-medium text-ink">{fmtWeight(w1)}</td>
                      <td className={`px-4 py-1.5 text-right ${still ? "text-ink-3" : d > 0 ? "text-hedge" : "text-loss"}`}>
                        {still ? "0" : `${d > 0 ? "+" : "-"}${Math.abs(Math.round(d * 100))}pp`}
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t border-rule">
                  <td className="t-label px-4 py-2">DV01</td>
                  <td className="t-data px-4 py-2 text-right"><Roll text={fmtUsd(pre.dv01)} order={pre.dv01} ghosts={["$8,888"]} tone="dim" align="right" /></td>
                  <td className="t-data px-4 py-2 text-right font-medium">
                    <Roll text={fmtUsd(post.dv01)} order={post.dv01} ghosts={["$8,888"]} tone="hedge" align="right" />
                  </td>
                  <td className="px-4 py-2 text-right text-ink-3">/bp</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* what changes on the curve */}
        <div className="panel">
          <PanelHead title="Key-rate DV01, with and without the overlay" />
          <div className="chart-scroll">
            <div className="min-w-[460px] p-3 sm:p-4">
              <KeyRatePins
                unit="$/bp"
                series={[
                  { name: "Without", color: "var(--ink-2)", values: pre.keyRateDv01 },
                  { name: "With overlay", color: "var(--hedge)", values: post.keyRateDv01 },
                ]}
              />
            </div>
          </div>
        </div>
      </div>
      <div className="mt-3">
        <Footnote>
          Overlays are rule-based weight transfers: each one reduces a named
          exposure and reports the loss that remains. The
          residual stays visible through the rest of the chain.
        </Footnote>
      </div>
    </ChainStep>
  );
}

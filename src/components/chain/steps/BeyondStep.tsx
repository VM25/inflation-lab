"use client";

import { useMemo } from "react";
import { LossDistribution } from "@/components/charts/LossDistribution";
import { RatePathFan } from "@/components/charts/RatePathFan";
import { Claim, ControlCue, Footnote, PanelHead, Roll, Subject, TokenChip } from "@/components/chain/bits";
import { useTokens } from "@/components/chain/useTokens";
import { ChainStep } from "@/components/chain/ChainStep";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useDesk } from "@/components/DeskContext";
import { fmtPct, fmtUsd } from "@/lib/formatters/numberFormatters";
import { useDerivedRisk } from "@/lib/hooks/useDerivedRisk";
import { useRiskStore, type StochasticModelView } from "@/stores/riskStore";

const MODEL_STYLE = {
  vasicek: { color: "var(--m-vas)", soft: "var(--m-vas-soft)", dashed: true },
  cir: { color: "var(--m-cir)", soft: "var(--m-cir-soft)", dashed: false },
} as const;

export function BeyondStep() {
  const { stochasticParams, pathsSummary, varResults } = useDesk();
  const { preset, isCustom } = useDerivedRisk();
  const { stochasticModel, setStochasticModel } = useRiskStore();
  const tokens = useTokens();

  const models = useMemo(() => {
    const all = [
      { id: "vasicek" as const, name: "Vasicek", summary: pathsSummary.models.vasicek },
      { id: "cir" as const, name: "CIR", summary: pathsSummary.models.cir },
    ];
    return stochasticModel === "both" ? all : all.filter((m) => m.id === stochasticModel);
  }, [stochasticModel, pathsSummary]);

  const varRows = varResults.filter(
    (v) =>
      v.portfolio_id === preset.portfolio_id &&
      (stochasticModel === "both" || v.model === stochasticModel),
  );
  const worst99 = Math.max(...varResults
    .filter((v) => v.portfolio_id === preset.portfolio_id)
    .map((v) => v.var_99));
  const s2 = pathsSummary.simulation_settings;

  return (
    <ChainStep id="beyond" kicker="Link 7 · Beyond one shock">
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
        Across {s2.num_paths.toLocaleString()} simulated rate paths, one-year
        rates-driven losses stay under{" "}
        <Roll text={fmtUsd(worst99)} order={worst99} ghosts={["$888,888"]} tone="loss" />{" "}
        in 99 of 100 paths, on the wider model.
      </Claim>
      <p className="mt-2 max-w-[68ch] text-[13.5px] leading-relaxed text-ink-2">
        Named scenarios ask &quot;what if this happens&quot;. The simulation asks
        &quot;what range should we plan for&quot;: a market short-rate proxy follows two
        calibrated mean-reverting models, each terminal rate maps to a
        tenor-scaled curve shift, and the book reprices on every path.
      </p>

      <div className="mt-5">
        <ControlCue>Pick the model lens. Only this link changes.</ControlCue>
        <ToggleGroup
          type="single"
          value={stochasticModel}
          onValueChange={(v) => v && setStochasticModel(v as StochasticModelView)}
          aria-label="Stochastic model"
          className="rounded-md border border-rule bg-card"
        >
          {(["vasicek", "cir", "both"] as const).map((m) => (
            <ToggleGroupItem
              key={m}
              value={m}
              className="t-label h-9 gap-2 rounded-md px-4 data-[state=on]:bg-ink data-[state=on]:text-paper"
            >
              {m !== "both" ? (
                <svg width="18" height="6" aria-hidden>
                  <line
                    x1="0" y1="3" x2="18" y2="3"
                    stroke={MODEL_STYLE[m].color}
                    strokeWidth="2.5"
                    strokeDasharray={MODEL_STYLE[m].dashed ? "4 3" : undefined}
                  />
                </svg>
              ) : null}
              {m === "both" ? "Both" : m === "cir" ? "CIR" : "Vasicek"}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="panel">
          <PanelHead
            title="Simulated short-rate paths, one year"
            right={`calibrated on ${stochasticParams.short_rate_proxy}, ${stochasticParams.calibration_window.start_date.slice(0, 4)} to ${stochasticParams.calibration_window.end_date.slice(0, 4)}`}
          />
          <div className="chart-scroll">
            <div className="min-w-[520px] p-3 sm:p-4">
              <RatePathFan
                models={models.map((m) => ({
                  name: m.name,
                  color: MODEL_STYLE[m.id].color,
                  soft: MODEL_STYLE[m.id].soft,
                  dashed: MODEL_STYLE[m.id].dashed,
                  summary: m.summary,
                }))}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {models.map((m) => {
            const p = stochasticParams[m.id];
            return (
              <div key={m.id} className="panel">
                <PanelHead
                  title={m.name}
                  right={
                    m.id === "cir" ? (
                      <span className={p.feller_condition ? "text-gain" : "text-warn"}>
                        Feller {p.feller_condition ? "holds" : "violated"}: 2ab{" "}
                        {(2 * p.a * p.b).toFixed(4)} {p.feller_condition ? ">=" : "<"} s²{" "}
                        {(p.sigma ** 2).toFixed(4)}
                      </span>
                    ) : (
                      <span>{fmtPct(m.summary.pct_paths_below_zero, 1)} of paths below 0%</span>
                    )
                  }
                />
                <div className="t-data grid grid-cols-4 gap-2 px-4 py-3 text-[13px] text-ink">
                  <span><span className="t-note block">a</span>{p.a.toFixed(2)}</span>
                  <span><span className="t-note block">b</span>{fmtPct(p.b, 1)}</span>
                  <span><span className="t-note block">sigma</span>{m.id === "cir" ? p.sigma.toFixed(3) : fmtPct(p.sigma, 1)}</span>
                  <span><span className="t-note block">r0</span>{fmtPct(p.r0, 2)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {varRows.map((v) => (
          <div key={v.model} className="panel">
            <PanelHead
              title={`${v.model === "vasicek" ? "Vasicek" : "CIR"} loss distribution, 1Y`}
              right={isCustom ? "uses the published book weights" : preset.name}
            />
            <div className="t-data grid grid-cols-4 gap-2 border-b border-rule px-4 py-3 text-[13px]">
              <span><span className="t-note block">VaR 95</span>{fmtUsd(v.var_95)}</span>
              <span className="text-loss"><span className="t-note block">VaR 99</span>{fmtUsd(v.var_99)}</span>
              <span><span className="t-note block">ES 95</span>{fmtUsd(v.es_95)}</span>
              <span><span className="t-note block">ES 99</span>{fmtUsd(v.es_99)}</span>
            </div>
            <div className="chart-scroll">
              <div className="min-w-[460px] p-3">
                <LossDistribution
                  result={v}
                  color={MODEL_STYLE[v.model].color}
                  variant={v.model === "vasicek" ? "outline" : "fill"}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3">
        <Footnote>
          CIR ties volatility to the rate level, so at today&apos;s rates it
          implies a wider distribution than Vasicek; the disagreement is the
          finding. VaR and ES are model-conditioned rates-risk estimates, not forecasts or guaranteed bounds.
        </Footnote>
      </div>
    </ChainStep>
  );
}

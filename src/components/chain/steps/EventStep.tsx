"use client";

import { CurveInstrument } from "@/components/charts/CurveInstrument";
import { Claim, ControlCue, Footnote, PanelHead, Roll, Subject, TokenChip } from "@/components/chain/bits";
import { ChainStep } from "@/components/chain/ChainStep";
import { useTokens } from "@/components/chain/useTokens";
import { ShockGlyph } from "@/components/engine/ShockGlyph";
import { useDesk } from "@/components/DeskContext";
import { fmtBps } from "@/lib/formatters/numberFormatters";
import { useDerivedRisk } from "@/lib/hooks/useDerivedRisk";
import { useRiskStore } from "@/stores/riskStore";
import { TENORS } from "@/types/data";

export function EventStep() {
  const { snapshot, scenarios } = useDesk();
  const { scenario } = useDerivedRisk();
  const { selectedScenarioId, setScenario } = useRiskStore();
  const tokens = useTokens();

  const isBase = scenario.scenario_type === "base";
  const avg = TENORS.reduce((a, t) => a + scenario.shocks_bps[t], 0) / 4;
  const maxTenor = TENORS.reduce((m, t) =>
    Math.abs(scenario.shocks_bps[t]) > Math.abs(scenario.shocks_bps[m]) ? t : m,
  );

  return (
    <ChainStep id="event" kicker="Link 1 · The shock">
      <Subject
        items={[
          <TokenChip
            key="s"
            text={scenario.name}
            order={tokens.scenarioOrder(scenario.scenario_id)}
            ghosts={tokens.scenarioNames}
            glyph={<ShockGlyph shocks={scenario.shocks_bps} />}
          />,
        ]}
      />
      <Claim>
        Moves the curve{" "}
        <Roll
          text={isBase ? "0 bps" : fmtBps(Math.round(avg))}
          order={avg}
          ghosts={["+888 bps"]}
          tone={avg > 0 ? "loss" : avg < 0 ? "gain" : "ink"}
        />{" "}
        on average; the largest pillar move is{" "}
        <Roll
          text={isBase ? "0 bps" : fmtBps(scenario.shocks_bps[maxTenor])}
          order={scenario.shocks_bps[maxTenor]}
          ghosts={["+888 bps"]}
          tone={scenario.shocks_bps[maxTenor] >= 0 ? "loss" : "gain"}
        />{" "}
        at the{" "}
        <Roll
          text={isBase ? "curve." : `${maxTenor}.`}
          order={TENORS.indexOf(maxTenor)}
          ghosts={["curve.", "30Y."]}
          tone="ink"
        />
      </Claim>
      <div className="mt-1 max-w-[78ch] text-[13px] leading-snug text-ink-2">
        <Roll
          text={scenario.macro_interpretation}
          order={tokens.scenarioOrder(scenario.scenario_id)}
          ghosts={scenarios.map((s) => s.macro_interpretation)}
          block
        />
      </div>

      {/* selector + instrument, one composed unit */}
      <div className="mt-4">
        <ControlCue>Choose the shock. Everything below reprices.</ControlCue>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[252px_minmax(0,1fr)]">
          {/* compact scenario rail on desktop; snap cards on small screens */}
          <div
            role="radiogroup"
            aria-label="Curve shock scenario"
            className="thin-scroll -mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-2 lg:mx-0 lg:flex-col lg:gap-[3px] lg:overflow-visible lg:px-0 lg:pb-0"
          >
            {scenarios.map((s) => {
              const active = s.scenario_id === selectedScenarioId;
              const net = TENORS.reduce((a, t) => a + s.shocks_bps[t], 0) / 4;
              return (
                <button
                  key={s.scenario_id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setScenario(s.scenario_id)}
                  className="shock-card flex min-w-[150px] shrink-0 snap-start flex-col gap-1.5 lg:min-w-0 lg:flex-row lg:items-center lg:gap-2.5 lg:py-[5px]"
                >
                  <span className="flex w-full items-center justify-between gap-2 lg:w-auto lg:shrink-0">
                    <ShockGlyph shocks={s.shocks_bps} inverted={active} />
                  </span>
                  <span className="block min-h-[2.5em] font-[family-name:var(--font-label)] text-[12px] font-semibold leading-[1.25] lg:min-h-0 lg:flex-1">
                    {s.name}
                  </span>
                  <span
                    className={`t-data hidden text-[10px] lg:block ${
                      active ? "text-paper/70" : net > 0 ? "text-loss/80" : net < 0 ? "text-gain/80" : "text-ink-3"
                    }`}
                  >
                    {net === 0 ? "base" : `${net > 0 ? "+" : ""}${Math.round(net)}`}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="panel min-w-0 overflow-hidden">
            <PanelHead
              title="Treasury curve, base vs shocked"
              right={
                <Roll
                  text={scenario.name}
                  order={tokens.scenarioOrder(scenario.scenario_id)}
                  ghosts={tokens.scenarioNames}
                  align="right"
                />
              }
            />
            <div className="chart-scroll">
              <div className="min-w-[600px] p-2 sm:p-3">
                <CurveInstrument
                  shortRate={snapshot.short_rate_3m}
                  nominal={snapshot.nominal_curve}
                  shocks={scenario.shocks_bps}
                />
              </div>
            </div>
            <div className="chart-scroll border-t border-rule">
              <table className="w-full min-w-[520px] text-[12px]">
                <caption className="sr-only">
                  Shock by pillar and its real versus breakeven split
                </caption>
                <tbody className="t-data">
                  <tr>
                    <td className="t-label w-[110px] px-3 py-1">Shock</td>
                    {TENORS.map((t) => (
                      <td key={t} className="px-3 py-1 text-right">
                        <Roll
                          text={isBase ? "0" : fmtBps(scenario.shocks_bps[t])}
                          order={scenario.shocks_bps[t]}
                          ghosts={["+888 bps"]}
                          tone={scenario.shocks_bps[t] > 0 ? "loss" : scenario.shocks_bps[t] < 0 ? "gain" : "dim"}
                          align="right"
                        />
                      </td>
                    ))}
                  </tr>
                  <tr className="border-t border-rule">
                    <td className="t-label w-[110px] px-3 py-1">
                      <span className="text-real">real</span> /{" "}
                      <span className="text-breakeven">brkvn</span>
                    </td>
                    {TENORS.map((t) => (
                      <td key={t} className="px-3 py-1 text-right">
                        <Roll
                          text={`${(scenario.real_shocks_bps?.[t] ?? 0).toFixed(0)} / ${(scenario.breakeven_shocks_bps?.[t] ?? 0).toFixed(0)}`}
                          order={scenario.real_shocks_bps?.[t] ?? 0}
                          ghosts={["888 / 888"]}
                          align="right"
                          className="text-ink-2"
                        />
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-3">
        <Footnote>
          The real/breakeven split is estimated per tenor from three years of
          daily TIPS vs nominal co-movement; it drives TIPS repricing and the
          link 6 channels.
          {scenario.scenario_type === "historical" && scenario.is_measured_historical
            ? ` The replay uses measured changes, ${scenario.historical_window}.`
            : ""}
        </Footnote>
      </div>
    </ChainStep>
  );
}

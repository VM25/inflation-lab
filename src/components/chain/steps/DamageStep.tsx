"use client";

import { useMemo } from "react";
import { KeyRatePins } from "@/components/charts/KeyRatePins";
import { ScenarioLadder } from "@/components/charts/ScenarioLadder";
import { Claim, ControlCue, Footnote, LivePnl, PanelHead, Roll, TokenChip } from "@/components/chain/bits";
import { useTokens } from "@/components/chain/useTokens";
import { ChainStep } from "@/components/chain/ChainStep";
import { useDesk } from "@/components/DeskContext";
import { computePortfolio } from "@/lib/calculations/portfolio";
import { fmtSignedPct, fmtUsd } from "@/lib/formatters/numberFormatters";
import { useDerivedRisk } from "@/lib/hooks/useDerivedRisk";
import { useRiskStore } from "@/stores/riskStore";

export function DamageStep() {
  const { scenarios, bonds, instrumentScenarioResults } = useDesk();
  const { scenario, preset, weights, pre } = useDerivedRisk();
  const { setScenario } = useRiskStore();
  const tokens = useTokens();

  const ladder = useMemo(
    () =>
      scenarios
        .filter((s) => s.scenario_type !== "base")
        .map((s) => ({
          id: s.scenario_id,
          name: s.name,
          shocks: s.shocks_bps,
          pnl: computePortfolio(weights, bonds, instrumentScenarioResults, s.scenario_id).pnlExact,
        }))
        .sort((a, b) => a.pnl - b.pnl),
    [scenarios, weights, bonds, instrumentScenarioResults],
  );

  const isBase = scenario.scenario_type === "base";
  const rank = ladder.findIndex((r) => r.id === scenario.scenario_id);

  return (
    <ChainStep id="damage" kicker="Link 3 · The damage">
      <Claim>
        Exact repriced P&L:{" "}
        <LivePnl value={pre.pnlExact} reserve="-$888,888" />{" "}
        (
        <Roll
          text={fmtSignedPct(pre.lossPct)}
          order={pre.lossPct}
          ghosts={["-88.88%"]}
          tone={pre.lossPct < 0 ? "loss" : "gain"}
        />
        ) on the {fmtUsd(1_000_000)} book.
      </Claim>
      <p className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span className="t-label">Worst case for this book</span>
        <TokenChip
          text={ladder[0]?.name ?? "n/a"}
          order={tokens.scenarioOrder(ladder[0]?.id ?? "")}
          ghosts={tokens.scenarioNames}
          className="font-[family-name:var(--font-label)] text-[13px] font-semibold"
        />
        <Roll
          text={rank === 0 && !isBase ? "(the one loaded)" : ""}
          order={rank === 0 && !isBase ? 1 : 0}
          ghosts={["(the one loaded)"]}
          className="t-note"
        />
      </p>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="panel">
          <PanelHead title="The same book under all ten shocks" />
          <div className="mb-1 px-4 pt-3">
            <ControlCue>Selecting a rung loads that shock everywhere.</ControlCue>
          </div>
          <div className="chart-scroll pb-1.5">
            <div className="min-w-[460px]">
              <ScenarioLadder rows={ladder} selectedId={scenario.scenario_id} onSelect={setScenario} />
            </div>
          </div>
        </div>

        <div className="panel">
          <PanelHead title="Which pillar did it, key-rate P&L" right="first order" />
          {isBase ? (
            <p className="p-5 text-[13px] text-ink-2">Load a shock to decompose the damage.</p>
          ) : (
            <div className="chart-scroll">
              <div className="min-w-[460px] p-3 sm:p-4">
                <KeyRatePins
                  unit="$ P&L"
                  signed
                  series={[{ name: "Key-rate P&L", color: "var(--loss)", values: pre.keyRatePnl }]}
                />
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="mt-3">
        <Footnote>
          Parallel shocks spread damage by duration. Steepeners and
          term-premium shocks pile it onto the long pillars, which is why the
          same book ranks so differently across rungs.
        </Footnote>
      </div>
    </ChainStep>
  );
}

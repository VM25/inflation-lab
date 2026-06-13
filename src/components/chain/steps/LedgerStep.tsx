"use client";

import { AttributionWaterfall } from "@/components/charts/AttributionWaterfall";
import { Claim, Footnote, LivePnl, PanelHead, Roll } from "@/components/chain/bits";
import { ChainStep } from "@/components/chain/ChainStep";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { fmtSignedUsd } from "@/lib/formatters/numberFormatters";
import { useDerivedRisk } from "@/lib/hooks/useDerivedRisk";
import { useRiskStore } from "@/stores/riskStore";
import type { AttributionComponents } from "@/types/data";

const CHANNELS: { key: keyof AttributionComponents; label: string; color: string; note: string }[] = [
  { key: "duration", label: "Duration", color: "var(--ink-2)", note: "rate level times book duration" },
  { key: "real_rate", label: "Real rate", color: "var(--real)", note: "rate level booked to real yields" },
  { key: "breakeven", label: "Breakeven", color: "var(--breakeven)", note: "rate level booked to inflation compensation" },
  { key: "convexity", label: "Convexity", color: "var(--gain)", note: "second-order curvature, usually an offset" },
  { key: "curve_shape", label: "Curve shape", color: "var(--warn)", note: "non-parallel remainder via key rates" },
  { key: "residual", label: "Residual", color: "var(--residual)", note: "remainder beyond the first-order terms" },
];

export function LedgerStep() {
  const { scenario, overlay, pre, post, overlayImpact } = useDerivedRisk();
  const { hedgeView, setHedgeView } = useRiskStore();

  const isBase = scenario.scenario_type === "base";
  const active = hedgeView === "pre" ? pre : post;
  const top = CHANNELS.filter((c) => Math.abs(active.attribution[c.key]) > 0.5).sort(
    (a, b) => Math.abs(active.attribution[b.key]) - Math.abs(active.attribution[a.key]),
  )[0];

  return (
    <ChainStep id="ledger" kicker="Link 6 · The ledger">
      <Claim>
        The ledger sums to the exact repriced P&L of <LivePnl value={active.pnlExact} reserve="-$888,888" />;
        the largest line is{" "}
        <LivePnl value={top ? active.attribution[top.key] : 0} reserve="-$888,888" /> of{" "}
        <Roll
          text={top ? `${top.label.toLowerCase()}.` : "duration."}
          order={top ? CHANNELS.indexOf(top) : 0}
          ghosts={CHANNELS.map((c) => `${c.label.toLowerCase()}.`)}
          tone="ink"
        />
      </Claim>

      {!isBase && (
        <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <div className="panel">
            <PanelHead
              title={`Channel waterfall, ${scenario.name}`}
              right={
                <ToggleGroup
                  type="single"
                  value={hedgeView}
                  onValueChange={(v) => v && setHedgeView(v as "pre" | "post")}
                  aria-label="Ledger state"
                  className="rounded-md border border-rule"
                >
                  <ToggleGroupItem value="pre" className="t-label h-7 rounded-md px-2.5 data-[state=on]:bg-ink data-[state=on]:text-paper">
                    Without overlay
                  </ToggleGroupItem>
                  <ToggleGroupItem value="post" className="t-label h-7 rounded-md px-2.5 data-[state=on]:bg-ink data-[state=on]:text-paper">
                    With overlay
                  </ToggleGroupItem>
                </ToggleGroup>
              }
            />
            <div className="chart-scroll">
              <div className="min-w-[620px] p-3 sm:p-5">
                <AttributionWaterfall
                  attribution={active.attribution}
                  total={active.pnlExact}
                  stateKey={`${scenario.scenario_id}-${hedgeView}`}
                />
              </div>
            </div>
          </div>

          <div className="panel self-start">
            <PanelHead
              title="Itemized"
              right={hedgeView === "pre" ? "book as held" : overlay.name.toLowerCase()}
            />
            <div>
              {CHANNELS.map((row) => {
                const v = active.attribution[row.key];
                if (Math.abs(v) < 0.5) return null;
                return (
                  <div key={row.key} className="flex items-center justify-between gap-3 border-t border-rule px-4 py-2 first:border-t-0">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span aria-hidden className="h-[16px] w-[4px] shrink-0 rounded-sm" style={{ background: row.color }} />
                      <div className="min-w-0">
                        <p className="font-[family-name:var(--font-label)] text-[12.5px] font-semibold text-ink">{row.label}</p>
                        <p className="t-note truncate">{row.note}</p>
                      </div>
                    </div>
                    <LivePnl value={v} className="text-[13px]" />
                  </div>
                );
              })}
              <div className="flex items-baseline justify-between gap-3 border-t border-rule-strong bg-paper-2 px-4 py-2.5">
                <p className="font-[family-name:var(--font-label)] text-[12.5px] font-bold text-ink">Exact P&L</p>
                <LivePnl value={active.pnlExact} className="text-[15px]" />
              </div>
              <div className="flex items-baseline justify-between gap-3 px-4 py-2">
                <p className="t-note">overlay impact, with minus without</p>
                <span key={overlayImpact} className={`t-data tick text-[12.5px] ${overlayImpact > 0 ? "text-hedge" : "text-ink-3"}`}>
                  {fmtSignedUsd(overlayImpact)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="mt-3">
        <Footnote>
          In real-rate, breakeven and 2022-replay shocks the rate-level
          channel is re-booked into real and breakeven lines using each
          scenario&apos;s measured split; TIPS duration always books to the
          real-rate line. The hatched residual is the remainder beyond second-order parallel and first-order key-rate terms.
        </Footnote>
      </div>
    </ChainStep>
  );
}

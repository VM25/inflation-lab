"use client";

import { motion, useReducedMotion } from "framer-motion";
import { TraceStrip } from "@/components/charts/TraceStrip";
import { LivePnl, Roll, Subject, TokenChip } from "@/components/chain/bits";
import { useTokens } from "@/components/chain/useTokens";
import { ShockGlyph } from "@/components/engine/ShockGlyph";
import { useDesk } from "@/components/DeskContext";
import { fmtPct, fmtSignedUsd } from "@/lib/formatters/numberFormatters";
import { useDerivedRisk } from "@/lib/hooks/useDerivedRisk";

/**
 * The opening states the engine's result before asking for a click. The
 * subject line carries the active event; every number is live and rolls
 * in place without moving the layout.
 */
export function Hook() {
  const { snapshot, regimeHistory } = useDesk();
  const { scenario, preset, pre, post, overlayImpact, effectiveness } = useDerivedRisk();
  const tokens = useTokens();
  const reduced = useReducedMotion();

  const fade = (delay: number) =>
    reduced
      ? {}
      : {
          initial: { opacity: 0, y: 10 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.4, delay, ease: [0.23, 1, 0.32, 1] as const },
        };

  return (
    <header className="pb-12 pt-9 sm:pt-12">
      <div className="grid grid-cols-1 items-end gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_auto]">
        {/* the statement */}
        <div>
          <motion.p {...fade(0)} className="t-label">
            Rates Risk Engine · U.S. Treasury curve under inflation regimes
          </motion.p>
          <motion.h1
            {...fade(0.05)}
            className="t-display mt-3 max-w-[23ch] text-[31px] leading-[1.08] text-ink sm:text-[40px]"
          >
            What a curve shock costs a Treasury book.
          </motion.h1>

          <motion.div {...fade(0.12)} className="mt-6">
            <Subject
              items={[
                <TokenChip
                  key="s"
                  text={scenario.name}
                  order={tokens.scenarioOrder(scenario.scenario_id)}
                  ghosts={tokens.scenarioNames}
                  glyph={<ShockGlyph shocks={scenario.shocks_bps} />}
                />,
                <TokenChip
                  key="b"
                  text={preset.name}
                  order={tokens.bookOrder(preset.portfolio_id)}
                  ghosts={tokens.bookNames}
                />,
              ]}
            />
            <p className="max-w-[620px] text-[14px] leading-[1.85] text-ink-2 sm:text-[15px]">
              The engine reprices every cash flow under the shocked curve,
              attributes the scenario P&L across duration, convexity,
              curve-shape, real-rate and breakeven channels, and measures what
              a rule-based hedge overlay recovers, currently{" "}
              <Roll
                text={effectiveness == null ? "0%" : fmtPct(effectiveness, 0)}
                order={effectiveness ?? 0}
                ghosts={["88%"]}
                tone="hedge"
                className="t-data font-medium"
              />{" "}
              of the loss. Each link below is one step of that chain, and each
              is yours to change.
            </p>
          </motion.div>

          <motion.div {...fade(0.18)} className="mt-6 flex flex-wrap items-center gap-4">
            <a
              href="#event"
              className="rounded-md bg-ink px-4 py-2 font-[family-name:var(--font-label)] text-[13px] font-semibold text-paper transition-transform active:scale-[0.98]"
            >
              Follow the chain
            </a>
            <p className="t-note">public market data through {snapshot.as_of_date}</p>
          </motion.div>
        </div>

        {/* the result */}
        <motion.div {...fade(0.1)} className="panel min-w-0 px-5 py-4 sm:px-6 sm:py-5 lg:min-w-[330px]">
          <p className="t-note">scenario P&L per $1,000,000 book, exact repricing</p>
          <div className="mt-1">
            <LivePnl
              value={pre.pnlExact}
              reserve="-$888,888"
              className="!font-[family-name:var(--font-display)] text-[44px] font-semibold leading-none tracking-tight sm:text-[54px]"
            />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 border-t border-rule pt-3">
            <span>
              <span className="t-note block leading-none">hedge overlay recovers</span>
              <Roll
                text={fmtSignedUsd(overlayImpact)}
                order={overlayImpact}
                ghosts={["+$888,888"]}
                tone={overlayImpact > 0 ? "hedge" : "dim"}
                className="t-data mt-1 text-[15px] font-medium"
              />
            </span>
            <span>
              <span className="t-note block leading-none">residual on the book</span>
              <LivePnl value={post.pnlExact} reserve="-$888,888" className="mt-1 text-[15px]" />
            </span>
          </div>
        </motion.div>
      </div>

      {/* the regime */}
      <motion.div
        {...fade(0.22)}
        className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-rule pt-4"
      >
        <p className="text-[13px] text-ink-2">
          <span className="t-label mr-2">Regime</span>
          <span className="font-semibold text-breakeven">{snapshot.regime_label}</span>
        </p>
        <div className="flex items-center gap-5">
          {[
            {
              label: `CPI ${fmtPct(snapshot.inflation.cpi_yoy, 1)}`,
              color: "var(--warn)",
              values: regimeHistory.map((r) => r.cpi_yoy * 100),
            },
            {
              label: `10Y real ${fmtPct(snapshot.real_yields["10Y"])}`,
              color: "var(--real)",
              values: regimeHistory.map((r) => r.real_yield_10y * 100),
            },
          ].map((t) => (
            <span key={t.label} className="flex items-center gap-2">
              <span className="w-[68px]">
                <TraceStrip values={t.values} color={t.color} label={`${t.label}, 2016 to today`} />
              </span>
              <span className="t-note">{t.label}</span>
            </span>
          ))}
        </div>
      </motion.div>
    </header>
  );
}

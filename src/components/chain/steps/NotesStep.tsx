"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Claim } from "@/components/chain/bits";
import { ChainStep } from "@/components/chain/ChainStep";
import { useDesk } from "@/components/DeskContext";
import { fmtDate, fmtMonthYear } from "@/lib/formatters/numberFormatters";

const NOTES: { title: string; body: string }[] = [
  {
    title: "Data and reproducibility",
    body: "All inputs are public FRED series: Treasury constant-maturity yields, TIPS real yields, breakeven inflation, and CPI, processed offline by a reproducible Python pipeline. The browser never prices bonds; interactive panels recombine precomputed per-instrument results, verified to match the pipeline within one cent.",
  },
  {
    title: "Synthetic instruments",
    body: "The six instruments are representative proxies built from the latest curve snapshot: coupons near par rounded to eighths, semiannual schedules, issued on coupon dates so accrued interest is zero. They are not CUSIP-level securities.",
  },
  {
    title: "Pricing and analytics",
    body: "Cash flows discount on a linearly interpolated curve with semiannual compounding. Duration, convexity and DV01 use standard discrete formulas, cross-checked against finite-difference repricing to within 0.5%. Key-rate durations bump one pillar by 1bp and reprice.",
  },
  {
    title: "TIPS simplification",
    body: "The TIPS-style sleeve reprices off the real curve only; index-ratio cash flows are not modeled. Each scenario declares how much of its nominal shock is a real-yield move, and the sleeve responds to that portion alone.",
  },
  {
    title: "Scenarios and attribution",
    body: "Stylized shocks are analytical stress tests, not forecasts; the 2022 replay is the one measured historical episode. Each scenario's real vs breakeven split is estimated per tenor from three years of daily TIPS and nominal yield co-movement (2Y borrows the 5Y estimate), except where the split is definitional. Attribution channels are additive and reconcile to exact repriced P&L, with the residual reported rather than absorbed.",
  },
  {
    title: "Overlays, models and VaR",
    body: "Overlays are rule-based weight transfers with no optimizer, leverage or shorts. Vasicek and CIR calibrate to month-end 3M Treasury yields, a market short-rate proxy rather than the instantaneous rate, via AR(1)-style regression; the curve mapping is tenor-scaled and excludes carry and roll-down. VaR and expected shortfall are model-conditioned rates-risk estimates, not forecasts or guaranteed bounds.",
  },
];

export function NotesStep() {
  const { manifest, snapshot } = useDesk();

  return (
    <ChainStep id="notes" kicker="Fine print" last>
      <Claim>Data, assumptions, and limitations.</Claim>

      <div className="panel mt-5 max-w-[820px]">
        <Accordion type="single" collapsible className="px-4">
          {NOTES.map((n, i) => (
            <AccordionItem key={n.title} value={n.title}>
              <AccordionTrigger className="py-3 font-[family-name:var(--font-label)] text-[13px] font-semibold text-ink hover:no-underline">
                <span className="flex items-baseline gap-3">
                  <span className="t-note w-[18px]">{String(i + 1).padStart(2, "0")}</span>
                  {n.title}
                </span>
              </AccordionTrigger>
              <AccordionContent className="max-w-[72ch] pb-4 text-[13px] leading-relaxed text-ink-2">
                {n.body}
              </AccordionContent>
            </AccordionItem>
          ))}
          <AccordionItem value="manifest">
            <AccordionTrigger className="py-3 font-[family-name:var(--font-label)] text-[13px] font-semibold text-ink hover:no-underline">
              <span className="flex items-baseline gap-3">
                <span className="t-note w-[18px]">07</span>
                Data manifest
              </span>
            </AccordionTrigger>
            <AccordionContent className="pb-4">
              <p className="t-note mb-2">
                daily rates through {manifest.data_as_of.rates} · monthly CPI
                through {manifest.data_as_of.inflation.slice(0, 7)}
              </p>
              <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
                {manifest.files.map((f) => (
                  <p key={f.file} className="flex items-baseline gap-2.5 py-0.5">
                    <span className="t-data shrink-0 text-[10.5px] text-hedge">{f.file}</span>
                    <span className="t-note truncate">{f.description}</span>
                  </p>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      <footer className="mt-10 max-w-[820px] border-t border-rule pt-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="t-display text-[15px] text-ink">Rates Risk Engine</p>
          <div className="text-right">
            <p className="t-note">
              rates through {fmtDate(snapshot.as_of_date)} · CPI through{" "}
              {fmtMonthYear(snapshot.inflation.latest_cpi_date)}
            </p>
            <a
              href="https://github.com/VM25/inflation-lab"
              target="_blank"
              rel="noreferrer"
              className="t-note mt-0.5 inline-flex items-center gap-1.5 text-hedge underline-offset-2 hover:underline"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
              github.com/VM25/inflation-lab
            </a>
          </div>
        </div>
        <p className="t-note mt-2 max-w-[86ch] leading-relaxed">
          All outputs are model-conditioned analytical estimates computed
          offline from public market data under the stated assumptions. Not
          investment advice, not a trading system, and not a production risk
          platform.
        </p>
      </footer>
    </ChainStep>
  );
}

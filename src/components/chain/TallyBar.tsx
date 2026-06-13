"use client";

import { LivePnl, Roll } from "@/components/chain/bits";
import { useTokens } from "@/components/chain/useTokens";
import { fmtSignedUsd } from "@/lib/formatters/numberFormatters";
import { useDerivedRisk } from "@/lib/hooks/useDerivedRisk";

/**
 * The state register. Six cells: the three choices that define the event
 * and the three numbers the chain produces. Every cell is width-reserved
 * and rolls in place; the register never moves a pixel.
 */
export function TallyBar() {
  const { scenario, preset, overlay, isCustom, pre, post, overlayImpact } =
    useDerivedRisk();
  const tokens = useTokens();
  const isBase = scenario.scenario_type === "base";

  const stateCells = [
    {
      label: "shock",
      href: "#event",
      text: scenario.name,
      order: tokens.scenarioOrder(scenario.scenario_id),
      ghosts: tokens.scenarioNames,
    },
    {
      label: "book",
      href: "#book",
      text: preset.name + (isCustom ? "*" : ""),
      order: tokens.bookOrder(preset.portfolio_id),
      ghosts: tokens.bookNames.map((n) => n + "*"),
    },
    {
      label: "overlay",
      href: "#hedge",
      text: overlay.name.replace(" Overlay", ""),
      order: tokens.overlayOrder(overlay.overlay_id),
      ghosts: tokens.overlayNames,
    },
  ];

  return (
    <div className="sticky top-0 z-50 border-b border-rule bg-paper/95 backdrop-blur-sm">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-stretch">
          {/* event state */}
          <div className="thin-scroll -mx-1 flex min-w-0 flex-1 items-stretch overflow-x-auto px-1 sm:flex-none">
            {stateCells.map((c) => (
              <a
                key={c.label}
                href={c.href}
                className="group flex shrink-0 flex-col justify-center gap-px border-r border-rule py-1.5 pl-0 pr-4 transition-colors first:pl-0 [&:not(:first-child)]:pl-4 hover:bg-paper-2/60"
              >
                <span className="t-note leading-none">{c.label}</span>
                <Roll
                  text={c.text}
                  order={c.order}
                  ghosts={c.ghosts}
                  className="font-[family-name:var(--font-label)] text-[12.5px] font-semibold leading-snug text-ink"
                />
              </a>
            ))}
          </div>

          {/* chain output */}
          <div className="ml-auto flex items-stretch py-1.5">
            {isBase ? (
              <span className="t-note self-center">no shock loaded</span>
            ) : (
              <>
                {[
                  { label: "loss", node: <LivePnl value={pre.pnlExact} reserve="-$888,888" align="right" className="text-[13px] leading-snug" /> },
                  {
                    label: "hedge",
                    node: (
                      <Roll
                        text={fmtSignedUsd(overlayImpact)}
                        order={overlayImpact}
                        ghosts={["+$888,888"]}
                        tone={overlayImpact > 0 ? "hedge" : "dim"}
                        align="right"
                        className="t-data text-[13px] font-medium leading-snug"
                      />
                    ),
                  },
                  { label: "residual", node: <LivePnl value={post.pnlExact} reserve="-$888,888" align="right" className="text-[13px] leading-snug" /> },
                ].map((cell, i) => (
                  <span key={cell.label} className="flex items-center">
                    {i > 0 && (
                      <span aria-hidden className="px-1.5 text-[11px] text-ink-3 sm:px-2">
                        →
                      </span>
                    )}
                    <span className="flex flex-col items-end gap-px">
                      <span className="t-note hidden leading-none sm:block">{cell.label}</span>
                      {cell.node}
                    </span>
                  </span>
                ))}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

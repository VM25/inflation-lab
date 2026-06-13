/**
 * Light portfolio aggregation from precomputed per-instrument results.
 *
 * The browser never prices bonds or simulates rates. Every number here is a
 * weighted sum of values the Python pipeline already computed per $1 of
 * market value — exactly mirroring engine.portfolio_scenario, so custom
 * slider weights stay consistent with the preset results.
 */
import type {
  AttributionComponents,
  BondAnalytics,
  HedgeOverlayDefinition,
  InstrumentScenarioResult,
  ScenarioResult,
  Tenor,
} from "@/types/data";
import { TENORS } from "@/types/data";

export const PORTFOLIO_VALUE = 1_000_000;

export interface PortfolioComputed {
  durationModified: number;
  convexity: number;
  dv01: number;
  keyRateDv01: Record<Tenor, number>;
  pnlExact: number;
  pnlDurationOnly: number;
  pnlConvexityAdjusted: number;
  lossPct: number;
  keyRatePnl: Record<Tenor, number>;
  attribution: AttributionComponents;
}

const KRD_FIELDS: Record<Tenor, keyof BondAnalytics> = {
  "2Y": "krd_2y",
  "5Y": "krd_5y",
  "10Y": "krd_10y",
  "30Y": "krd_30y",
};

export function normalizeWeights(
  weights: Record<string, number>,
): Record<string, number> {
  const clipped = Object.fromEntries(
    Object.entries(weights).map(([k, v]) => [k, Math.max(v, 0)]),
  );
  const total = Object.values(clipped).reduce((a, b) => a + b, 0);
  if (total <= 0) return clipped;
  return Object.fromEntries(
    Object.entries(clipped).map(([k, v]) => [k, v / total]),
  );
}

export function applyOverlay(
  weights: Record<string, number>,
  overlay: HedgeOverlayDefinition,
): Record<string, number> {
  const adjusted = Object.fromEntries(
    Object.entries(weights).map(([k, v]) => [
      k,
      Math.max(v + (overlay.weight_adjustments[k] ?? 0), 0),
    ]),
  );
  return normalizeWeights(adjusted);
}

export function computePortfolio(
  weights: Record<string, number>,
  bonds: BondAnalytics[],
  instrumentRows: InstrumentScenarioResult[],
  scenarioId: string,
  value = PORTFOLIO_VALUE,
): PortfolioComputed {
  const rows = instrumentRows.filter((r) => r.scenario_id === scenarioId);
  const rowById = new Map(rows.map((r) => [r.instrument_id, r]));

  let durationModified = 0;
  let convexity = 0;
  const keyRateDv01 = { "2Y": 0, "5Y": 0, "10Y": 0, "30Y": 0 } as Record<Tenor, number>;
  let pnlExact = 0;
  let pnlDurationOnly = 0;
  let pnlConvexityAdjusted = 0;
  const keyRatePnl = { "2Y": 0, "5Y": 0, "10Y": 0, "30Y": 0 } as Record<Tenor, number>;
  const attribution: AttributionComponents = {
    duration: 0, convexity: 0, curve_shape: 0, real_rate: 0, breakeven: 0, residual: 0,
  };

  for (const bond of bonds) {
    const w = weights[bond.instrument_id] ?? 0;
    if (w === 0) continue;
    const v = w * value;
    durationModified += w * bond.duration_modified;
    convexity += w * bond.convexity;
    for (const t of TENORS) {
      keyRateDv01[t] += v * (bond[KRD_FIELDS[t]] as number) * 1e-4;
    }
    const row = rowById.get(bond.instrument_id);
    if (!row) continue;
    pnlExact += v * row.ret_exact;
    pnlDurationOnly += v * row.ret_duration_only;
    pnlConvexityAdjusted += v * row.ret_convexity_adjusted;
    for (const t of TENORS) keyRatePnl[t] += v * row.key_rate_ret[t];
    for (const k of Object.keys(attribution) as (keyof AttributionComponents)[]) {
      attribution[k] += v * row.attribution_ret[k];
    }
  }

  return {
    durationModified,
    convexity,
    dv01: durationModified * value * 1e-4,
    keyRateDv01,
    pnlExact,
    pnlDurationOnly,
    pnlConvexityAdjusted,
    lossPct: pnlExact / value,
    keyRatePnl,
    attribution,
  };
}

/** Convert a precomputed preset ScenarioResult into the same shape. */
export function fromScenarioResult(r: ScenarioResult): PortfolioComputed {
  return {
    durationModified: r.duration_modified,
    convexity: r.convexity,
    dv01: r.dv01,
    keyRateDv01: r.key_rate_dv01,
    pnlExact: r.pnl_exact,
    pnlDurationOnly: r.pnl_duration_only,
    pnlConvexityAdjusted: r.pnl_convexity_adjusted,
    lossPct: r.loss_pct,
    keyRatePnl: r.key_rate_pnl,
    attribution: r.attribution,
  };
}

export function hedgeEffectiveness(
  prePnl: number,
  postPnl: number,
): number | null {
  if (prePnl >= 0) return null;
  return (Math.abs(prePnl) - Math.abs(Math.min(postPnl, 0))) / Math.abs(prePnl);
}

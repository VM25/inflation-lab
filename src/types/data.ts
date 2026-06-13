/** Frontend data contracts matching the research pipeline outputs (02_DATA_SPEC §21). */

export type Tenor = "2Y" | "5Y" | "10Y" | "30Y";
export const TENORS: Tenor[] = ["2Y", "5Y", "10Y", "30Y"];

export interface MarketSnapshot {
  as_of_date: string;
  data_window: { start_date: string; end_date: string };
  nominal_curve: Record<Tenor, number>;
  short_rate_3m: number;
  real_yields: { "5Y": number; "10Y": number; "30Y": number };
  breakevens: { "5Y": number; "10Y": number };
  inflation: { cpi_yoy: number; core_cpi_yoy: number; latest_cpi_date: string };
  curve_slopes: { "2s10s_bps": number; "5s30s_bps": number };
  regime_label: string;
  source_notes: string[];
}

export interface ScenarioDefinition {
  scenario_id: string;
  name: string;
  scenario_type:
    | "base"
    | "parallel"
    | "steepener"
    | "flattener"
    | "front_end"
    | "term_premium"
    | "real_rate"
    | "breakeven"
    | "historical";
  description: string;
  shocks_bps: Record<Tenor, number>;
  real_shocks_bps: Record<Tenor, number>;
  breakeven_shocks_bps: Record<Tenor, number>;
  real_share_parallel: number;
  macro_interpretation: string;
  historical_window?: string;
  is_measured_historical?: boolean;
}

export interface BondAnalytics {
  instrument_id: string;
  name: string;
  sleeve: string;
  type: string;
  maturity_years: number;
  coupon_rate: number;
  face_value: number;
  coupon_frequency: number;
  curve_tenor: string;
  is_tips_style: boolean;
  base_yield: number;
  base_price: number;
  duration_macaulay: number;
  duration_modified: number;
  convexity: number;
  dv01_per_100_face: number;
  krd_2y: number;
  krd_5y: number;
  krd_10y: number;
  krd_30y: number;
}

export interface PortfolioPreset {
  portfolio_id: string;
  name: string;
  description: string;
  weights: Record<string, number>;
}

export interface AttributionComponents {
  duration: number;
  convexity: number;
  curve_shape: number;
  real_rate: number;
  breakeven: number;
  residual: number;
}

export interface ScenarioResult {
  portfolio_id: string;
  scenario_id: string;
  base_portfolio_value: number;
  duration_modified: number;
  convexity: number;
  dv01: number;
  key_rate_dv01: Record<Tenor, number>;
  pnl_duration_only: number;
  pnl_convexity_adjusted: number;
  pnl_exact: number;
  loss_pct: number;
  approximation_error_duration: number;
  approximation_error_convexity: number;
  key_rate_pnl: Record<Tenor, number>;
  attribution: AttributionComponents;
}

export interface InstrumentScenarioResult {
  scenario_id: string;
  instrument_id: string;
  ret_exact: number;
  ret_duration_only: number;
  ret_convexity_adjusted: number;
  key_rate_ret: Record<Tenor, number>;
  attribution_ret: AttributionComponents;
}

export interface HedgeOverlayDefinition {
  overlay_id: string;
  name: string;
  description: string;
  target_risk: string;
  weight_adjustments: Record<string, number>;
}

export interface HedgeState {
  portfolio_value: number;
  weights: Record<string, number>;
  duration_modified: number;
  convexity: number;
  dv01: number;
  key_rate_dv01: Record<Tenor, number>;
  pnl_exact: number;
  attribution: AttributionComponents;
}

export interface HedgeResult {
  portfolio_id: string;
  scenario_id: string;
  overlay_id: string;
  pre_hedge: HedgeState;
  post_hedge: HedgeState;
  hedge_effectiveness: number | null;
  hedge_overlay_impact: number;
  residual_loss: number;
  interpretation: string;
}

export interface StochasticModelParams {
  a: number;
  b: number;
  sigma: number;
  r0: number;
  feller_condition?: boolean;
  feller_value_2ab?: number;
  sigma_squared?: number;
}

export interface StochasticParameters {
  as_of_date: string;
  calibration_window: { start_date: string; end_date: string };
  short_rate_proxy: string;
  sampling: string;
  vasicek: StochasticModelParams;
  cir: StochasticModelParams;
  calibration_notes: string[];
}

export interface ModelPathSummary {
  time_grid: number[];
  mean_path: number[];
  p05_path: number[];
  p25_path: number[];
  p75_path: number[];
  p95_path: number[];
  terminal_distribution: {
    p01: number;
    p05: number;
    median: number;
    p95: number;
    p99: number;
  };
  pct_paths_below_zero: number;
  min_rate_observed: number;
}

export interface StochasticPathsSummary {
  simulation_settings: {
    horizon_years: number;
    num_paths: number;
    steps_per_year: number;
    curve_mapping: Record<string, number>;
    tips_real_share: number;
  };
  models: { vasicek: ModelPathSummary; cir: ModelPathSummary };
}

export interface VaRResult {
  portfolio_id: string;
  model: "vasicek" | "cir";
  horizon: string;
  portfolio_value: number;
  var_95: number;
  var_99: number;
  es_95: number;
  es_99: number;
  loss_distribution_summary: Record<string, number>;
  histogram: { bin_edges: number[]; counts: number[] };
}

export interface DataManifest {
  project: string;
  generated_at: string;
  data_as_of: { rates: string; inflation: string };
  files: { file: string; description: string }[];
  source_summary: string[];
  limitations: string[];
}

export interface YieldCurvePoint {
  date: string;
  y_2y: number;
  y_5y: number;
  y_10y: number;
  y_30y: number;
  slope_2s10s_bps: number;
  slope_5s30s_bps: number;
}

export interface MacroRegimePoint {
  date: string;
  cpi_yoy: number;
  core_cpi_yoy: number;
  real_yield_5y: number;
  real_yield_10y: number;
  breakeven_5y: number;
  breakeven_10y: number;
  nominal_2y: number;
  nominal_10y: number;
  slope_2s10s_bps: number;
  regime_label: string;
}

/** Everything the app needs, fetched once from public/data/. */
export interface DeskData {
  snapshot: MarketSnapshot;
  curveHistory: YieldCurvePoint[];
  regimeHistory: MacroRegimePoint[];
  bonds: BondAnalytics[];
  presets: PortfolioPreset[];
  scenarios: ScenarioDefinition[];
  scenarioResults: ScenarioResult[];
  instrumentScenarioResults: InstrumentScenarioResult[];
  overlays: HedgeOverlayDefinition[];
  hedgeResults: HedgeResult[];
  stochasticParams: StochasticParameters;
  pathsSummary: StochasticPathsSummary;
  varResults: VaRResult[];
  manifest: DataManifest;
}

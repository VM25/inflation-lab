import type {
  DeskData,
  MacroRegimePoint,
  YieldCurvePoint,
} from "@/types/data";

/** Minimal CSV parser for the pipeline's well-formed, unquoted CSV outputs. */
function parseCsv<T>(text: string): T[] {
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    const row: Record<string, string | number | boolean> = {};
    header.forEach((key, i) => {
      const v = cells[i];
      if (v === "True" || v === "False") row[key] = v === "True";
      else if (v !== "" && !Number.isNaN(Number(v))) row[key] = Number(v);
      else row[key] = v;
    });
    return row as T;
  });
}

// "no-cache" revalidates against the server (cheap ETag check) so a browser
// never keeps serving stale data after the research pipeline regenerates files.
async function fetchJson<T>(file: string): Promise<T> {
  const res = await fetch(`data/${file}`, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function fetchCsv<T>(file: string): Promise<T[]> {
  const res = await fetch(`data/${file}`, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  return parseCsv<T>(await res.text());
}

/** Loads every static data file once. Throws with the failing file's name. */
export async function loadDeskData(): Promise<DeskData> {
  const [
    snapshot,
    curveHistory,
    regimeHistory,
    bonds,
    presets,
    scenarios,
    scenarioResults,
    instrumentScenarioResults,
    overlays,
    hedgeResults,
    stochasticParams,
    pathsSummary,
    varResults,
    manifest,
  ] = await Promise.all([
    fetchJson<DeskData["snapshot"]>("market_snapshot.json"),
    fetchCsv<YieldCurvePoint>("yield_curve_history.csv"),
    fetchCsv<MacroRegimePoint>("macro_regime_history.csv"),
    fetchCsv<DeskData["bonds"][number]>("bond_analytics.csv"),
    fetchJson<DeskData["presets"]>("portfolio_presets.json"),
    fetchJson<DeskData["scenarios"]>("scenario_definitions.json"),
    fetchJson<DeskData["scenarioResults"]>("scenario_results.json"),
    fetchJson<DeskData["instrumentScenarioResults"]>(
      "instrument_scenario_results.json",
    ),
    fetchJson<DeskData["overlays"]>("hedge_overlay_definitions.json"),
    fetchJson<DeskData["hedgeResults"]>("hedge_results.json"),
    fetchJson<DeskData["stochasticParams"]>("stochastic_model_parameters.json"),
    fetchJson<DeskData["pathsSummary"]>("stochastic_paths_summary.json"),
    fetchJson<DeskData["varResults"]>("var_results.json"),
    fetchJson<DeskData["manifest"]>("data_manifest.json"),
  ]);

  return {
    snapshot,
    curveHistory,
    regimeHistory,
    bonds,
    presets,
    scenarios,
    scenarioResults,
    instrumentScenarioResults,
    overlays,
    hedgeResults,
    stochasticParams,
    pathsSummary,
    varResults,
    manifest,
  };
}

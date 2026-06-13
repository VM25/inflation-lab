"""11 — Export processed outputs to public/data/ and write the data manifest."""
import datetime
import json
import os
import shutil

import pandas as pd

from pipeline_paths import DATA_PROCESSED, PUBLIC_DATA

EXPORT_FILES = {
    "market_snapshot.json": "Latest macro/rates snapshot for the dashboard header and regime panel.",
    "yield_curve_history.csv": "Daily 2Y/5Y/10Y/30Y Treasury yields and curve slopes, 2015-present.",
    "macro_regime_history.csv": "Monthly inflation, real-yield, breakeven and regime-label panel.",
    "bond_analytics.csv": "Synthetic Treasury universe with price, duration, convexity, DV01 and key-rate durations.",
    "portfolio_presets.json": "Controlled starting portfolios for the exposure builder.",
    "scenario_definitions.json": "Deterministic curve-shock scenarios with real/breakeven decomposition.",
    "scenario_results.json": "Scenario P&L, approximation comparison and attribution for every preset.",
    "instrument_scenario_results.json": "Per-instrument scenario returns enabling controlled custom weights in the UI.",
    "hedge_overlay_definitions.json": "Rule-based hedge overlay presets.",
    "hedge_results.json": "Pre/post hedge metrics, effectiveness and residual loss for every combination.",
    "stochastic_model_parameters.json": "Calibrated Vasicek and CIR parameters with Feller condition.",
    "stochastic_paths_summary.json": "Summarized simulated short-rate paths and terminal distributions.",
    "var_results.json": "Rates-specific VaR and Expected Shortfall by portfolio and model.",
}


def main():
    snap = json.load(open(os.path.join(DATA_PROCESSED, "market_snapshot.json")))

    for name in EXPORT_FILES:
        src = os.path.join(DATA_PROCESSED, name)
        dst = os.path.join(PUBLIC_DATA, name)
        if name.endswith(".json"):
            json.load(open(src))  # validate before shipping
        else:
            pd.read_csv(src)
        shutil.copyfile(src, dst)

    manifest = {
        "project": "Inflation Regime Rates Risk Engine",
        "generated_at": datetime.datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
        "data_as_of": {
            "rates": snap["as_of_date"],
            "inflation": snap["inflation"]["latest_cpi_date"],
        },
        "files": [{"file": f, "description": d} for f, d in EXPORT_FILES.items()],
        "source_summary": [
            "Public Treasury constant-maturity yield data (FRED)",
            "Public real yield and breakeven inflation data (FRED)",
            "Public CPI / core CPI index data (FRED)",
            "Synthetic Treasury instruments built from the real curve snapshot",
        ],
        "limitations": [
            "The site uses static offline-generated data; nothing is computed live.",
            "Synthetic Treasury instruments are representative proxies, not CUSIP-level securities.",
            "Scenario shocks are analytical stress tests, not forecasts.",
            "TIPS-style exposure is a simplified real-yield proxy without index-ratio cash flows.",
            "Vasicek and CIR are stylized short-rate models, not full term-structure models.",
            "VaR is model-dependent and is not a guaranteed loss threshold.",
            "Hedge overlays reduce selected exposures; they do not eliminate risk.",
        ],
    }
    mpath = os.path.join(DATA_PROCESSED, "data_manifest.json")
    with open(mpath, "w") as f:
        json.dump(manifest, f, indent=2)
    shutil.copyfile(mpath, os.path.join(PUBLIC_DATA, "data_manifest.json"))

    sizes = {n: os.path.getsize(os.path.join(PUBLIC_DATA, n)) // 1024
             for n in list(EXPORT_FILES) + ["data_manifest.json"]}
    total = sum(sizes.values())
    print(f"exported {len(sizes)} files to public/data ({total} KB total)")
    for n, kb in sorted(sizes.items(), key=lambda kv: -kv[1]):
        print(f"  {kb:>5} KB  {n}")


if __name__ == "__main__":
    main()

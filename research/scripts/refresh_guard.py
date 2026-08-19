"""Refresh integrity gate for automated data refreshes.

This does NOT change or re-derive any methodology. It is the publication gate
that runs after `run_pipeline.py` (which already contains the quantitative
sanity checks) and `quant_audit.py` (which reconciles the financial maths).
Its only job is to prove that the *data refresh itself* is safe to publish,
by catching the real-world upstream problems a scheduled job will eventually
hit:

  - partial / truncated raw writes, dropped rows, duplicated dates
  - schema changes in the upstream CSV (renamed or missing columns)
  - an upstream outage returning a stale or shorter series than we already have
  - NaNs introduced at the sample boundary
  - a snapshot date on which the required daily series are not jointly quoted
  - future-dated (unpublished) observations
  - non-finite values leaking into the exported JSON
  - calibration blow-ups outside the documented clip ranges
  - public/data drifting out of sync with data/processed
  - manifest as-of fields disagreeing with the snapshot they describe

Exits non-zero on the first failed invariant, so a failed refresh can never
reach a commit or a deployment.

    python research/scripts/refresh_guard.py [--baseline-dir DIR]

--baseline-dir points at a copy of the previously committed data/ tree. When
given, the guard also enforces that no series went backwards.
"""
import argparse
import datetime
import json
import math
import os
import sys

import pandas as pd

from pipeline_paths import DATA_PROCESSED, DATA_RAW, PUBLIC_DATA, ROOT

# Raw file -> columns the pipeline reads out of it.
RAW_SCHEMA = {
    "treasury_yields_raw.csv": ["DGS2", "DGS5", "DGS10", "DGS30"],
    "real_yields_raw.csv": ["DFII5", "DFII10", "DFII30"],
    "breakevens_raw.csv": ["T5YIE", "T10YIE", "T5YIFR"],
    "short_rate_raw.csv": ["DGS3MO"],
    "inflation_raw.csv": ["CPIAUCSL", "CPILFESL"],
}

# Every series that must be quoted on the snapshot date for the curve,
# the real curve, the breakevens and the short rate to be internally consistent.
SNAPSHOT_REQUIRED = ["DGS2", "DGS5", "DGS10", "DGS30", "DGS3MO",
                     "DFII5", "DFII10", "DFII30", "T5YIE", "T10YIE"]

EXPORTED = [
    "market_snapshot.json", "yield_curve_history.csv", "macro_regime_history.csv",
    "bond_analytics.csv", "portfolio_presets.json", "scenario_definitions.json",
    "scenario_results.json", "instrument_scenario_results.json",
    "hedge_overlay_definitions.json", "hedge_results.json",
    "stochastic_model_parameters.json", "stochastic_paths_summary.json",
    "var_results.json", "data_manifest.json",
]

# Mirrors CLIPS in 09_calibrate_stochastic_rates.py; the guard only asserts
# that the exported parameters landed inside the documented ranges.
PARAM_RANGES = {"a": (0.05, 3.0), "b": (0.005, 0.08), "sigma": (0.001, 0.25)}

FAILURES = []


def require(name, condition, detail=""):
    ok = bool(condition)
    print(f"{'PASS' if ok else 'FAIL'}  {name}{('  ' + detail) if detail else ''}")
    if not ok:
        FAILURES.append(name)
    return ok


def _finite_leaves(obj, path="$"):
    """Yield (path, value) for every non-finite number anywhere in a JSON tree."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield from _finite_leaves(v, f"{path}.{k}")
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from _finite_leaves(v, f"{path}[{i}]")
    elif isinstance(obj, float) and not math.isfinite(obj):
        yield path, obj


def read_raw(directory, name):
    df = pd.read_csv(os.path.join(directory, name), parse_dates=["date"])
    return df.sort_values("date").set_index("date")


def check_raw(baseline_dir):
    print("\n--- raw source files ---")
    for name, cols in RAW_SCHEMA.items():
        path = os.path.join(DATA_RAW, name)
        if not require(f"{name} exists", os.path.exists(path)):
            continue
        df = read_raw(DATA_RAW, name)
        require(f"{name} schema", all(c in df.columns for c in cols),
                f"expected {cols}, got {list(df.columns)}")
        require(f"{name} has rows", len(df) > 0, f"{len(df)} rows")
        require(f"{name} dates unique", not df.index.has_duplicates)
        require(f"{name} dates sorted", df.index.is_monotonic_increasing)

        quoted = df.dropna(how="all", subset=[c for c in cols if c in df.columns])
        if len(quoted) == 0:
            require(f"{name} has quoted observations", False)
            continue
        last = quoted.index.max().date()
        require(f"{name} not future-dated", last <= datetime.date.today(),
                f"last observation {last}")

        if baseline_dir:
            bpath = os.path.join(baseline_dir, "raw", name)
            if os.path.exists(bpath):
                old = read_raw(os.path.join(baseline_dir, "raw"), name)
                old_cols = [c for c in cols if c in old.columns]
                old_quoted = old.dropna(how="all", subset=old_cols)
                old_last = old_quoted.index.max().date()
                require(f"{name} did not go backwards", last >= old_last,
                        f"{old_last} -> {last}")
                require(f"{name} did not lose rows", len(df) >= len(old),
                        f"{len(old)} -> {len(df)} rows")
                common = old.index.intersection(df.index)
                delta = (df.loc[common, old_cols] - old.loc[common, old_cols]).abs()
                revised = delta[(delta > 1e-9).any(axis=1)]
                new_rows = df.index.difference(old.index)
                print(f"      {name}: +{len(new_rows)} new observation(s), "
                      f"{len(revised)} revised historical row(s)")


def check_snapshot():
    print("\n--- snapshot / joint availability ---")
    snap = json.load(open(os.path.join(DATA_PROCESSED, "market_snapshot.json")))
    panel = pd.read_csv(os.path.join(DATA_PROCESSED, "_clean_daily_panel.csv"),
                        parse_dates=["date"]).set_index("date")

    as_of = pd.Timestamp(snap["as_of_date"])
    require("snapshot date is in the clean panel", as_of in panel.index, snap["as_of_date"])
    require("snapshot date not in the future",
            as_of.date() <= datetime.date.today(), snap["as_of_date"])

    if as_of in panel.index:
        row = panel.loc[as_of]
        missing = [c for c in SNAPSHOT_REQUIRED if c not in panel.columns or pd.isna(row[c])]
        require("all required daily series jointly quoted on the snapshot date",
                not missing, f"missing: {missing}" if missing else str(as_of.date()))
        later = panel.loc[panel.index > as_of, SNAPSHOT_REQUIRED].dropna()
        require("snapshot uses the latest jointly-available date", len(later) == 0,
                f"{len(later)} later fully-quoted date(s)")

    nums = [snap["short_rate_3m"], *snap["nominal_curve"].values(),
            *snap["real_yields"].values(), *snap["breakevens"].values(),
            snap["inflation"]["cpi_yoy"], snap["inflation"]["core_cpi_yoy"]]
    require("snapshot values finite", all(isinstance(v, (int, float)) and math.isfinite(v)
                                          for v in nums))
    require("snapshot rates in decimal form",
            all(0 < v < 0.20 for v in snap["nominal_curve"].values()))

    cpi_date = pd.Timestamp(snap["inflation"]["latest_cpi_date"])
    require("CPI observation month not in the future",
            cpi_date.date() <= datetime.date.today(),
            snap["inflation"]["latest_cpi_date"])
    require("CPI is not newer than the rates cutoff", cpi_date <= as_of,
            f"CPI {cpi_date.date()} vs rates {as_of.date()}")
    lag_days = (as_of - cpi_date).days
    require("CPI publication lag is plausible (<= 120 days)", lag_days <= 120,
            f"{lag_days} days")
    return snap


def check_calibration():
    print("\n--- stochastic calibration ---")
    p = json.load(open(os.path.join(DATA_PROCESSED, "stochastic_model_parameters.json")))
    for model in ("vasicek", "cir"):
        for key, (lo, hi) in PARAM_RANGES.items():
            v = p[model][key]
            require(f"{model} {key} finite and inside documented range",
                    math.isfinite(v) and lo - 1e-9 <= v <= hi + 1e-9, f"{key}={v}")
        require(f"{model} r0 finite and non-negative",
                math.isfinite(p[model]["r0"]) and p[model]["r0"] >= 0,
                f"r0={p[model]['r0']}")
    cir = p["cir"]
    require("CIR Feller flag matches raw parameters",
            cir["feller_condition"] == (2 * cir["a"] * cir["b"] >= cir["sigma"] ** 2),
            f"2ab={2 * cir['a'] * cir['b']:.6f} vs sigma^2={cir['sigma'] ** 2:.6f}")

    var = json.load(open(os.path.join(DATA_PROCESSED, "var_results.json")))
    require("VaR/ES rows present", len(var) > 0, f"{len(var)} rows")
    require("VaR/ES finite and ordered",
            all(math.isfinite(r["var_95"]) and math.isfinite(r["es_99"])
                and r["var_99"] >= r["var_95"] and r["es_99"] >= r["var_99"]
                for r in var))


def check_exports(snap):
    print("\n--- frontend export integrity ---")
    for name in EXPORTED:
        src = os.path.join(DATA_PROCESSED, name)
        dst = os.path.join(PUBLIC_DATA, name)
        if not require(f"{name} exported", os.path.exists(dst)):
            continue
        with open(src, "rb") as a, open(dst, "rb") as b:
            require(f"{name} public copy matches processed", a.read() == b.read())
        if name.endswith(".json"):
            with open(dst) as f:
                text = f.read()
            require(f"{name} has no NaN/Infinity literals",
                    "NaN" not in text and "Infinity" not in text)
            obj = json.loads(text)
            bad = list(_finite_leaves(obj))
            require(f"{name} all numbers finite", not bad, str(bad[:3]))
        else:
            df = pd.read_csv(dst)
            require(f"{name} parses with rows", len(df) > 0, f"{len(df)} rows")

    manifest = json.load(open(os.path.join(PUBLIC_DATA, "data_manifest.json")))
    require("manifest rates as-of matches snapshot",
            manifest["data_as_of"]["rates"] == snap["as_of_date"],
            f"{manifest['data_as_of']['rates']} vs {snap['as_of_date']}")
    require("manifest CPI as-of matches snapshot",
            manifest["data_as_of"]["inflation"] == snap["inflation"]["latest_cpi_date"],
            f"{manifest['data_as_of']['inflation']} vs {snap['inflation']['latest_cpi_date']}")
    listed = {f["file"] for f in manifest["files"]} | {"data_manifest.json"}
    require("manifest lists every exported file", listed == set(EXPORTED),
            f"missing {set(EXPORTED) - listed}, extra {listed - set(EXPORTED)}")


def check_fixed_history():
    print("\n--- fixed historical scenarios ---")
    scen = {s["scenario_id"]: s
            for s in json.load(open(os.path.join(DATA_PROCESSED, "scenario_definitions.json")))}
    replay = scen.get("replay_2022", {})
    require("2022 replay is still a measured historical episode",
            replay.get("is_measured_historical") is True)
    window = replay.get("historical_window", "")
    require("2022 replay window is still anchored to 2021/2022",
            window.startswith("2021-12-") and " to 2022-12-" in window, window)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--baseline-dir",
                    help="path to the previously committed data/ tree (for regression checks)")
    args = ap.parse_args()

    print(f"refresh guard — repository root {ROOT}")
    check_raw(args.baseline_dir)
    snap = check_snapshot()
    check_calibration()
    check_exports(snap)
    check_fixed_history()

    print(f"\n{'FAILED' if FAILURES else 'OK'}: "
          f"{len(FAILURES)} failed invariant(s)"
          + (f" -> {FAILURES}" if FAILURES else ""))
    sys.exit(1 if FAILURES else 0)


if __name__ == "__main__":
    main()

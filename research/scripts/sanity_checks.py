"""Sanity-check gate (01_QUANT_SPEC §27, 05_BUILD_PLAN §31).

Runs after the pipeline and prints a PASS/FAIL table. The README must not
be finalized until every check passes.
"""
import json
import os
import sys

import pandas as pd

from pipeline_paths import PUBLIC_DATA

RESULTS = []


def check(name, condition, detail=""):
    RESULTS.append((name, bool(condition), detail))


def load(name):
    path = os.path.join(PUBLIC_DATA, name)
    if name.endswith(".csv"):
        return pd.read_csv(path)
    with open(path) as f:
        return json.load(f)


def main():
    snap = load("market_snapshot.json")
    bonds = load("bond_analytics.csv").set_index("instrument_id")
    scen_defs = {s["scenario_id"]: s for s in load("scenario_definitions.json")}
    scen = pd.DataFrame(load("scenario_results.json"))
    hedges = load("hedge_results.json")
    var = pd.DataFrame(load("var_results.json"))
    paths = load("stochastic_paths_summary.json")
    params = load("stochastic_model_parameters.json")
    presets = {p["portfolio_id"]: p for p in load("portfolio_presets.json")}

    # --- data sanity --------------------------------------------------------
    curve = snap["nominal_curve"]
    check("curve has 2Y/5Y/10Y/30Y", all(t in curve for t in ["2Y", "5Y", "10Y", "30Y"]))
    check("rates are decimals", all(0 < v < 0.20 for v in curve.values()),
          f"10Y={curve['10Y']}")
    check("CPI YoY plausible", -0.02 < snap["inflation"]["cpi_yoy"] < 0.15)
    check("real + breakeven ~ nominal (10Y)",
          abs(snap["real_yields"]["10Y"] + snap["breakevens"]["10Y"] - curve["10Y"]) < 0.0025)

    # --- bond analytics -----------------------------------------------------
    check("prices positive", (bonds["base_price"] > 0).all())
    check("durations non-negative", (bonds["duration_modified"] >= 0).all())
    check("convexity non-negative", (bonds["convexity"] >= 0).all())
    dur = bonds["duration_modified"]
    check("duration order 2Y<5Y<10Y<30Y",
          dur["UST_2Y"] < dur["UST_5Y"] < dur["UST_10Y"] < dur["UST_30Y"],
          f"{dur[['UST_2Y','UST_5Y','UST_10Y','UST_30Y']].round(2).to_dict()}")
    cvx = bonds["convexity"]
    check("convexity order 2Y<5Y<10Y<30Y",
          cvx["UST_2Y"] < cvx["UST_5Y"] < cvx["UST_10Y"] < cvx["UST_30Y"])
    check("30Y KRD concentrated at 30Y",
          bonds.loc["UST_30Y", "krd_30y"] > bonds.loc["UST_30Y", ["krd_2y", "krd_5y", "krd_10y"]].max())

    # --- scenarios ----------------------------------------------------------
    s = scen.set_index(["portfolio_id", "scenario_id"])
    ldb, sdd = "long_duration_hedge_book", "short_duration_defensive"
    p50 = s.loc[(ldb, "parallel_50")]
    p100 = s.loc[(ldb, "parallel_100")]
    check("parallel +50 creates losses", p50["pnl_exact"] < 0, f"{p50['pnl_exact']:,.0f}")
    check("+100 worse than +50", p100["pnl_exact"] < p50["pnl_exact"])
    check("long book loses more than short book (+100)",
          p100["pnl_exact"] < s.loc[(sdd, "parallel_100"), "pnl_exact"])
    check("convexity-adjusted closer than duration-only (+100)",
          abs(p100["approximation_error_convexity"]) < abs(p100["approximation_error_duration"]),
          f"dur err {p100['approximation_error_duration']:,.0f} vs cvx err {p100['approximation_error_convexity']:,.0f}")
    bs = s.loc[(ldb, "bear_steepener")]
    check("bear steepener: 30Y key-rate P&L dominates",
          bs["key_rate_pnl"]["30Y"] < bs["key_rate_pnl"]["2Y"])
    fe = s.loc[(sdd, "front_end_repricing")]
    check("front-end repricing hits front-end book", fe["pnl_exact"] < 0)
    check("bull flattener is a gain", s.loc[(ldb, "bull_flattener"), "pnl_exact"] > 0)
    check("2022 replay is measured historical",
          scen_defs["replay_2022"].get("is_measured_historical", False),
          scen_defs["replay_2022"].get("historical_window", ""))
    att_err = []
    for _, row in scen.iterrows():
        total = sum(row["attribution"].values())
        att_err.append(abs(total - row["pnl_exact"]))
    check("attribution sums to exact P&L", max(att_err) < 1.0, f"max err ${max(att_err):.2f}")
    # breakeven scenario: TIPS book should outperform comparable nominal book
    check("breakeven shock: inflation-sensitive book beats intermediate book",
          s.loc[("inflation_sensitive_book", "breakeven_shock"), "pnl_exact"]
          > s.loc[("intermediate_treasury_book", "breakeven_shock"), "pnl_exact"])
    check("real-rate shock: TIPS book also loses",
          s.loc[("inflation_sensitive_book", "real_rate_shock"), "pnl_exact"] < 0)

    # --- hedge overlays -----------------------------------------------------
    hmap = {(h["portfolio_id"], h["scenario_id"], h["overlay_id"]): h for h in hedges}
    dr = hmap[(ldb, "parallel_100", "duration_reduction")]
    check("duration reduction lowers DV01",
          dr["post_hedge"]["dv01"] < dr["pre_hedge"]["dv01"],
          f"{dr['pre_hedge']['dv01']:.0f} -> {dr['post_hedge']['dv01']:.0f}")
    check("duration reduction lowers parallel loss",
          dr["post_hedge"]["pnl_exact"] > dr["pre_hedge"]["pnl_exact"])
    lep = hmap[(ldb, "bear_steepener", "long_end_protection")]
    check("long-end protection cuts 30Y KRD",
          lep["post_hedge"]["key_rate_dv01"]["30Y"] < lep["pre_hedge"]["key_rate_dv01"]["30Y"])
    check("long-end protection effective vs bear steepener",
          (lep["hedge_effectiveness"] or 0) > 0, f"eff={lep['hedge_effectiveness']}")
    inf = hmap[(ldb, "breakeven_shock", "inflation_sensitive")]
    check("inflation overlay raises TIPS weight",
          inf["post_hedge"]["weights"]["TIPS_10Y"] > inf["pre_hedge"]["weights"]["TIPS_10Y"])
    check("inflation overlay reduces breakeven-shock loss",
          (inf["hedge_effectiveness"] or 0) > 0)
    for h in hedges:
        wsum = sum(h["post_hedge"]["weights"].values())
        assert abs(wsum - 1.0) < 1e-4, f"post weights sum {wsum}"
        assert min(h["post_hedge"]["weights"].values()) >= 0
    check("all post-hedge weights sum to 1, no shorts", True)

    # --- stochastic / VaR ---------------------------------------------------
    check("CIR Feller condition computed", "feller_condition" in params["cir"],
          f"2ab={params['cir']['feller_value_2ab']} s2={params['cir']['sigma_squared']}")
    check("Vasicek negative-rate share reported",
          "pct_paths_below_zero" in paths["models"]["vasicek"],
          f"vasicek {paths['models']['vasicek']['pct_paths_below_zero']:.2%}")
    check("CIR avoids negative terminal rates",
          paths["models"]["cir"]["pct_paths_below_zero"]
          <= paths["models"]["vasicek"]["pct_paths_below_zero"])
    v = var.set_index(["portfolio_id", "model"])
    for model in ("vasicek", "cir"):
        check(f"{model}: long-duration VaR99 > short-duration VaR99",
              v.loc[(ldb, model), "var_99"] > v.loc[(sdd, model), "var_99"],
              f"{v.loc[(ldb, model), 'var_99']:,.0f} vs {v.loc[(sdd, model), 'var_99']:,.0f}")
        check(f"{model}: ES99 >= VaR99",
              (v.xs(model, level="model")["es_99"] >= v.xs(model, level="model")["var_99"]).all())

    # --- presets ------------------------------------------------------------
    for pid, p in presets.items():
        check(f"preset {pid} weights sum to 1", abs(sum(p["weights"].values()) - 1) < 1e-6)

    # --- report -------------------------------------------------------------
    failures = [r for r in RESULTS if not r[1]]
    width = max(len(r[0]) for r in RESULTS)
    print("\n=== SANITY CHECK REPORT ===")
    for name, ok, detail in RESULTS:
        print(f"{'PASS' if ok else 'FAIL'}  {name:<{width}}  {detail}")
    print(f"\n{len(RESULTS) - len(failures)}/{len(RESULTS)} checks passed")
    if failures:
        sys.exit(1)


if __name__ == "__main__":
    main()

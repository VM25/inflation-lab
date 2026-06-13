"""Quant audit: concrete reconciliation evidence for the finalization report.

Run after the pipeline. Prints, with numbers:
  A. data vintages              B. bond analytics re-derivation
  C. DV01 vs key-rate DV01      D. overlay verification
  E. approximation identity     F. attribution reconciliation
  G. 2022 replay recompute      H. Vasicek/CIR raw-value audit
  I. token ghost maxima (for frontend width reserves)
"""
import json
import os

import numpy as np
import pandas as pd

from engine import (
    KEY_TENORS, PORTFOLIO_VALUE, base_curves, build_instruments,
    instrument_scenario, load_json, load_snapshot,
)
from fi_math import finite_diff_checks
from pipeline_paths import DATA_PROCESSED, PUBLIC_DATA

V = PORTFOLIO_VALUE


def header(t):
    print(f"\n=== {t} " + "=" * max(0, 60 - len(t)))


def main():
    snap = load_snapshot()
    bonds = pd.read_csv(os.path.join(PUBLIC_DATA, "bond_analytics.csv")).set_index("instrument_id")
    presets = load_json("portfolio_presets.json")
    scen_defs = {s["scenario_id"]: s for s in load_json("scenario_definitions.json")}
    scen_results = load_json("scenario_results.json")
    overlays = load_json("hedge_overlay_definitions.json")
    hedge = load_json("hedge_results.json")
    params = load_json("stochastic_model_parameters.json")
    instr_results = load_json("instrument_scenario_results.json")

    curves = base_curves(snap)
    instruments = build_instruments()
    analytics = {i.id: i.analytics(curves) for i in instruments}

    # A ----------------------------------------------------------------
    header("A. data vintages")
    print(f"rates as of {snap['as_of_date']}  (window {snap['data_window']['start_date']} to {snap['data_window']['end_date']})")
    print(f"CPI as of {snap['inflation']['latest_cpi_date']} (monthly series)")
    print(f"curve 2Y={snap['nominal_curve']['2Y']:.4f} 5Y={snap['nominal_curve']['5Y']:.4f} "
          f"10Y={snap['nominal_curve']['10Y']:.4f} 30Y={snap['nominal_curve']['30Y']:.4f} 3M={snap['short_rate_3m']:.4f}")
    print(f"real 5Y={snap['real_yields']['5Y']:.4f} 10Y={snap['real_yields']['10Y']:.4f} 30Y={snap['real_yields']['30Y']:.4f}; "
          f"BEI 5Y={snap['breakevens']['5Y']:.4f} 10Y={snap['breakevens']['10Y']:.4f}")
    id10 = snap['real_yields']['10Y'] + snap['breakevens']['10Y'] - snap['nominal_curve']['10Y']
    print(f"identity check 10Y: real+BEI-nominal = {id10*10000:+.1f}bp")

    # B ----------------------------------------------------------------
    header("B. bond analytics re-derivation (analytic vs finite difference)")
    worst = {"dmod": 0.0, "cvx": 0.0}
    for i in instruments:
        a = analytics[i.id]
        dm_a, dm_fd, cv_a, cv_fd = finite_diff_checks(i.times, i.cfs, a["base_yield"])
        worst["dmod"] = max(worst["dmod"], abs(dm_a - dm_fd) / dm_fd)
        worst["cvx"] = max(worst["cvx"], abs(cv_a - cv_fd) / cv_fd)
        row = bonds.loc[i.id]
        assert abs(row.base_price - a["base_price"]) < 5e-3
        assert abs(row.duration_modified - a["duration_modified"]) < 5e-3
        dv01_chk = a["duration_modified"] * a["base_price"] * 1e-4
        print(f"  {i.id:<9} cpn={i.coupon:.4f} y={a['base_yield']:.4f} P={a['base_price']:8.3f} "
              f"D={a['duration_modified']:6.3f} C={a['convexity']:7.2f} "
              f"dv01/100={dv01_chk:.5f} (export {row.dv01_per_100_face:.5f})")
    print(f"  max rel diff vs finite-diff: duration {worst['dmod']:.2e}, convexity {worst['cvx']:.2e}")

    # C ----------------------------------------------------------------
    header("C. DV01 vs key-rate DV01 reconciliation (every book, pre + each overlay)")
    def book_state(weights):
        dmod = sum(weights.get(i.id, 0) * analytics[i.id]["duration_modified"] for i in instruments)
        total = dmod * V * 1e-4
        krd_sum = sum(weights.get(i.id, 0) * V * float(analytics[i.id]["krd"][j]) * 1e-4
                      for i in instruments for j in range(4))
        cash_dv01 = weights.get("CASH", 0) * V * analytics["CASH"]["duration_modified"] * 1e-4
        return total, krd_sum, cash_dv01

    def apply_overlay(w, adj):
        out = {k: max(w.get(k, 0) + adj.get(k, 0), 0.0) for k in w}
        tot = sum(out.values())
        return {k: v / tot for k, v in out.items()}

    max_unexplained = 0.0
    for p in presets:
        states = [("pre", p["weights"])] + [
            (o["overlay_id"], apply_overlay(p["weights"], o["weight_adjustments"])) for o in overlays
        ]
        for name, w in states:
            total, krd_sum, cash = book_state(w)
            unexplained = total - krd_sum - cash
            max_unexplained = max(max_unexplained, abs(unexplained))
            if name == "pre":
                print(f"  {p['portfolio_id']:<28} total={total:8.2f}  sum(KRD)={krd_sum:8.2f}  "
                      f"cash(3M, off-pillar)={cash:5.2f}  unexplained={unexplained:+8.4f}")
    print(f"  across all 25 book x overlay states: max |total - sum(KRD) - cash3M| = ${max_unexplained:.4f}/bp")
    # C2: the remaining gap is the yield-vs-curve convention, instrument by instrument
    from fi_math import price_from_curve
    print("  convention bridge per instrument (sum KRD vs curve-parallel vs ytm-duration, per 100 face):")
    for i in instruments:
        a = analytics[i.id]
        bumped = curves[i.curve_kind].parallel(1e-4)
        p_b = price_from_curve(i.times, i.cfs, bumped)
        curve_dv01 = -(p_b - a["base_price"])
        krd_sum_i = float(a["krd"].sum()) * a["base_price"] * 1e-4
        ytm_dv01 = a["duration_modified"] * a["base_price"] * 1e-4
        print(f"    {i.id:<9} sumKRD={krd_sum_i:.5f}  curve+1bp={curve_dv01:.5f}  ytmD={ytm_dv01:.5f}  "
              f"krd-vs-curve={krd_sum_i-curve_dv01:+.6f}  conv-gap={ytm_dv01-curve_dv01:+.6f}")

    # D ----------------------------------------------------------------
    header("D. overlay verification (direction of effect, all books)")
    hmap = {(h["portfolio_id"], h["scenario_id"], h["overlay_id"]): h for h in hedge}
    checks = {"duration_reduction": [], "long_end_protection": [], "inflation_sensitive": [], "key_rate_neutralizer": []}
    for p in presets:
        pid = p["portfolio_id"]
        dr = hmap[(pid, "parallel_100", "duration_reduction")]
        checks["duration_reduction"].append(dr["post_hedge"]["dv01"] <= dr["pre_hedge"]["dv01"] + 1e-6)
        le = hmap[(pid, "bear_steepener", "long_end_protection")]
        pre30 = le["pre_hedge"]["key_rate_dv01"]["10Y"] + le["pre_hedge"]["key_rate_dv01"]["30Y"]
        post30 = le["post_hedge"]["key_rate_dv01"]["10Y"] + le["post_hedge"]["key_rate_dv01"]["30Y"]
        checks["long_end_protection"].append(post30 <= pre30 + 1e-6)
        inf = hmap[(pid, "breakeven_shock", "inflation_sensitive")]
        checks["inflation_sensitive"].append(
            inf["post_hedge"]["weights"]["TIPS_10Y"] >= inf["pre_hedge"]["weights"]["TIPS_10Y"]
            and inf["post_hedge"]["pnl_exact"] >= inf["pre_hedge"]["pnl_exact"])
        kr = hmap[(pid, "bear_steepener", "key_rate_neutralizer")]
        pre_long = kr["pre_hedge"]["key_rate_dv01"]["10Y"] + kr["pre_hedge"]["key_rate_dv01"]["30Y"]
        post_long = kr["post_hedge"]["key_rate_dv01"]["10Y"] + kr["post_hedge"]["key_rate_dv01"]["30Y"]
        checks["key_rate_neutralizer"].append(post_long <= pre_long + 1e-6)
    for k, v in checks.items():
        print(f"  {k:<22} holds for {sum(v)}/{len(v)} books")
    effs = [h["hedge_effectiveness"] for h in hedge if h["hedge_effectiveness"] is not None]
    print(f"  effectiveness range across all combos: {min(effs):.1%} to {max(effs):.1%}")

    # E ----------------------------------------------------------------
    header("E. approximation identity (duration-only / convexity-adjusted vs definitions)")
    worst_e = 0.0
    for r in scen_results:
        sd = scen_defs[r["scenario_id"]]
        dy = sum(sd["shocks_bps"].values()) / 4 / 10000
        # duration-only must equal -D*V*dy for nominal-only books; TIPS books use the real-curve parallel internally
        approx = -r["duration_modified"] * V * dy
        has_tips = any(presets[i]["portfolio_id"] == r["portfolio_id"] and presets[i]["weights"].get("TIPS_10Y", 0) > 0
                       for i in range(len(presets)))
        if not has_tips and sd["scenario_type"] != "base":
            worst_e = max(worst_e, abs(approx - r["pnl_duration_only"]))
    print(f"  nominal-only books: max |(-D*V*dy_par) - exported duration-only P&L| = ${worst_e:.2f}")
    print("  TIPS books use the instrument-relevant (real-curve) parallel internally, by design")

    # F ----------------------------------------------------------------
    header("F. attribution reconciliation")
    err = max(abs(sum(r["attribution"].values()) - r["pnl_exact"]) for r in scen_results)
    err_h = max(abs(sum(h[k]["attribution"].values()) - h[k]["pnl_exact"])
                for h in hedge for k in ("pre_hedge", "post_hedge"))
    print(f"  scenario rows  (n={len(scen_results)}): max |sum(channels) - exact| = ${err:.2f}")
    print(f"  hedge rows pre/post (n={2*len(hedge)}): max |sum(channels) - exact| = ${err_h:.2f}")
    big_resid = max(scen_results, key=lambda r: abs(r["attribution"]["residual"]))
    print(f"  largest residual: {big_resid['portfolio_id']} x {big_resid['scenario_id']}: "
          f"${big_resid['attribution']['residual']:,.0f} on exact ${big_resid['pnl_exact']:,.0f} "
          f"({abs(big_resid['attribution']['residual']/big_resid['pnl_exact']):.1%}) "
          f"= cross-terms beyond first-order key-rate + second-order parallel")

    # G ----------------------------------------------------------------
    header("G. 2022 replay recompute")
    rep = scen_defs["replay_2022"]
    print(f"  window: {rep['historical_window']}  measured={rep['is_measured_historical']}")
    print(f"  nominal shocks: {rep['shocks_bps']}")
    print(f"  real shocks:    {rep['real_shocks_bps']}")
    print(f"  breakeven:      {rep['breakeven_shocks_bps']}  (real share {rep['real_share_parallel']:.0%})")
    daily = pd.read_csv(os.path.join(DATA_PROCESSED, "_clean_daily_panel.csv"),
                        parse_dates=["date"]).set_index("date")
    s0 = daily.loc[:"2021-12-31"].iloc[-1]; s1 = daily.loc[:"2022-12-31"].iloc[-1]
    for t in KEY_TENORS:
        chk = round((s1[f"DGS{t[:-1]}"] - s0[f"DGS{t[:-1]}"]) * 10000, 1)
        assert abs(chk - rep["shocks_bps"][t]) < 0.6, (t, chk, rep["shocks_bps"][t])
    print(f"  recomputed from raw between {s0.name.date()} and {s1.name.date()}: matches exports")

    # H ----------------------------------------------------------------
    header("H. Vasicek / CIR raw-value audit")
    vas, cir = params["vasicek"], params["cir"]
    print(f"  sampling: {params['sampling']}; proxy {params['short_rate_proxy']} (market short-rate proxy, not the instantaneous rate)")
    print(f"  window {params['calibration_window']['start_date']} to {params['calibration_window']['end_date']}")
    print(f"  Vasicek a={vas['a']} /yr, b={vas['b']:.4f}, sigma={vas['sigma']:.4f} (absolute vol, annualized), r0={vas['r0']:.4f}")
    feller = 2 * cir["a"] * cir["b"] - cir["sigma"] ** 2
    print(f"  CIR a={cir['a']}, b={cir['b']:.4f}, sigma={cir['sigma']:.4f}; raw 2ab={2*cir['a']*cir['b']:.6f} "
          f"vs sigma^2={cir['sigma']**2:.6f} -> margin {feller:+.6f} ({'HOLDS' if feller >= 0 else 'VIOLATED'})")
    assert (feller >= 0) == cir["feller_condition"], "exported Feller flag inconsistent with raw values"
    print(f"  exported flag matches raw computation: {cir['feller_condition']}")
    print(f"  notes: {params['calibration_notes']}")

    # I ----------------------------------------------------------------
    header("I. token ghost maxima (frontend width reserves)")
    rets = {}
    for r in instr_results:
        rets.setdefault(r["scenario_id"], {})[r["instrument_id"]] = r
    worst_loss = worst_gain = worst_err = worst_impact = 0.0
    bounds = {"CASH": 0.9, "UST_2Y": 0.9, "UST_5Y": 0.9, "UST_10Y": 0.9, "UST_30Y": 0.9, "TIPS_10Y": 0.9}
    for sid, rows in rets.items():
        for iid, cap in bounds.items():
            if iid not in rows:
                continue
            pnl = cap * V * rows[iid]["ret_exact"]  # extreme single-sleeve book
            worst_loss = min(worst_loss, pnl)
            worst_gain = max(worst_gain, pnl)
            err = abs(cap * V * (rows[iid]["ret_duration_only"] - rows[iid]["ret_exact"]))
            worst_err = max(worst_err, err)
    for h in hedge:
        worst_impact = max(worst_impact, abs(h["hedge_overlay_impact"]))
    print(f"  worst single-sleeve(90%) loss {worst_loss:,.0f} / gain {worst_gain:,.0f}")
    print(f"  worst duration-only error (90% sleeve): ${worst_err:,.0f}")
    print(f"  max |overlay impact| across preset combos: ${worst_impact:,.0f}")
    print("  -> reserves: losses '-$888,888'; gains '+$888,888'; errors/recoveries '$888,888'")

    print("\nquant audit complete")


if __name__ == "__main__":
    main()

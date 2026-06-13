"""07 — Run the deterministic scenario engine.

Outputs:
  scenario_results.json            — every preset x scenario (portfolio level)
  instrument_scenario_results.json — per-instrument returns/attribution per $1
                                     of market value (lets the frontend
                                     aggregate custom slider weights without
                                     doing any bond pricing in the browser)
"""
from engine import (
    KEY_TENORS, PORTFOLIO_VALUE, base_curves, build_instruments,
    instrument_scenario, load_json, load_snapshot, portfolio_metrics,
    portfolio_scenario, save_json,
)


def main():
    snapshot = load_snapshot()
    curves = base_curves(snapshot)
    instruments = build_instruments()
    analytics = [i.analytics(curves) for i in instruments]
    scenarios = load_json("scenario_definitions.json")
    presets = load_json("portfolio_presets.json")

    # per-instrument scenario table (also exported for the frontend)
    instr_rows = {}
    instr_export = []
    for scen in scenarios:
        rows = [instrument_scenario(i, a, curves, scen)
                for i, a in zip(instruments, analytics)]
        instr_rows[scen["scenario_id"]] = rows
        for i, a, r in zip(instruments, analytics, rows):
            instr_export.append({
                "scenario_id": scen["scenario_id"], "instrument_id": i.id,
                "ret_exact": round(r["ret_exact"], 8),
                "ret_duration_only": round(r["ret_duration_only"], 8),
                "ret_convexity_adjusted": round(r["ret_convexity_adjusted"], 8),
                "key_rate_ret": {t: round(v, 8) for t, v in r["key_rate_ret"].items()},
                "attribution_ret": {k: round(v, 8) for k, v in r["attribution_ret"].items()},
            })
    save_json(instr_export, "instrument_scenario_results.json")

    results = []
    for preset in presets:
        w = preset["weights"]
        pm = portfolio_metrics(w, instruments, analytics)
        for scen in scenarios:
            agg = portfolio_scenario(w, instruments, analytics, instr_rows[scen["scenario_id"]])
            results.append({
                "portfolio_id": preset["portfolio_id"],
                "scenario_id": scen["scenario_id"],
                "base_portfolio_value": PORTFOLIO_VALUE,
                "duration_modified": round(pm["duration_modified"], 4),
                "convexity": round(pm["convexity"], 4),
                "dv01": round(pm["dv01"], 2),
                "key_rate_dv01": {t: round(v, 2) for t, v in pm["key_rate_dv01"].items()},
                "pnl_duration_only": round(agg["pnl_duration_only"], 2),
                "pnl_convexity_adjusted": round(agg["pnl_convexity_adjusted"], 2),
                "pnl_exact": round(agg["pnl_exact"], 2),
                "loss_pct": round(agg["pnl_exact"] / PORTFOLIO_VALUE, 6),
                "approximation_error_duration": round(
                    agg["pnl_duration_only"] - agg["pnl_exact"], 2),
                "approximation_error_convexity": round(
                    agg["pnl_convexity_adjusted"] - agg["pnl_exact"], 2),
                "key_rate_pnl": {t: round(v, 2) for t, v in agg["key_rate_pnl"].items()},
                "attribution": {k: round(v, 2) for k, v in agg["attribution"].items()},
            })
    save_json(results, "scenario_results.json")

    # quick console audit
    for r in results:
        if r["portfolio_id"] == "long_duration_hedge_book" and r["scenario_id"] in (
                "parallel_50", "parallel_100", "bear_steepener", "replay_2022"):
            att_sum = sum(r["attribution"].values())
            print(f"{r['scenario_id']:>16}: exact={r['pnl_exact']:>11,.0f} "
                  f"dur-only={r['pnl_duration_only']:>11,.0f} "
                  f"cvx-adj={r['pnl_convexity_adjusted']:>11,.0f} "
                  f"attrib-sum={att_sum:>11,.0f}")


if __name__ == "__main__":
    main()

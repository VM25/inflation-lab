"""08 — Hedge overlay engine: definitions plus before/after results.

Overlays are rule-based weight adjustments (no optimizer, no leverage, no
shorts). Post-overlay weights are floored at zero and renormalized to 1.
Results cover every preset x scenario x overlay so the frontend can compare
any combination, including pre/post attribution.
"""
import numpy as np

from engine import (
    KEY_TENORS, PORTFOLIO_VALUE, base_curves, build_instruments,
    instrument_scenario, load_json, load_snapshot, portfolio_metrics,
    portfolio_scenario, save_json,
)

OVERLAYS = [
    {
        "overlay_id": "duration_reduction", "name": "Duration Reduction Overlay",
        "description": "Cuts long-duration exposure and rebuilds the front end; targets total DV01.",
        "target_risk": "parallel_rate_increase",
        "weight_adjustments": {"CASH": 0.10, "UST_2Y": 0.15, "UST_5Y": 0.05,
                               "UST_10Y": -0.10, "UST_30Y": -0.20, "TIPS_10Y": 0.00},
    },
    {
        "overlay_id": "long_end_protection", "name": "Long-End Protection Overlay",
        "description": "Moves exposure out of 10Y/30Y into 2Y/5Y; targets long-end key-rate DV01.",
        "target_risk": "bear_steepener_term_premium",
        "weight_adjustments": {"CASH": 0.00, "UST_2Y": 0.10, "UST_5Y": 0.15,
                               "UST_10Y": -0.05, "UST_30Y": -0.20, "TIPS_10Y": 0.00},
    },
    {
        "overlay_id": "inflation_sensitive", "name": "Inflation-Sensitive Overlay",
        "description": "Rotates nominal long-duration exposure into TIPS-style exposure; targets breakeven risk.",
        "target_risk": "breakeven_inflation_shock",
        "weight_adjustments": {"CASH": 0.00, "UST_2Y": 0.00, "UST_5Y": 0.00,
                               "UST_10Y": -0.10, "UST_30Y": -0.15, "TIPS_10Y": 0.25},
    },
    {
        "overlay_id": "key_rate_neutralizer", "name": "Key-Rate Neutralizer Overlay",
        "description": "Shifts key-rate DV01 out of 10Y/30Y into 2Y/5Y with a milder total-DV01 cut than long-end protection.",
        "target_risk": "concentrated_key_rate_exposure",
        "weight_adjustments": {"CASH": 0.00, "UST_2Y": 0.15, "UST_5Y": 0.10,
                               "UST_10Y": -0.10, "UST_30Y": -0.15, "TIPS_10Y": 0.00},
    },
]


def apply_overlay(weights, adjustments):
    ids = list(weights.keys())
    w = np.array([max(weights[i] + adjustments.get(i, 0.0), 0.0) for i in ids])
    w = w / w.sum()
    return {i: round(float(v), 6) for i, v in zip(ids, w)}


def interpretation(overlay, scen, eff, pre_pnl, post_pnl):
    if pre_pnl >= 0:
        return (f"{scen['name']} is not a loss scenario for this book; the overlay mainly "
                f"changes which exposures drive the result.")
    if eff is None:
        return "Hedge effectiveness is not defined for this combination."
    direction = "reduces" if eff > 0 else "increases"
    return (f"The {overlay['name'].lower()} {direction} the {scen['name'].lower()} loss by "
            f"{abs(eff):.1%}, leaving a residual P&L of {post_pnl:,.0f}. "
            f"It reshapes exposure; it does not eliminate risk.")


def main():
    snapshot = load_snapshot()
    curves = base_curves(snapshot)
    instruments = build_instruments()
    analytics = [i.analytics(curves) for i in instruments]
    scenarios = load_json("scenario_definitions.json")
    presets = load_json("portfolio_presets.json")

    save_json(OVERLAYS, "hedge_overlay_definitions.json")

    instr_rows = {
        s["scenario_id"]: [instrument_scenario(i, a, curves, s)
                           for i, a in zip(instruments, analytics)]
        for s in scenarios
    }

    def state(weights, scen_id):
        pm = portfolio_metrics(weights, instruments, analytics)
        agg = portfolio_scenario(weights, instruments, analytics, instr_rows[scen_id])
        return {
            "portfolio_value": PORTFOLIO_VALUE,
            "weights": {k: round(v, 6) for k, v in weights.items()},
            "duration_modified": round(pm["duration_modified"], 4),
            "convexity": round(pm["convexity"], 4),
            "dv01": round(pm["dv01"], 2),
            "key_rate_dv01": {t: round(v, 2) for t, v in pm["key_rate_dv01"].items()},
            "pnl_exact": round(agg["pnl_exact"], 2),
            "attribution": {k: round(v, 2) for k, v in agg["attribution"].items()},
        }

    results = []
    for preset in presets:
        for scen in scenarios:
            pre = state(preset["weights"], scen["scenario_id"])
            for ov in OVERLAYS:
                post_w = apply_overlay(preset["weights"], ov["weight_adjustments"])
                post = state(post_w, scen["scenario_id"])
                pre_pnl, post_pnl = pre["pnl_exact"], post["pnl_exact"]
                eff = None
                if pre_pnl < 0:
                    eff = round((abs(pre_pnl) - abs(min(post_pnl, 0.0))) / abs(pre_pnl), 4)
                results.append({
                    "portfolio_id": preset["portfolio_id"],
                    "scenario_id": scen["scenario_id"],
                    "overlay_id": ov["overlay_id"],
                    "pre_hedge": pre, "post_hedge": post,
                    "hedge_effectiveness": eff,
                    "hedge_overlay_impact": round(post_pnl - pre_pnl, 2),
                    "residual_loss": round(post_pnl, 2),
                    "interpretation": interpretation(ov, scen, eff, pre_pnl, post_pnl),
                })
    save_json(results, "hedge_results.json")

    # console audit: the canonical example from the spec
    for r in results:
        if (r["portfolio_id"] == "long_duration_hedge_book"
                and r["scenario_id"] == "bear_steepener"
                and r["overlay_id"] == "long_end_protection"):
            print(f"bear steepener + long-end protection: pre={r['pre_hedge']['pnl_exact']:,.0f} "
                  f"post={r['post_hedge']['pnl_exact']:,.0f} eff={r['hedge_effectiveness']:.1%}")
            print(f"  pre  KRD DV01: {r['pre_hedge']['key_rate_dv01']}")
            print(f"  post KRD DV01: {r['post_hedge']['key_rate_dv01']}")


if __name__ == "__main__":
    main()

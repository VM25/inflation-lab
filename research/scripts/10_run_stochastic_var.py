"""10 — Stochastic short-rate simulation and rates-specific VaR/ES.

10,000 Euler paths per model, 1-year horizon, 252 steps/year, fixed seed.
Terminal short-rate changes map to curve shifts with tenor-scaled betas
(2Y 1.00, 5Y 0.80, 10Y 0.55, 30Y 0.35 — front-end shocks decay along the
curve). The portfolio is repriced instantaneously under each terminal
curve; coupon carry and roll-down over the horizon are intentionally
excluded (documented limitation). TIPS real yields move with a 0.6 share
of the scaled nominal shift, matching the deterministic engine's default.

Losses are positive numbers: Loss = V_base - V_terminal.
"""
import numpy as np

from engine import (
    KEY_TENORS, PORTFOLIO_VALUE, base_curves, build_instruments, load_json,
    load_snapshot, save_json,
)

SEED = 42
NUM_PATHS = 10_000
STEPS = 252
HORIZON = 1.0
TENOR_BETAS = ([0.25, 2.0, 5.0, 10.0, 30.0], [1.0, 1.0, 0.80, 0.55, 0.35])
TIPS_REAL_SHARE = 0.6
MONTH_GRID = np.linspace(0.0, HORIZON, 13)


def simulate(model, p, rng):
    dt = HORIZON / STEPS
    r = np.full(NUM_PATHS, p["r0"])
    out = np.empty((NUM_PATHS, STEPS + 1))
    out[:, 0] = r
    for k in range(STEPS):
        z = rng.standard_normal(NUM_PATHS)
        if model == "vasicek":
            r = r + p["a"] * (p["b"] - r) * dt + p["sigma"] * np.sqrt(dt) * z
        else:  # CIR, full-truncation Euler
            rp = np.maximum(r, 0.0)
            r = r + p["a"] * (p["b"] - rp) * dt + p["sigma"] * np.sqrt(rp) * np.sqrt(dt) * z
        out[:, k + 1] = r
    return out


def path_summary(paths):
    idx = np.round(MONTH_GRID / (HORIZON / STEPS)).astype(int)
    sub = paths[:, idx]
    q = lambda p: np.percentile(sub, p, axis=0).round(5).tolist()  # noqa: E731
    term = paths[:, -1]
    return {
        "time_grid": MONTH_GRID.round(4).tolist(),
        "mean_path": sub.mean(axis=0).round(5).tolist(),
        "p05_path": q(5), "p25_path": q(25), "p75_path": q(75), "p95_path": q(95),
        "terminal_distribution": {
            "p01": round(float(np.percentile(term, 1)), 5),
            "p05": round(float(np.percentile(term, 5)), 5),
            "median": round(float(np.percentile(term, 50)), 5),
            "p95": round(float(np.percentile(term, 95)), 5),
            "p99": round(float(np.percentile(term, 99)), 5),
        },
        "pct_paths_below_zero": round(float((term < 0).mean()), 4),
        "min_rate_observed": round(float(paths.min()), 5),
    }


def reprice_portfolio(weights, instruments, analytics, curves, delta_r):
    """Vectorized terminal value per path for one portfolio."""
    v_term = np.zeros_like(delta_r)
    beta_t, beta_v = TENOR_BETAS
    for instr, ana in zip(instruments, analytics):
        share = TIPS_REAL_SHARE if instr.is_tips else 1.0
        base = curves[instr.curve_kind]
        y_base = base.yield_at(instr.times)                      # (n_cf,)
        scale = np.interp(instr.times, beta_t, beta_v) * share   # (n_cf,)
        y = y_base[None, :] + scale[None, :] * delta_r[:, None]  # (paths, n_cf)
        dfs = (1.0 + y / 2.0) ** (-2.0 * instr.times[None, :])
        p = (instr.cfs[None, :] * dfs).sum(axis=1)
        v_term += weights.get(instr.id, 0.0) * PORTFOLIO_VALUE * (p / ana["base_price"])
    return v_term


def main():
    rng = np.random.default_rng(SEED)
    params = load_json("stochastic_model_parameters.json")
    snapshot = load_snapshot()
    curves = base_curves(snapshot)
    instruments = build_instruments()
    analytics = [i.analytics(curves) for i in instruments]
    presets = load_json("portfolio_presets.json")

    summary = {
        "simulation_settings": {
            "horizon_years": HORIZON, "num_paths": NUM_PATHS, "steps_per_year": STEPS,
            "curve_mapping": {t: b for t, b in zip(["3M"] + KEY_TENORS, TENOR_BETAS[1])},
            "tips_real_share": TIPS_REAL_SHARE,
        },
        "models": {},
    }
    var_results = []

    for model in ("vasicek", "cir"):
        paths = simulate(model, params[model], rng)
        summary["models"][model] = path_summary(paths)
        delta_r = paths[:, -1] - params[model]["r0"]

        for preset in presets:
            v_term = reprice_portfolio(preset["weights"], instruments, analytics, curves, delta_r)
            loss = PORTFOLIO_VALUE - v_term
            var95 = float(np.percentile(loss, 95))
            var99 = float(np.percentile(loss, 99))
            es95 = float(loss[loss >= var95].mean())
            es99 = float(loss[loss >= var99].mean())
            counts, edges = np.histogram(loss, bins=40)
            var_results.append({
                "portfolio_id": preset["portfolio_id"], "model": model, "horizon": "1Y",
                "portfolio_value": PORTFOLIO_VALUE,
                "var_95": round(var95, 0), "var_99": round(var99, 0),
                "es_95": round(es95, 0), "es_99": round(es99, 0),
                "loss_distribution_summary": {
                    f"p{p}": round(float(np.percentile(loss, p)), 0)
                    for p in (50, 75, 90, 95, 99)
                },
                "histogram": {
                    "bin_edges": [round(float(e), 0) for e in edges],
                    "counts": [int(c) for c in counts],
                },
            })

    save_json(summary, "stochastic_paths_summary.json")
    save_json(var_results, "var_results.json")

    for r in var_results:
        if r["portfolio_id"] in ("short_duration_defensive", "long_duration_hedge_book"):
            print(f"{r['model']:>8} {r['portfolio_id']:<28} "
                  f"VaR95=${r['var_95']:>10,.0f}  VaR99=${r['var_99']:>10,.0f}  "
                  f"ES99=${r['es_99']:>10,.0f}")
    vneg = summary["models"]["vasicek"]["pct_paths_below_zero"]
    cneg = summary["models"]["cir"]["pct_paths_below_zero"]
    print(f"negative terminal rates: vasicek {vneg:.2%}, cir {cneg:.2%}")


if __name__ == "__main__":
    main()

"""09 — Calibrate Vasicek and CIR short-rate models.

Proxy: 3-Month Treasury constant-maturity yield (DGS3MO), monthly sampling
(month-end) over the full 2015-present window. Monthly sampling reduces
daily microstructure noise in the AR(1) regression; dt = 1/12.

Vasicek:  dr = a(b - r)dt + sigma dW          (AR(1) calibration)
CIR:      dr = a(b - r)dt + sigma sqrt(r) dW  (OLS on transformed equation)

Near-zero rates (2015, 2020-21) are floored at 1bp for the CIR transform.
Parameters are sanity-clipped to documented ranges; clips are recorded.
"""
import os

import numpy as np
import pandas as pd

from engine import save_json
from pipeline_paths import DATA_PROCESSED

DT = 1.0 / 12.0
CLIPS = {"a": (0.05, 3.0), "b": (0.005, 0.08), "sigma": (0.001, 0.25)}


def clip(name, value, applied):
    lo, hi = CLIPS[name]
    if value < lo or value > hi:
        applied.append(f"{name}: {value:.4f} -> [{lo}, {hi}]")
    return float(np.clip(value, lo, hi))


def calibrate_vasicek(r):
    x, y = r[:-1], r[1:]
    beta, alpha = np.polyfit(x, y, 1)
    resid = y - (alpha + beta * x)
    applied = []
    if beta <= 0 or beta >= 1:
        applied.append(f"AR(1) beta={beta:.4f} outside (0,1); fallback a=0.25")
        a = 0.25
    else:
        a = clip("a", -np.log(beta) / DT, applied)
    b = clip("b", alpha / (1.0 - beta) if abs(1 - beta) > 1e-9 else float(r.mean()), applied)
    sigma = clip("sigma", float(resid.std(ddof=2)) / np.sqrt(DT), applied)
    return {"a": round(a, 4), "b": round(b, 4), "sigma": round(sigma, 4)}, applied


def calibrate_cir(r):
    rf = np.maximum(r, 1e-4)
    x0, x1 = rf[:-1], rf[1:]
    dr = x1 - x0
    sq = np.sqrt(x0)
    yv = dr / sq
    X = np.column_stack([DT / sq, -DT * sq])
    coef, *_ = np.linalg.lstsq(X, yv, rcond=None)
    ab, a = float(coef[0]), float(coef[1])
    applied = []
    a = clip("a", a, applied)
    b = clip("b", ab / a if a > 1e-9 else float(r.mean()), applied)
    resid = yv - X @ np.array([a * b, a])
    sigma = clip("sigma", float(resid.std(ddof=2)) / np.sqrt(DT), applied)
    feller_2ab = 2 * a * b
    return {
        "a": round(a, 4), "b": round(b, 4), "sigma": round(sigma, 4),
        "feller_condition": bool(feller_2ab >= sigma ** 2),
        "feller_value_2ab": round(feller_2ab, 6),
        "sigma_squared": round(sigma ** 2, 6),
    }, applied


def main():
    daily = pd.read_csv(os.path.join(DATA_PROCESSED, "_clean_daily_panel.csv"),
                        parse_dates=["date"]).set_index("date")
    short = daily["DGS3MO"].dropna().resample("ME").last().dropna()
    r = short.to_numpy()
    r0 = float(r[-1])

    vas, vas_notes = calibrate_vasicek(r)
    cir, cir_notes = calibrate_cir(r)
    vas["r0"] = round(r0, 4)
    cir["r0"] = round(r0, 4)

    params = {
        "as_of_date": short.index[-1].date().isoformat(),
        "calibration_window": {
            "start_date": short.index[0].date().isoformat(),
            "end_date": short.index[-1].date().isoformat(),
        },
        "short_rate_proxy": "DGS3MO",
        "sampling": "month-end, dt = 1/12",
        "vasicek": vas,
        "cir": cir,
        "calibration_notes": (vas_notes + cir_notes + [
            f"AR(1) beta is near 1 at monthly frequency, so mean reversion is slow and the long-run mean b is weakly identified; treat (a, b) jointly, not as point forecasts.",
        ]),
    }
    save_json(params, "stochastic_model_parameters.json")
    print(f"Vasicek: a={vas['a']} b={vas['b']:.3%} sigma={vas['sigma']:.3%} r0={r0:.3%}")
    print(f"CIR:     a={cir['a']} b={cir['b']:.3%} sigma={cir['sigma']} "
          f"Feller {'OK' if cir['feller_condition'] else 'VIOLATED'} "
          f"(2ab={cir['feller_value_2ab']}, s^2={cir['sigma_squared']})")
    if vas_notes or cir_notes:
        print("clips:", vas_notes + cir_notes)


if __name__ == "__main__":
    main()

"""05 — Compute bond analytics for the synthetic universe.

Outputs bond_analytics.csv plus a validation table comparing analytic
duration/convexity against finite-difference repricing (this replaces a
QuantLib cross-check; see methodology notes).
"""
import os

import pandas as pd

from engine import KEY_TENORS, base_curves, build_instruments, load_snapshot
from fi_math import finite_diff_checks
from pipeline_paths import DATA_PROCESSED


def main():
    snapshot = load_snapshot()
    curves = base_curves(snapshot)
    instruments = build_instruments()

    rows, checks = [], []
    for instr in instruments:
        a = instr.analytics(curves)
        rows.append({
            "instrument_id": instr.id, "name": instr.name, "sleeve": instr.sleeve,
            "type": instr.type, "maturity_years": instr.maturity,
            "coupon_rate": instr.coupon, "face_value": instr.face,
            "coupon_frequency": instr.freq, "curve_tenor": instr.curve_tenor,
            "is_tips_style": instr.is_tips,
            "base_yield": round(a["base_yield"], 6),
            "base_price": round(a["base_price"], 4),
            "duration_macaulay": round(a["duration_macaulay"], 4),
            "duration_modified": round(a["duration_modified"], 4),
            "convexity": round(a["convexity"], 4),
            "dv01_per_100_face": round(a["dv01_per_100_face"], 6),
            **{f"krd_{t.lower()}": round(float(a["krd"][j]), 4)
               for j, t in enumerate(KEY_TENORS)},
        })
        dmod_a, dmod_fd, cvx_a, cvx_fd = finite_diff_checks(
            instr.times, instr.cfs, a["base_yield"])
        checks.append({
            "instrument_id": instr.id,
            "dmod_analytic": dmod_a, "dmod_finite_diff": dmod_fd,
            "dmod_rel_diff": abs(dmod_a - dmod_fd) / max(dmod_fd, 1e-9),
            "cvx_analytic": cvx_a, "cvx_finite_diff": cvx_fd,
            "cvx_rel_diff": abs(cvx_a - cvx_fd) / max(cvx_fd, 1e-9),
        })

    df = pd.DataFrame(rows)
    df.to_csv(os.path.join(DATA_PROCESSED, "bond_analytics.csv"), index=False)
    vdf = pd.DataFrame(checks)
    vdf.to_csv(os.path.join(DATA_PROCESSED, "_validation_finite_diff.csv"), index=False)

    assert (vdf[["dmod_rel_diff", "cvx_rel_diff"]] < 0.005).all().all(), \
        "analytic vs finite-difference mismatch > 0.5%"
    print(df[["instrument_id", "base_price", "duration_modified", "convexity",
              "dv01_per_100_face", "krd_2y", "krd_5y", "krd_10y", "krd_30y"]].to_string(index=False))
    print("finite-difference validation: all within 0.5%")


if __name__ == "__main__":
    main()

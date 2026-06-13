"""04 — Build the synthetic Treasury bond universe.

Six representative instruments tied to the latest real curve snapshot.
Coupons are set to the current par-ish curve level (rounded to 1/8),
so the synthetic bonds price near 100. These are documented proxies,
not CUSIP-level securities. The TIPS-style proxy is priced off the real
yield curve with a coupon near the current 10Y real yield.
"""
import json
import os

import pandas as pd

from pipeline_paths import DATA_PROCESSED, DATA_RAW


def round_eighth(x):
    return round(x * 8) / 8


def main():
    with open(os.path.join(DATA_PROCESSED, "market_snapshot.json")) as f:
        snap = json.load(f)
    curve = snap["nominal_curve"]
    real = snap["real_yields"]

    rows = [
        # instrument_id, name, sleeve, type, maturity, coupon, tenor, tips
        ("CASH", "Cash / Ultra-Short Bill", "cash", "cash", 0.25, 0.0, "3M", False),
        ("UST_2Y", "2Y Treasury Proxy", "short_treasury", "nominal", 2.0,
         round_eighth(curve["2Y"] * 100) / 100, "2Y", False),
        ("UST_5Y", "5Y Treasury Proxy", "intermediate_treasury", "nominal", 5.0,
         round_eighth(curve["5Y"] * 100) / 100, "5Y", False),
        ("UST_10Y", "10Y Treasury Proxy", "long_intermediate_treasury", "nominal", 10.0,
         round_eighth(curve["10Y"] * 100) / 100, "10Y", False),
        ("UST_30Y", "30Y Treasury Proxy", "long_treasury", "nominal", 30.0,
         round_eighth(curve["30Y"] * 100) / 100, "30Y", False),
        ("TIPS_10Y", "10Y TIPS-Style Proxy", "tips_style", "real", 10.0,
         round_eighth(real["10Y"] * 100) / 100, "10Y", True),
    ]
    df = pd.DataFrame(rows, columns=[
        "instrument_id", "name", "sleeve", "type", "maturity_years",
        "coupon_rate", "curve_tenor", "is_tips_style",
    ])
    df["face_value"] = 100
    df["coupon_frequency"] = [1, 2, 2, 2, 2, 2]
    df = df[["instrument_id", "name", "sleeve", "type", "maturity_years", "coupon_rate",
             "face_value", "coupon_frequency", "curve_tenor", "is_tips_style"]]
    df.to_csv(os.path.join(DATA_RAW, "bond_universe.csv"), index=False)
    print(df.to_string(index=False))


if __name__ == "__main__":
    main()

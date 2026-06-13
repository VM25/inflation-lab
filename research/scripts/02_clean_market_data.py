"""02 — Clean raw market data into analysis-ready panels.

Rules (02_DATA_SPEC.md):
- convert percent quotes to decimals
- drop dates missing any required nominal curve point
- forward-fill real yields / breakevens only across short gaps (<=3 bdays)
- compute CPI YoY and core CPI YoY from monthly index levels
- keep genuine market outliers (2020/2022 moves are the point)

Outputs (intermediate, not exported to the frontend):
  data/processed/_clean_daily_panel.csv   — daily rates panel, decimals
  data/processed/_clean_inflation.csv     — monthly CPI YoY panel, decimals
"""
import os

import pandas as pd

from pipeline_paths import DATA_RAW, DATA_PROCESSED

REQUIRED_CURVE = ["DGS2", "DGS5", "DGS10", "DGS30"]


def read_raw(name):
    df = pd.read_csv(os.path.join(DATA_RAW, name), parse_dates=["date"])
    df = df.drop_duplicates(subset="date").sort_values("date").set_index("date")
    return df


def main():
    yields = read_raw("treasury_yields_raw.csv") / 100.0
    real = read_raw("real_yields_raw.csv") / 100.0
    bei = read_raw("breakevens_raw.csv") / 100.0
    short = read_raw("short_rate_raw.csv") / 100.0
    cpi = read_raw("inflation_raw.csv")  # index levels, not rates

    # Nominal curve: a date is usable only if every required pillar is quoted.
    yields = yields.dropna(subset=REQUIRED_CURVE)

    daily = yields.join([real, bei, short], how="left")
    # Real yields / breakevens / bills: bridge only short gaps (holiday mismatches).
    fill_cols = [c for c in daily.columns if c not in REQUIRED_CURVE]
    daily[fill_cols] = daily[fill_cols].ffill(limit=3)

    daily["slope_2s10s_bps"] = (daily["DGS10"] - daily["DGS2"]) * 10000
    daily["slope_5s30s_bps"] = (daily["DGS30"] - daily["DGS5"]) * 10000

    infl = pd.DataFrame(index=cpi.index)
    infl["cpi_yoy"] = cpi["CPIAUCSL"] / cpi["CPIAUCSL"].shift(12) - 1.0
    infl["core_cpi_yoy"] = cpi["CPILFESL"] / cpi["CPILFESL"].shift(12) - 1.0
    infl = infl.dropna()

    daily.to_csv(os.path.join(DATA_PROCESSED, "_clean_daily_panel.csv"), date_format="%Y-%m-%d")
    infl.to_csv(os.path.join(DATA_PROCESSED, "_clean_inflation.csv"), date_format="%Y-%m-%d")

    assert daily[REQUIRED_CURVE].max().max() < 0.20, "percent->decimal conversion failed"
    print(f"daily panel: {len(daily)} rows {daily.index.min().date()} -> {daily.index.max().date()}")
    print(f"inflation: {len(infl)} rows, latest CPI YoY {infl['cpi_yoy'].iloc[-1]:.3%}")


if __name__ == "__main__":
    main()

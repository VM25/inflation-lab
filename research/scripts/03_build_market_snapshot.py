"""03 — Build the market snapshot, curve history, and regime history.

Outputs:
  market_snapshot.json     — latest internally-consistent macro/rates state
  yield_curve_history.csv  — daily 2Y/5Y/10Y/30Y + slopes (decimals / bps)
  macro_regime_history.csv — monthly macro panel with transparent regime label
"""
import json
import os

import pandas as pd

from pipeline_paths import DATA_PROCESSED


def classify_regime(row, prev):
    """Transparent, rule-based regime label (explanatory, not predictive)."""
    cpi = row["cpi_yoy"]
    d_real = row["real_yield_10y"] - prev["real_yield_10y"] if prev is not None else 0.0
    d_2y = row["nominal_2y"] - prev["nominal_2y"] if prev is not None else 0.0
    d_10y = row["nominal_10y"] - prev["nominal_10y"] if prev is not None else 0.0
    d_30y = row["nominal_30y"] - prev["nominal_30y"] if prev is not None else 0.0

    if cpi > 0.04 and d_2y > 0.0025:
        return "Inflation Reacceleration"
    if cpi > 0.03 and d_real >= 0:
        return "Sticky Inflation / Higher-for-Longer"
    if prev is not None and cpi < prev["cpi_yoy"] and d_2y < -0.0010:
        return "Disinflation / Soft Landing"
    if d_30y > d_2y + 0.0010 and d_30y > 0:
        return "Bear Steepener"
    if d_2y < d_30y - 0.0010 and d_2y < 0:
        return "Bull Flattener"
    if cpi > 0.03:
        return "Sticky Inflation / Higher-for-Longer"
    return "Disinflation / Soft Landing"


def main():
    daily = pd.read_csv(os.path.join(DATA_PROCESSED, "_clean_daily_panel.csv"),
                        parse_dates=["date"]).set_index("date")
    infl = pd.read_csv(os.path.join(DATA_PROCESSED, "_clean_inflation.csv"),
                       parse_dates=["date"]).set_index("date")

    # --- yield_curve_history.csv -------------------------------------------
    hist = pd.DataFrame({
        "y_2y": daily["DGS2"], "y_5y": daily["DGS5"],
        "y_10y": daily["DGS10"], "y_30y": daily["DGS30"],
        "slope_2s10s_bps": daily["slope_2s10s_bps"].round(1),
        "slope_5s30s_bps": daily["slope_5s30s_bps"].round(1),
    })
    hist.round(5).to_csv(os.path.join(DATA_PROCESSED, "yield_curve_history.csv"),
                         date_format="%Y-%m-%d")

    # --- macro_regime_history.csv (monthly, CPI-aligned) -------------------
    monthly = daily.resample("ME").last()
    panel = pd.DataFrame({
        "cpi_yoy": infl["cpi_yoy"].resample("ME").last(),
        "core_cpi_yoy": infl["core_cpi_yoy"].resample("ME").last(),
        "real_yield_5y": monthly["DFII5"],
        "real_yield_10y": monthly["DFII10"],
        "breakeven_5y": monthly["T5YIE"],
        "breakeven_10y": monthly["T10YIE"],
        "nominal_2y": monthly["DGS2"],
        "nominal_10y": monthly["DGS10"],
        "nominal_30y": monthly["DGS30"],
        "slope_2s10s_bps": monthly["slope_2s10s_bps"].round(1),
    }).dropna(subset=["cpi_yoy", "real_yield_10y", "nominal_10y"])

    labels, prev = [], None
    for _, row in panel.iterrows():
        labels.append(classify_regime(row, prev))
        prev = row
    panel["regime_label"] = labels
    out = panel.drop(columns=["nominal_30y"]).round(5)
    out.to_csv(os.path.join(DATA_PROCESSED, "macro_regime_history.csv"), date_format="%Y-%m-%d")

    # --- market_snapshot.json ----------------------------------------------
    last = daily.dropna(subset=["DFII5", "DFII10", "T5YIE", "T10YIE"]).iloc[-1]
    rates_as_of = last.name.date().isoformat()
    cpi_last = infl.iloc[-1]
    snapshot_row = panel.iloc[-1]

    snapshot = {
        "as_of_date": rates_as_of,
        "data_window": {
            "start_date": daily.index.min().date().isoformat(),
            "end_date": daily.index.max().date().isoformat(),
        },
        "nominal_curve": {
            "2Y": round(float(last["DGS2"]), 5), "5Y": round(float(last["DGS5"]), 5),
            "10Y": round(float(last["DGS10"]), 5), "30Y": round(float(last["DGS30"]), 5),
        },
        "short_rate_3m": round(float(last["DGS3MO"]), 5),
        "real_yields": {
            "5Y": round(float(last["DFII5"]), 5), "10Y": round(float(last["DFII10"]), 5),
            "30Y": round(float(last["DFII30"]), 5),
        },
        "breakevens": {
            "5Y": round(float(last["T5YIE"]), 5), "10Y": round(float(last["T10YIE"]), 5),
        },
        "inflation": {
            "cpi_yoy": round(float(cpi_last["cpi_yoy"]), 5),
            "core_cpi_yoy": round(float(cpi_last["core_cpi_yoy"]), 5),
            "latest_cpi_date": cpi_last.name.date().isoformat(),
        },
        "curve_slopes": {
            "2s10s_bps": round(float(last["slope_2s10s_bps"]), 1),
            "5s30s_bps": round(float(last["slope_5s30s_bps"]), 1),
        },
        "regime_label": str(snapshot_row["regime_label"]),
        "source_notes": [
            "Treasury nominal and real yields from public daily constant-maturity series (FRED).",
            "Breakeven inflation from public daily series (FRED).",
            "CPI / core CPI year-over-year computed from monthly index levels (FRED).",
            "All data processed offline; the site makes no live API calls.",
        ],
    }
    with open(os.path.join(DATA_PROCESSED, "market_snapshot.json"), "w") as f:
        json.dump(snapshot, f, indent=2)

    print(f"snapshot as of {rates_as_of}: regime = {snapshot['regime_label']}")
    print(f"curve 2Y={last['DGS2']:.3%} 10Y={last['DGS10']:.3%} 2s10s={last['slope_2s10s_bps']:.0f}bp")
    print(f"CPI YoY {cpi_last['cpi_yoy']:.2%} (as of {cpi_last.name.date()})")


if __name__ == "__main__":
    main()

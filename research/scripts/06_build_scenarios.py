"""06 — Build scenario definitions and portfolio presets.

Stylized shocks follow 01_QUANT_SPEC §13.3. The 2022 inflation replay is
computed from actual yield changes between the last business days of 2021
and 2022, including the measured real-yield share from TIPS series.

Real/breakeven decomposition is market-estimated, not assumed: for generic
rate scenarios the real share of a nominal move per tenor is the OLS beta
of daily real-yield changes (DFII) on nominal changes (DGS) over the last
three years of data. 2Y has no TIPS constant-maturity series, so it borrows
the 5Y beta (labeled approximation). Real-rate and breakeven scenarios use
1.0 and 0.0 by definition; the 2022 replay uses its measured split.

Each scenario carries:
  shocks_bps           — nominal pillar shocks (what the curve chart shows)
  real_shocks_bps      — the portion applied to the real curve (TIPS repricing)
  breakeven_shocks_bps — the remainder (inflation-compensation channel)
  real_share_parallel  — share used to re-label the duration channel in
                         attribution for real-rate / breakeven / historical scenarios
"""
import os

import pandas as pd

from engine import KEY_TENORS, save_json
from pipeline_paths import DATA_PROCESSED


def with_split(shocks, real_share_by_tenor):
    real = {t: round(shocks[t] * real_share_by_tenor[t], 1) for t in KEY_TENORS}
    be = {t: round(shocks[t] - real[t], 1) for t in KEY_TENORS}
    avg_nominal = sum(shocks.values()) / 4.0
    share = (sum(real.values()) / 4.0) / avg_nominal if avg_nominal != 0 else 0.0
    return real, be, round(share, 4)


def uniform(v):
    return {t: v for t in KEY_TENORS}


def market_real_betas(window_years=3):
    """Per-tenor real share of nominal moves, from daily co-movement.

    beta_real(tenor) = cov(d DFII, d DGS) / var(d DGS) over the trailing
    window. Returns ({tenor: beta}, window_string).
    """
    daily = pd.read_csv(os.path.join(DATA_PROCESSED, "_clean_daily_panel.csv"),
                        parse_dates=["date"]).set_index("date")
    end = daily.index.max()
    start = end - pd.DateOffset(years=window_years)
    win = daily.loc[start:end]
    pairs = {"5Y": ("DFII5", "DGS5"), "10Y": ("DFII10", "DGS10"), "30Y": ("DFII30", "DGS30")}
    betas = {}
    for tenor, (real_col, nom_col) in pairs.items():
        d = win[[real_col, nom_col]].dropna().diff().dropna()
        beta = d[real_col].cov(d[nom_col]) / d[nom_col].var()
        betas[tenor] = round(float(min(max(beta, 0.0), 1.0)), 2)
    betas["2Y"] = betas["5Y"]  # no 2Y TIPS CM series; documented approximation
    return betas, f"{win.index.min().date()} to {win.index.max().date()}"


def replay_2022():
    """Measured 2022 curve shift; falls back to the spec's stylized values."""
    daily = pd.read_csv(os.path.join(DATA_PROCESSED, "_clean_daily_panel.csv"),
                        parse_dates=["date"]).set_index("date")
    try:
        start = daily.loc[:"2021-12-31"].iloc[-1]
        end = daily.loc[:"2022-12-31"].iloc[-1]
        nom = {t: round((end[f"DGS{t[:-1]}"] - start[f"DGS{t[:-1]}"]) * 10000, 1)
               for t in KEY_TENORS}
        real = {
            "2Y": round((end["DFII5"] - start["DFII5"]) * 10000, 1),  # 5Y proxy, documented
            "5Y": round((end["DFII5"] - start["DFII5"]) * 10000, 1),
            "10Y": round((end["DFII10"] - start["DFII10"]) * 10000, 1),
            "30Y": round((end["DFII30"] - start["DFII30"]) * 10000, 1),
        }
        # no cap: in 2022 real yields rose MORE than nominals at some tenors,
        # i.e. breakevens narrowed; the negative breakeven shock is the data
        be = {t: round(nom[t] - real[t], 1) for t in KEY_TENORS}
        share = round((sum(real.values()) / 4.0) / (sum(nom.values()) / 4.0), 4)
        window = f"{start.name.date()} to {end.name.date()}"
        return nom, real, be, share, window, True
    except Exception:
        nom = {"2Y": 250.0, "5Y": 225.0, "10Y": 200.0, "30Y": 150.0}
        real, be, share = with_split(nom, uniform(0.85))
        return nom, real, be, share, "stylized fallback", False


def main():
    scenarios = []
    betas, beta_window = market_real_betas()

    def add(sid, name, stype, shocks, real_share_by_tenor, description, interp, split_basis):
        real, be, share = with_split(shocks, real_share_by_tenor)
        scenarios.append({
            "scenario_id": sid, "name": name, "scenario_type": stype,
            "description": description, "shocks_bps": shocks,
            "real_shocks_bps": real, "breakeven_shocks_bps": be,
            "real_share_parallel": share, "macro_interpretation": interp,
            "split_basis": split_basis,
        })

    MKT = f"per-tenor beta of daily real vs nominal yield changes, {beta_window}; 2Y borrows the 5Y beta"

    add("current_snapshot", "Current Market Snapshot", "base",
        uniform(0.0), uniform(0.0),
        "No shock applied. The base curve is the latest data snapshot.",
        "The reference state: today's curve, real yields, and breakevens.", "definitional")

    add("parallel_50", "Parallel +50 bps", "parallel",
        uniform(50.0), betas,
        "All major curve points rise by 50 bps.",
        "Tests baseline duration sensitivity under a uniform rate increase.", MKT)

    add("parallel_100", "Parallel +100 bps", "parallel",
        uniform(100.0), betas,
        "All major curve points rise by 100 bps.",
        "A larger uniform shock that exposes convexity and approximation error.", MKT)

    add("bear_steepener", "Bear Steepener", "steepener",
        {"2Y": 25.0, "5Y": 50.0, "10Y": 85.0, "30Y": 110.0}, betas,
        "Long-end yields rise more than front-end yields.",
        "Punishes 10Y/30Y key-rate exposure; total duration alone understates the risk.", MKT)

    add("bull_flattener", "Bull Flattener", "flattener",
        {"2Y": -100.0, "5Y": -75.0, "10Y": -40.0, "30Y": -20.0}, betas,
        "Front-end yields fall more than long-end yields.",
        "A rally led by policy-rate repricing; front-end exposure gains most.", MKT)

    add("front_end_repricing", "Front-End Repricing", "front_end",
        {"2Y": 100.0, "5Y": 75.0, "10Y": 25.0, "30Y": 10.0}, betas,
        "2Y/5Y yields move materially as the policy path reprices.",
        "Tests short/intermediate books; long-duration books are less affected.", MKT)

    add("long_end_premium", "Long-End Term Premium Shock", "term_premium",
        {"2Y": 10.0, "5Y": 25.0, "10Y": 75.0, "30Y": 125.0}, betas,
        "10Y/30Y yields rise disproportionately as term premium rebuilds.",
        "Concentrated long-end losses with visible convexity effects.", MKT)

    add("real_rate_shock", "Real-Rate Shock", "real_rate",
        {"2Y": 50.0, "5Y": 65.0, "10Y": 75.0, "30Y": 75.0}, uniform(1.0),
        "Real yields rise across the curve; breakevens are stable.",
        "Both nominal Treasuries and TIPS-style exposure lose; TIPS do not hedge real-rate repricing.", "definitional: a pure real-yield move")

    add("breakeven_shock", "Breakeven Inflation Shock", "breakeven",
        {"2Y": 25.0, "5Y": 40.0, "10Y": 35.0, "30Y": 20.0}, uniform(0.0),
        "Inflation compensation widens; real yields are stable.",
        "Nominal Treasuries lose; TIPS-style exposure is insulated, the inflation-hedge case.", "definitional: a pure breakeven move")

    nom, real, be, share, window, measured = replay_2022()
    scenarios.append({
        "scenario_id": "replay_2022", "name": "2022 Inflation Replay", "scenario_type": "historical",
        "description": (f"Measured Treasury curve shift over {window}."
                        if measured else
                        "Stylized approximation of the 2022 inflation/rates shock (historical data unavailable)."),
        "shocks_bps": nom, "real_shocks_bps": real, "breakeven_shocks_bps": be,
        "real_share_parallel": share,
        "macro_interpretation": ("The 2022 episode: an inflation regime where real-yield repricing drove "
                                 "historic Treasury losses and broke the stock-bond hedge."),
        "historical_window": window, "is_measured_historical": measured,
        "split_basis": "measured DFII changes over the same window; 2Y borrows the 5Y change",
    })
    save_json(scenarios, "scenario_definitions.json")

    presets = [
        {
            "portfolio_id": "short_duration_defensive", "name": "Short-Duration Defensive",
            "description": "Lower-duration Treasury book built to reduce sensitivity to rate increases.",
            "weights": {"CASH": 0.20, "UST_2Y": 0.45, "UST_5Y": 0.25, "UST_10Y": 0.10,
                        "UST_30Y": 0.00, "TIPS_10Y": 0.00},
        },
        {
            "portfolio_id": "intermediate_treasury_book", "name": "Intermediate Treasury Book",
            "description": "Belly-weighted book with benchmark-like 5Y/10Y exposure.",
            "weights": {"CASH": 0.05, "UST_2Y": 0.15, "UST_5Y": 0.35, "UST_10Y": 0.35,
                        "UST_30Y": 0.10, "TIPS_10Y": 0.00},
        },
        {
            "portfolio_id": "long_duration_hedge_book", "name": "Long-Duration Hedge Book",
            "description": "The classic equity-hedge Treasury book: heavy 10Y/30Y duration. "
                           "This is the book that inflation regimes break.",
            "weights": {"CASH": 0.05, "UST_2Y": 0.05, "UST_5Y": 0.15, "UST_10Y": 0.35,
                        "UST_30Y": 0.40, "TIPS_10Y": 0.00},
        },
        {
            "portfolio_id": "inflation_sensitive_book", "name": "Inflation-Sensitive Treasury Book",
            "description": "Shifts a meaningful sleeve into TIPS-style exposure to trade breakeven risk for real-rate risk.",
            "weights": {"CASH": 0.05, "UST_2Y": 0.15, "UST_5Y": 0.15, "UST_10Y": 0.20,
                        "UST_30Y": 0.10, "TIPS_10Y": 0.35},
        },
        {
            "portfolio_id": "barbell_treasury_book", "name": "Barbell Treasury Book",
            "description": "Front-end plus long-end barbell: duration similar to a bullet, but key-rate exposure concentrated at the wings.",
            "weights": {"CASH": 0.05, "UST_2Y": 0.40, "UST_5Y": 0.00, "UST_10Y": 0.10,
                        "UST_30Y": 0.45, "TIPS_10Y": 0.00},
        },
    ]
    for p in presets:
        s = sum(p["weights"].values())
        assert abs(s - 1.0) < 1e-9, f"{p['portfolio_id']} weights sum to {s}"
    save_json(presets, "portfolio_presets.json")
    print(f"{len(scenarios)} scenarios, {len(presets)} presets")
    print(f"market real betas ({beta_window}): {betas}")
    if measured:
        print(f"2022 replay measured over {window}: nominal={nom} real_share={share}")


if __name__ == "__main__":
    main()

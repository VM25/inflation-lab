"""Shared research engine: curves, instruments, scenario repricing, attribution.

Modeling choices (documented in the app methodology):

- Nominal curve pillars: 3M, 2Y, 5Y, 10Y, 30Y (linear interp, flat ends).
- Real curve pillars: 5Y, 10Y, 30Y from TIPS constant-maturity yields;
  flat-extrapolated below 5Y.
- Nominal instruments reprice off nominal-curve shocks. The TIPS-style
  proxy reprices off the real curve only; each scenario specifies how much
  of its nominal shock is a real-yield move (`real_shocks_bps`), with the
  remainder treated as breakeven inflation compensation.
- Attribution identity per instrument:
      exact P&L = duration + convexity + curve_shape + residual
  where duration/convexity use the instrument-relevant parallel shock
  (mean pillar shock; real-curve mean for TIPS) and curve_shape is the
  key-rate first-order correction for the non-parallel part.
  For scenarios tagged real_rate / breakeven / historical, the nominal
  duration channel is re-labeled into real-rate and breakeven channels
  using the scenario's parallel real/breakeven split. TIPS duration risk
  is always a real-rate exposure.
"""
import json
import os

import numpy as np
import pandas as pd

from fi_math import (
    COUPON_FREQ, Curve, bond_cashflows, convexity, key_rate_durations,
    macaulay_duration, modified_duration, price_from_curve, ytm_from_price,
)
from pipeline_paths import DATA_PROCESSED, DATA_RAW

KEY_TENORS = ["2Y", "5Y", "10Y", "30Y"]
KEY_YEARS = [2.0, 5.0, 10.0, 30.0]
REAL_PILLARS = [5.0, 10.0, 30.0]
PORTFOLIO_VALUE = 1_000_000.0


# --------------------------------------------------------------------------
# Loading
# --------------------------------------------------------------------------

def load_snapshot():
    with open(os.path.join(DATA_PROCESSED, "market_snapshot.json")) as f:
        return json.load(f)


def load_universe():
    return pd.read_csv(os.path.join(DATA_RAW, "bond_universe.csv"))


def load_json(name, processed=True):
    base = DATA_PROCESSED if processed else DATA_RAW
    with open(os.path.join(base, name)) as f:
        return json.load(f)


def save_json(obj, name):
    with open(os.path.join(DATA_PROCESSED, name), "w") as f:
        json.dump(obj, f, indent=2)
    print(f"wrote {name}")


# --------------------------------------------------------------------------
# Curves
# --------------------------------------------------------------------------

def base_curves(snapshot):
    nom = Curve(
        [0.25] + KEY_YEARS,
        [snapshot["short_rate_3m"]] + [snapshot["nominal_curve"][t] for t in KEY_TENORS],
    )
    real = Curve(REAL_PILLARS, [snapshot["real_yields"][t] for t in ["5Y", "10Y", "30Y"]])
    return {"nominal": nom, "real": real}


def shocked_curves(curves, scenario):
    """Apply a scenario's pillar shocks. The 3M pillar follows the 2Y shock
    (flat front extrapolation); real pillars use the scenario's real shocks."""
    nshock = scenario["shocks_bps"]
    nom_shocks = [nshock["2Y"]] + [nshock[t] for t in KEY_TENORS]
    nom = curves["nominal"].shifted([0.25] + KEY_YEARS, [s / 10000.0 for s in nom_shocks])

    rshock = scenario.get("real_shocks_bps", {t: 0.0 for t in KEY_TENORS})
    real = curves["real"].shifted(
        REAL_PILLARS, [rshock[t] / 10000.0 for t in ["5Y", "10Y", "30Y"]]
    )
    return {"nominal": nom, "real": real}


# --------------------------------------------------------------------------
# Instruments
# --------------------------------------------------------------------------

class Instrument:
    def __init__(self, row):
        self.id = row["instrument_id"]
        self.name = row["name"]
        self.sleeve = row["sleeve"]
        self.type = row["type"]
        self.maturity = float(row["maturity_years"])
        self.coupon = float(row["coupon_rate"])
        self.face = float(row["face_value"])
        self.freq = int(row["coupon_frequency"])
        self.curve_tenor = row["curve_tenor"]
        self.is_tips = bool(row["is_tips_style"])
        self.curve_kind = "real" if self.is_tips else "nominal"
        self.times, self.cfs = bond_cashflows(self.face, self.coupon, self.maturity, COUPON_FREQ)

    def price(self, curves):
        return price_from_curve(self.times, self.cfs, curves[self.curve_kind])

    def analytics(self, curves):
        p = self.price(curves)
        y = ytm_from_price(self.times, self.cfs, p)
        dmac = macaulay_duration(self.times, self.cfs, y)
        dmod = modified_duration(self.times, self.cfs, y)
        cvx = convexity(self.times, self.cfs, y)
        if self.is_tips:
            # TIPS key-rate exposure is measured against the real curve
            krd_real = key_rate_durations(self.times, self.cfs, curves["real"], REAL_PILLARS)
            krd = np.array([0.0, krd_real[0], krd_real[1], krd_real[2]])
        else:
            krd = key_rate_durations(self.times, self.cfs, curves["nominal"], KEY_YEARS)
        return {
            "base_price": p, "base_yield": y, "duration_macaulay": dmac,
            "duration_modified": dmod, "convexity": cvx,
            "dv01_per_100_face": dmod * p * 1e-4,
            "krd": krd,  # aligned with KEY_TENORS
        }


def build_instruments():
    universe = load_universe()
    return [Instrument(row) for _, row in universe.iterrows()]


# --------------------------------------------------------------------------
# Scenario repricing + attribution (per instrument, per $1 of market value)
# --------------------------------------------------------------------------

def instrument_scenario(instr, ana, curves, scenario):
    """Returns per-$1-of-market-value returns and attribution components."""
    shocked = shocked_curves(curves, scenario)
    p0, p1 = ana["base_price"], instr.price(shocked)
    ret_exact = (p1 - p0) / p0

    # instrument-relevant pillar shocks (bps)
    if instr.is_tips:
        shocks = scenario.get("real_shocks_bps", {t: 0.0 for t in KEY_TENORS})
    else:
        shocks = scenario["shocks_bps"]
    svec = np.array([shocks[t] for t in KEY_TENORS], dtype=float)
    dy_par = float(svec.mean()) / 10000.0
    par_bps = float(svec.mean())

    dmod, cvx = ana["duration_modified"], ana["convexity"]
    ret_duration = -dmod * dy_par
    ret_convex_term = 0.5 * cvx * dy_par ** 2
    # key-rate correction for the non-parallel part, per $1 of value
    krd_per_dollar_bp = ana["krd"] * 1e-4
    ret_curve_shape = float(np.sum(-krd_per_dollar_bp * (svec - par_bps)))
    ret_residual = ret_exact - (ret_duration + ret_convex_term + ret_curve_shape)

    # channel classification
    reclassify = scenario.get("scenario_type") in ("real_rate", "breakeven", "historical")
    real_share = scenario.get("real_share_parallel", 0.0)
    if instr.is_tips:
        real_c, be_c, dur_c = ret_duration, 0.0, 0.0
    elif reclassify:
        real_c = ret_duration * real_share
        be_c = ret_duration * (1.0 - real_share)
        dur_c = 0.0
    else:
        real_c, be_c, dur_c = 0.0, 0.0, ret_duration

    krd_pnl = {t: float(-krd_per_dollar_bp[j] * svec[j]) for j, t in enumerate(KEY_TENORS)}

    return {
        "ret_exact": ret_exact,
        "ret_duration_only": ret_duration,
        "ret_convexity_adjusted": ret_duration + ret_convex_term,
        "key_rate_ret": krd_pnl,
        "attribution_ret": {
            "duration": dur_c, "convexity": ret_convex_term,
            "curve_shape": ret_curve_shape, "real_rate": real_c,
            "breakeven": be_c, "residual": ret_residual,
        },
    }


# --------------------------------------------------------------------------
# Portfolio aggregation
# --------------------------------------------------------------------------

def portfolio_metrics(weights, instruments, analytics, value=PORTFOLIO_VALUE):
    dmod = sum(weights.get(i.id, 0.0) * a["duration_modified"] for i, a in zip(instruments, analytics))
    cvx = sum(weights.get(i.id, 0.0) * a["convexity"] for i, a in zip(instruments, analytics))
    dv01_total = dmod * value * 1e-4
    krd_dv01 = {
        t: sum(weights.get(i.id, 0.0) * value * a["krd"][j] * 1e-4
               for i, a in zip(instruments, analytics))
        for j, t in enumerate(KEY_TENORS)
    }
    return {"duration_modified": dmod, "convexity": cvx, "dv01": dv01_total,
            "key_rate_dv01": krd_dv01}


def portfolio_scenario(weights, instruments, analytics, scen_rows, value=PORTFOLIO_VALUE):
    """Aggregate per-instrument scenario returns into portfolio P&L dollars."""
    agg = {
        "pnl_exact": 0.0, "pnl_duration_only": 0.0, "pnl_convexity_adjusted": 0.0,
        "key_rate_pnl": {t: 0.0 for t in KEY_TENORS},
        "attribution": {k: 0.0 for k in
                        ["duration", "convexity", "curve_shape", "real_rate", "breakeven", "residual"]},
    }
    for instr, row in zip(instruments, scen_rows):
        v = weights.get(instr.id, 0.0) * value
        agg["pnl_exact"] += v * row["ret_exact"]
        agg["pnl_duration_only"] += v * row["ret_duration_only"]
        agg["pnl_convexity_adjusted"] += v * row["ret_convexity_adjusted"]
        for t in KEY_TENORS:
            agg["key_rate_pnl"][t] += v * row["key_rate_ret"][t]
        for k in agg["attribution"]:
            agg["attribution"][k] += v * row["attribution_ret"][k]
    return agg

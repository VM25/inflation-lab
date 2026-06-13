"""Fixed-income math for the Inflation Regime Rates Risk Engine.

Transparent custom implementation (no QuantLib dependency). Conventions:

- Yields are decimals (0.045 = 4.5%), semiannual compounding (m = 2) for
  coupon Treasuries; the cash sleeve is a short zero priced the same way.
- Discount factors: DF(t) = (1 + y(t)/m)^(-m*t) with y(t) linearly
  interpolated on the curve pillars and flat-extrapolated at both ends.
- Synthetic bonds are issued exactly on coupon dates, so accrued interest
  is zero and clean price equals dirty price.
- Key-rate durations bump one pillar by +1bp and reprice; the bump
  propagates through linear interpolation, which is the standard
  triangular key-rate scheme on a linearly interpolated curve.

All of this is documented in the app's methodology notes.
"""
import numpy as np

COUPON_FREQ = 2  # semiannual
KEY_TENORS = ["2Y", "5Y", "10Y", "30Y"]
TENOR_YEARS = {"3M": 0.25, "1Y": 1.0, "2Y": 2.0, "5Y": 5.0, "10Y": 10.0, "30Y": 30.0}


class Curve:
    """Piecewise-linear yield curve with flat extrapolation."""

    def __init__(self, tenors_years, yields):
        order = np.argsort(tenors_years)
        self.t = np.asarray(tenors_years, dtype=float)[order]
        self.y = np.asarray(yields, dtype=float)[order]

    def yield_at(self, t):
        return np.interp(t, self.t, self.y)

    def df(self, t, m=COUPON_FREQ):
        t = np.asarray(t, dtype=float)
        y = self.yield_at(t)
        return (1.0 + y / m) ** (-m * t)

    def shifted(self, pillar_years, shock_decimals):
        """Return a new curve with pillar shocks applied (other pillars 0)."""
        bump = {round(float(p), 6): s for p, s in zip(pillar_years, shock_decimals)}
        new_y = self.y + np.array([bump.get(round(float(t), 6), 0.0) for t in self.t])
        return Curve(self.t, new_y)

    def parallel(self, dy):
        return Curve(self.t, self.y + dy)


def bond_cashflows(face, coupon_rate, maturity_years, freq=COUPON_FREQ):
    """Cash-flow times and amounts for a bond issued on a coupon date."""
    if coupon_rate == 0.0 or maturity_years * freq < 1:
        return np.array([maturity_years]), np.array([float(face)])
    n = int(round(maturity_years * freq))
    times = np.arange(1, n + 1) / freq
    cfs = np.full(n, face * coupon_rate / freq)
    cfs[-1] += face
    return times, cfs


def price_from_curve(times, cfs, curve, m=COUPON_FREQ):
    return float(np.sum(cfs * curve.df(times, m)))


def ytm_from_price(times, cfs, price, m=COUPON_FREQ, guess=0.04):
    """Solve the flat yield that reproduces `price` (Newton with bisection guard)."""
    def f(y):
        return float(np.sum(cfs * (1.0 + y / m) ** (-m * times))) - price

    y = guess
    for _ in range(60):
        fy = f(y)
        dfy = float(np.sum(cfs * (-times) * (1.0 + y / m) ** (-m * times - 1.0)))
        if abs(dfy) < 1e-14:
            break
        step = fy / dfy
        y -= step
        if abs(step) < 1e-12:
            break
    if abs(f(y)) > 1e-6:  # fallback: bisection on a wide bracket
        lo, hi = -0.05, 0.50
        for _ in range(200):
            mid = 0.5 * (lo + hi)
            if f(lo) * f(mid) <= 0:
                hi = mid
            else:
                lo = mid
        y = 0.5 * (lo + hi)
    return float(y)


def macaulay_duration(times, cfs, ytm, m=COUPON_FREQ):
    pv = cfs * (1.0 + ytm / m) ** (-m * times)
    p = pv.sum()
    return float(np.sum(times * pv) / p)


def modified_duration(times, cfs, ytm, m=COUPON_FREQ):
    return macaulay_duration(times, cfs, ytm, m) / (1.0 + ytm / m)


def convexity(times, cfs, ytm, m=COUPON_FREQ):
    """Discrete-compounding convexity: (1/P) * d2P/dy2."""
    p = float(np.sum(cfs * (1.0 + ytm / m) ** (-m * times)))
    d2 = float(np.sum(cfs * times * (times + 1.0 / m) * (1.0 + ytm / m) ** (-(m * times + 2.0))))
    return d2 / p


def dv01(mod_duration, price_or_value):
    """Dollar value of 1bp for a given market value (per the same units)."""
    return mod_duration * price_or_value * 1e-4


def key_rate_durations(times, cfs, curve, pillar_years, m=COUPON_FREQ):
    """KRD_j = -(P_bumped - P_base) / (P_base * 1bp), bumping one pillar at a time."""
    p0 = price_from_curve(times, cfs, curve, m)
    out = []
    for j, _ in enumerate(pillar_years):
        shocks = [0.0] * len(pillar_years)
        shocks[j] = 1e-4
        pj = price_from_curve(times, cfs, curve.shifted(pillar_years, shocks), m)
        out.append(-(pj - p0) / (p0 * 1e-4))
    return np.array(out)


def finite_diff_checks(times, cfs, ytm, m=COUPON_FREQ, eps=1e-6):
    """Cross-validate analytic duration/convexity with finite differences.

    Returns (dmod_analytic, dmod_fd, cvx_analytic, cvx_fd) — used by the
    pipeline's validation step in place of a QuantLib comparison.
    """
    def p(y):
        return float(np.sum(cfs * (1.0 + y / m) ** (-m * times)))

    p0 = p(ytm)
    dmod_fd = -(p(ytm + eps) - p(ytm - eps)) / (2 * eps * p0)
    cvx_fd = (p(ytm + eps) - 2 * p0 + p(ytm - eps)) / (eps ** 2 * p0)
    return modified_duration(times, cfs, ytm, m), dmod_fd, convexity(times, cfs, ytm, m), cvx_fd

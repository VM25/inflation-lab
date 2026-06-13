"""01 — Fetch public market data from FRED into data/raw/.

Uses FRED's public CSV endpoint (no API key). All series are daily unless
noted. ETF proxies are intentionally not used: the project universe is
synthetic Treasury instruments built from the real curve (see 02_DATA_SPEC).
"""
import io
import subprocess
import time
import urllib.request

import pandas as pd

from pipeline_paths import DATA_RAW

START_DATE = "2015-01-01"
FRED_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv?id={sid}&cosd={start}"
USER_AGENT = "Mozilla/5.0 (research pipeline; offline static site build)"

GROUPS = {
    "treasury_yields_raw.csv": ["DGS2", "DGS5", "DGS10", "DGS30"],
    "real_yields_raw.csv": ["DFII5", "DFII10", "DFII30"],
    "breakevens_raw.csv": ["T5YIE", "T10YIE", "T5YIFR"],
    "inflation_raw.csv": ["CPIAUCSL", "CPILFESL"],  # monthly index levels
    "short_rate_raw.csv": ["DGS3MO"],
}


def _download(url):
    # curl first: it is universally available on macOS and respects system
    # network configuration that urllib sometimes does not.
    try:
        out = subprocess.run(["curl", "-sf", "--max-time", "60", url],
                             capture_output=True, text=True, check=True)
        return out.stdout
    except Exception:  # noqa: BLE001 — fall back to urllib
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.read().decode("utf-8")


def fetch_series(sid):
    url = FRED_URL.format(sid=sid, start=START_DATE)
    for attempt in range(3):
        try:
            raw = _download(url)
            df = pd.read_csv(io.StringIO(raw))
            df.columns = ["date", sid]
            df["date"] = pd.to_datetime(df["date"])
            df[sid] = pd.to_numeric(df[sid], errors="coerce")  # FRED uses "." for NA
            return df.set_index("date")
        except Exception as exc:  # noqa: BLE001 — retry then surface
            if attempt == 2:
                raise RuntimeError(f"Failed to fetch {sid}: {exc}") from exc
            time.sleep(2)


def main():
    import os
    for filename, series in GROUPS.items():
        frames = []
        for sid in series:
            frames.append(fetch_series(sid))
            time.sleep(2)  # be polite to FRED; rapid bursts get throttled
        merged = pd.concat(frames, axis=1).sort_index()
        merged.index.name = "date"
        out = os.path.join(DATA_RAW, filename)
        merged.to_csv(out, date_format="%Y-%m-%d")
        last = merged.dropna(how="all").index.max().date()
        print(f"wrote {filename}: {len(merged)} rows, series={series}, last={last}")


if __name__ == "__main__":
    main()

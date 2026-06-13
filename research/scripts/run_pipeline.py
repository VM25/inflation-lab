"""Run the full research pipeline end-to-end.

    python research/scripts/run_pipeline.py [--skip-fetch]

--skip-fetch reuses existing raw CSVs (useful offline / for reproducibility).
"""
import runpy
import os
import sys
import time

SCRIPTS = [
    "01_fetch_market_data.py",
    "02_clean_market_data.py",
    "03_build_market_snapshot.py",
    "04_build_bond_universe.py",
    "05_compute_bond_analytics.py",
    "06_build_scenarios.py",
    "07_run_scenario_engine.py",
    "08_run_hedge_overlays.py",
    "09_calibrate_stochastic_rates.py",
    "10_run_stochastic_var.py",
    "11_export_frontend_data.py",
    "sanity_checks.py",
]


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    sys.path.insert(0, here)
    skip_fetch = "--skip-fetch" in sys.argv
    for script in SCRIPTS:
        if skip_fetch and script.startswith("01_"):
            print(f"\n--- skipping {script} (using existing raw data) ---")
            continue
        print(f"\n--- {script} ---")
        t0 = time.time()
        runpy.run_path(os.path.join(here, script), run_name="__main__")
        print(f"    done in {time.time() - t0:.1f}s")
    print("\npipeline complete")


if __name__ == "__main__":
    main()

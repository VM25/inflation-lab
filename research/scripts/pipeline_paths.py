"""Shared filesystem paths for the research pipeline."""
import os

SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(SCRIPTS_DIR, "..", ".."))

DATA_RAW = os.path.join(ROOT, "data", "raw")
DATA_PROCESSED = os.path.join(ROOT, "data", "processed")
PUBLIC_DATA = os.path.join(ROOT, "public", "data")

for _d in (DATA_RAW, DATA_PROCESSED, PUBLIC_DATA):
    os.makedirs(_d, exist_ok=True)

"""Decide whether a data refresh produced a real, committable change.

Used by the scheduled refresh workflow between the validation gate and the
commit step. It never edits generated numbers; it only answers two questions:

  1. Did the refresh touch anything outside the generated data directories?
     If so, something unexpected happened and the run must not commit.

  2. Is the change real? `data_manifest.json` carries a wall-clock
     `generated_at` stamp, so it differs on *every* run even when no new
     observation was published. A run whose only difference is that stamp is
     not a data change: the manifests are restored and no commit is made.

Prints a human-readable summary, and (when $GITHUB_OUTPUT is set) writes:

    changed=true|false
    rates_as_of=YYYY-MM-DD
    cpi_as_of=YYYY-MM
    commit_message=<one-line message>

Exits non-zero only on an out-of-scope mutation.

    python research/scripts/refresh_changeset.py
"""
import json
import os
import subprocess
import sys

from pipeline_paths import DATA_PROCESSED, ROOT

# The scheduled refresh regenerates these directories and nothing else.
ALLOWED_PREFIXES = ("data/raw/", "data/processed/", "public/data/")

# Files whose only per-run difference can legitimately be a timestamp.
MANIFESTS = ("data/processed/data_manifest.json", "public/data/data_manifest.json")

# Manifest keys that change on every run regardless of the data.
VOLATILE_MANIFEST_KEYS = ("generated_at",)


def git(*args):
    return subprocess.run(["git", "-C", ROOT, *args],
                          capture_output=True, text=True, check=True).stdout


def changed_paths():
    """Every path git reports as added / modified / deleted, tracked or not."""
    out = git("status", "--porcelain", "--untracked-files=all")
    paths = []
    for line in out.splitlines():
        if not line.strip():
            continue
        path = line[3:].strip()
        if " -> " in path:  # rename
            path = path.split(" -> ", 1)[1]
        paths.append(path.strip('"'))
    return sorted(set(paths))


def manifest_differs_beyond_timestamp(path):
    """True if the committed and working-tree manifests differ in real content."""
    try:
        committed = json.loads(git("show", f"HEAD:{path}"))
    except subprocess.CalledProcessError:
        return True  # new file — a real change
    with open(os.path.join(ROOT, path)) as f:
        current = json.load(f)
    for key in VOLATILE_MANIFEST_KEYS:
        committed.pop(key, None)
        current.pop(key, None)
    return committed != current


def main():
    paths = changed_paths()
    out_of_scope = [p for p in paths if not p.startswith(ALLOWED_PREFIXES)]
    if out_of_scope:
        print("refusing to commit: the refresh changed paths outside the generated "
              "data directories:")
        for p in out_of_scope:
            print(f"  {p}")
        sys.exit(1)

    substantive = [p for p in paths if p not in MANIFESTS]
    if not substantive:
        # Only the manifests moved. Real change, or just the timestamp?
        substantive = [p for p in paths if manifest_differs_beyond_timestamp(p)]

    if substantive:
        print(f"{len(paths)} generated file(s) changed, {len(substantive)} substantively:")
        for p in paths:
            print(f"  {'*' if p in substantive else ' '} {p}")
    else:
        if paths:
            print("no new upstream observations: the only difference is the manifest "
                  "generated_at stamp; restoring it and skipping the commit.")
            git("checkout", "--", *paths)
        else:
            print("no new upstream observations: working tree is clean.")

    snap = json.load(open(os.path.join(DATA_PROCESSED, "market_snapshot.json")))
    rates_as_of = snap["as_of_date"]
    cpi_as_of = snap["inflation"]["latest_cpi_date"][:7]
    message = f"data: refresh Treasury and inflation analytics through {rates_as_of}"

    print(f"\nrates through {rates_as_of}, CPI through {cpi_as_of}")
    print(f"changed={'true' if substantive else 'false'}")

    gh_out = os.environ.get("GITHUB_OUTPUT")
    if gh_out:
        with open(gh_out, "a") as f:
            f.write(f"changed={'true' if substantive else 'false'}\n")
            f.write(f"rates_as_of={rates_as_of}\n")
            f.write(f"cpi_as_of={cpi_as_of}\n")
            f.write(f"commit_message={message}\n")


if __name__ == "__main__":
    main()

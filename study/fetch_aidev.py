"""Download the AIDev v5 tables this study uses, pinned to one Hugging Face revision.

Usage: python3 study/fetch_aidev.py [table ...]
Files land in data/raw/ (gitignored) and their sha256 is written to data/raw/SHA256SUMS.
"""

import hashlib
import json
import os
import sys
import urllib.request

REPO = "hao-li/AIDev"
REVISION = "b8dc67df93e7c11f6f20c84129db7232eb1ec253"
DEFAULT_TABLES = [
    "repository",
    "pull_request",
    "pr_reviews",
    "pr_timeline",
    "pr_commits",
    "all_repository",
]
RAW = os.path.join(os.path.dirname(__file__), "..", "data", "raw")


def fetch(name: str) -> str:
    url = f"https://huggingface.co/datasets/{REPO}/resolve/{REVISION}/{name}"
    dest = os.path.join(RAW, name)
    part = dest + ".part"
    have = os.path.getsize(part) if os.path.exists(part) else 0
    if os.path.exists(dest):
        return dest
    req = urllib.request.Request(url, headers={"User-Agent": "agentready-study"})
    if have:
        req.add_header("Range", f"bytes={have}-")
    with urllib.request.urlopen(req, timeout=120) as resp, open(part, "ab") as out:
        while chunk := resp.read(1 << 20):
            out.write(chunk)
    os.replace(part, dest)
    return dest


def sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(1 << 20):
            h.update(chunk)
    return h.hexdigest()


def main() -> None:
    os.makedirs(RAW, exist_ok=True)
    names = [f"{t}.parquet" for t in (sys.argv[1:] or DEFAULT_TABLES)] + ["README.md"]
    sums = {}
    sums_path = os.path.join(RAW, "SHA256SUMS")
    if os.path.exists(sums_path):
        for line in open(sums_path):
            digest, name = line.split()
            sums[name] = digest
    for name in names:
        path = fetch(name)
        sums[name] = sha256(path)
        print(json.dumps({"file": name, "bytes": os.path.getsize(path), "sha256": sums[name]}), flush=True)
    with open(sums_path, "w") as f:
        for name in sorted(sums):
            f.write(f"{sums[name]}  {name}\n")


if __name__ == "__main__":
    main()

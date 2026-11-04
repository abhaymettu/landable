"""The 1,000 most-starred GitHub repositories today and their default-branch HEAD, for the leaderboard and N1.

Writes data/frozen/top-meta.jsonl (rank, repo, stars, archived, fork, language, HEAD oid, fetched_at).
Usage: python3 study/top_meta.py
"""

import json
import os
import subprocess
import time
from datetime import datetime, timezone

ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT = os.path.join(ROOT, "data", "frozen", "top-meta.jsonl")


def gh(args: list[str]) -> dict:
    out = subprocess.run(["gh", "api", *args], capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def main() -> None:
    repos = []
    for page in range(1, 11):
        body = gh(["-X", "GET", "search/repositories", "-f", "q=stars:>1000", "-f", "sort=stars", "-f", "order=desc", "-f", "per_page=100", "-f", f"page={page}"])
        repos += body["items"]
        time.sleep(2.5)
    fetched_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    rows = []
    for b in range(0, len(repos), 50):
        batch = repos[b : b + 50]
        parts = [
            f'r{i}: repository(owner: {json.dumps(r["owner"]["login"])}, name: {json.dumps(r["name"])}) {{ defaultBranchRef {{ target {{ oid }} }} }}'
            for i, r in enumerate(batch)
        ]
        data = gh(["graphql", "-f", "query=query { " + " ".join(parts) + " }"])["data"]
        for i, r in enumerate(batch):
            target = ((data.get(f"r{i}") or {}).get("defaultBranchRef") or {}).get("target") or {}
            rows.append({
                "rank": b + i + 1,
                "repo_id": r["id"],
                "full_name": r["full_name"],
                "name_now": r["full_name"],
                "stars": r["stargazers_count"],
                "archived": r["archived"],
                "fork": r["fork"],
                "language": r["language"],
                "ref_oid": target.get("oid"),
                "fetched_at": fetched_at,
            })
    with open(OUT, "w") as f:
        for row in rows:
            f.write(json.dumps(row) + "\n")
    print(f"top repos {len(rows)}, with HEAD {sum(1 for r in rows if r['ref_oid'])}, min stars {rows[-1]['stars']}")


if __name__ == "__main__":
    main()

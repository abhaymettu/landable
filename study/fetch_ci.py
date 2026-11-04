"""Fetch the status rollup of each sampled PR's head commit (secondary outcome S1).

For each PR in data/frozen/ci_sample.csv: the PR's last commit and its statusCheckRollup state (SUCCESS, FAILURE,
ERROR, PENDING, EXPECTED, or none). Resumable: PRs already in data/frozen/ci.jsonl are skipped.
Usage: python3 study/fetch_ci.py
"""

import csv
import json
import os

from fetch_meta import LOG, MIN_REMAINING, call

ROOT = os.path.join(os.path.dirname(__file__), "..")
SAMPLE = os.path.join(ROOT, "data", "frozen", "ci_sample.csv")
META = os.path.join(ROOT, "data", "frozen", "meta.jsonl")
OUT = os.path.join(ROOT, "data", "frozen", "ci.jsonl")
BATCH = 40


def main() -> None:
    names = {}
    for line in open(META):
        row = json.loads(line)
        names[row["repo_id"]] = row.get("name_now") or row["full_name"]
    done = {json.loads(line)["pr_id"] for line in open(OUT)} if os.path.exists(OUT) else set()
    todo = [r for r in csv.DictReader(open(SAMPLE)) if int(r["pr_id"]) not in done]
    for b in range(0, len(todo), BATCH):
        batch = todo[b : b + BATCH]
        parts = []
        for i, r in enumerate(batch):
            owner, name = names.get(int(r["repo_id"]), r["full_name"]).split("/", 1)
            parts.append(
                f"p{i}: repository(owner: {json.dumps(owner)}, name: {json.dumps(name)}) {{ pullRequest(number: {int(r['number'])}) {{"
                " headRefOid commits(last: 1) { nodes { commit { oid statusCheckRollup { state } } } } } }"
            )
        body = call("query {\n" + "\n".join(parts) + "\nrateLimit { cost remaining resetAt }\n}")
        data = body["data"]
        with open(OUT, "a") as out:
            for i, r in enumerate(batch):
                pr = (data.get(f"p{i}") or {}).get("pullRequest")
                nodes = ((pr or {}).get("commits") or {}).get("nodes") or []
                commit = (nodes[0] or {}).get("commit") if nodes else None
                rollup = (commit or {}).get("statusCheckRollup")
                out.write(json.dumps({
                    "pr_id": int(r["pr_id"]),
                    "repo_id": int(r["repo_id"]),
                    "head_oid": (commit or {}).get("oid"),
                    "state": (rollup or {}).get("state"),
                    "error": None if pr else "not_found",
                }) + "\n")
        rl = data["rateLimit"]
        with open(LOG, "a") as log:
            log.write(json.dumps({"kind": "ci", "prs": len(batch), "cost": rl["cost"], "remaining": rl["remaining"]}) + "\n")
        if rl["remaining"] < MIN_REMAINING:
            raise SystemExit(f"stopping at remaining {rl['remaining']}; rerun after {rl['resetAt']}")
    print(f"ci rows {len(done) + len(todo)}")


if __name__ == "__main__":
    main()

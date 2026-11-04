"""Fetch per-repo controls and the reference commit from the GitHub GraphQL API.

For each repo in data/frozen/repos.csv: the default-branch commit at or before ref_date (the tree the items are
read from), repo creation date, default-branch commits in the window, and all PRs created in the window that were
merged or closed unmerged (agent PRs are subtracted later from AIDev's own counts).

Resumable: rows already in data/frozen/meta.jsonl are skipped, so a kill and a restart lose nothing.
Usage: python3 study/fetch_meta.py [--limit N]
"""

import csv
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone

ROOT = os.path.join(os.path.dirname(__file__), "..")
REPOS = os.path.join(ROOT, "data", "frozen", "repos.csv")
OUT = os.path.join(ROOT, "data", "frozen", "meta.jsonl")
LOG = os.path.join(ROOT, "data", "frozen", "requests.log")
BATCH = 10
CUTOFF = datetime(2026, 3, 31, 23, 59, 59, tzinfo=timezone.utc)
HALF_WINDOW = timedelta(days=90)
MIN_REMAINING = 1500


def window(ref_date: str) -> tuple[str, str]:
    ref = datetime.strptime(ref_date, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    return (ref - HALF_WINDOW).strftime("%Y-%m-%d"), min(ref + HALF_WINDOW, CUTOFF).strftime("%Y-%m-%d")


def query_for(batch: list[dict]) -> str:
    parts = []
    for i, r in enumerate(batch):
        owner, name = r["full_name"].split("/", 1)
        start, end = window(r["ref_date"])
        base = f"repo:{r['full_name']} is:pr created:{start}..{end}"
        parts.append(
            f"""r{i}: repository(owner: {json.dumps(owner)}, name: {json.dumps(name)}) {{
              createdAt nameWithOwner isArchived
              defaultBranchRef {{ name target {{ ... on Commit {{
                at: history(first: 1, until: "{r['ref_date']}") {{ nodes {{ oid committedDate }} }}
                win: history(since: "{start}T00:00:00Z", until: "{end}T23:59:59Z") {{ totalCount }}
              }} }} }}
            }}
            m{i}: search(type: ISSUE, query: {json.dumps(base + ' is:merged')}, first: 0) {{ issueCount }}
            c{i}: search(type: ISSUE, query: {json.dumps(base + ' is:closed is:unmerged')}, first: 0) {{ issueCount }}"""
        )
    return "query {\n" + "\n".join(parts) + "\nrateLimit { cost remaining resetAt }\n}"


def call(q: str) -> dict:
    for attempt in range(6):
        out = subprocess.run(["gh", "api", "graphql", "-f", f"query={q}"], capture_output=True, text=True)
        body = json.loads(out.stdout) if out.stdout.strip().startswith("{") else {}
        if body.get("data") is not None:
            return body
        wait = 60 if "secondary rate limit" in (out.stdout + out.stderr).lower() else 5 * (attempt + 1)
        with open(LOG, "a") as log:
            log.write(json.dumps({"t": time.time(), "retry": attempt, "err": (out.stderr or out.stdout)[:300]}) + "\n")
        time.sleep(wait)
    raise RuntimeError("GraphQL call failed after retries")


def row_for(r: dict, i: int, data: dict) -> dict:
    repo = data.get(f"r{i}")
    rec = {"repo_id": int(r["repo_id"]), "full_name": r["full_name"], "ref_date": r["ref_date"]}
    if repo is None:
        return rec | {"error": "not_found"}
    target = (repo.get("defaultBranchRef") or {}).get("target") or {}
    at = (target.get("at") or {}).get("nodes") or []
    start, end = window(r["ref_date"])
    return rec | {
        "name_now": repo["nameWithOwner"],
        "created_at": repo["createdAt"],
        "archived": repo["isArchived"],
        "default_branch": (repo.get("defaultBranchRef") or {}).get("name"),
        "ref_oid": at[0]["oid"] if at else None,
        "ref_commit_date": at[0]["committedDate"] if at else None,
        "window_start": start,
        "window_end": end,
        "commits_in_window": (target.get("win") or {}).get("totalCount"),
        "prs_merged_in_window": (data.get(f"m{i}") or {}).get("issueCount"),
        "prs_closed_unmerged_in_window": (data.get(f"c{i}") or {}).get("issueCount"),
        "error": None if at else "no_commit_at_ref_date",
    }


def main() -> None:
    limit = int(sys.argv[sys.argv.index("--limit") + 1]) if "--limit" in sys.argv else None
    done = set()
    if os.path.exists(OUT):
        done = {json.loads(line)["repo_id"] for line in open(OUT)}
    todo = [r for r in csv.DictReader(open(REPOS)) if int(r["repo_id"]) not in done]
    todo.sort(key=lambda r: int(r["scan_rank"]))
    if limit:
        todo = todo[:limit]
    for b in range(0, len(todo), BATCH):
        batch = todo[b : b + BATCH]
        body = call(query_for(batch))
        rl = body["data"]["rateLimit"]
        with open(OUT, "a") as out:
            for i, r in enumerate(batch):
                out.write(json.dumps(row_for(r, i, body["data"])) + "\n")
        with open(LOG, "a") as log:
            log.write(json.dumps({"t": time.time(), "kind": "meta", "repos": len(batch), "cost": rl["cost"], "remaining": rl["remaining"]}) + "\n")
        if rl["remaining"] < MIN_REMAINING:
            reset = datetime.strptime(rl["resetAt"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
            time.sleep(max(0, (reset - datetime.now(timezone.utc)).total_seconds()) + 5)
    print(f"done; meta rows {len(done) + len(todo)}")


if __name__ == "__main__":
    main()

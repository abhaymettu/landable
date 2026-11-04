"""Freeze the analytic sample before any outcome is joined to any item.

Reads only PR dates, authors and deciders (never merge state) and writes:
- data/frozen/repos.csv: one row per repo, its reference date, window, split and scan order
- data/frozen/ci_sample.csv: the stratified 5,000-PR sample for the check-run outcome
- data/frozen/SHA256SUMS
"""

import hashlib
import os

import pandas as pd

from aidev import connect

FROZEN = os.path.join(os.path.dirname(__file__), "..", "data", "frozen")
CUTOFF = "2026-03-31T23:59:59Z"
CI_SAMPLE_SIZE = 5000


def h(salt: str, key) -> str:
    return hashlib.sha256(f"{salt}/{key}".encode()).hexdigest()


def main() -> None:
    os.makedirs(FROZEN, exist_ok=True)
    c = connect()
    c.create_function("hkey", h, [str, str], str)
    repos = c.execute(
        f"""
        WITH ind AS (SELECT * FROM independent WHERE created_at <= '{CUTOFF}')
        SELECT r.id AS repo_id, r.full_name, r.language, r.stars, r.forks,
               count(*) AS n_independent,
               strftime(to_timestamp(median(epoch(ind.created_at::TIMESTAMP))), '%Y-%m-%dT%H:%M:%SZ') AS ref_date
        FROM ind JOIN repo r ON r.id = ind.repo_id
        WHERE NOT r.is_forked
        GROUP BY ALL
        """
    ).fetchdf()
    repos["split"] = [
        "holdout" if int(h("agentready-split-v1", rid)[:8], 16) % 10 < 3 else "train" for rid in repos.repo_id
    ]
    repos["scan_key"] = [h("agentready-scan-v1", rid) for rid in repos.repo_id]
    repos = repos.sort_values("scan_key").reset_index(drop=True)
    repos["scan_rank"] = repos.index + 1
    repos = repos.drop(columns="scan_key")
    repos.to_csv(os.path.join(FROZEN, "repos.csv"), index=False)

    c.register("frozen_repos", repos)
    ind = c.execute(
        f"""
        SELECT i.pr_id, i.repo_id, i.number, i.agent, fr.full_name, fr.split
        FROM independent i JOIN frozen_repos fr ON fr.repo_id = i.repo_id
        WHERE i.created_at <= '{CUTOFF}'
        """
    ).fetchdf()
    ind["k"] = [h("agentready-ci-v1", p) for p in ind.pr_id]
    ind = ind.sort_values("k")
    counts = ind.agent.value_counts()
    small = {a: int(n) for a, n in counts.items() if n * len(counts) < CI_SAMPLE_SIZE}
    big = [a for a in counts.index if a not in small]
    remaining = CI_SAMPLE_SIZE - sum(small.values())
    quota = dict(small)
    for i, a in enumerate(sorted(big)):
        quota[a] = remaining // len(big) + (1 if i < remaining % len(big) else 0)
    ci = pd.concat([ind[ind.agent == a].head(n) for a, n in quota.items()])
    ci = ci.drop(columns="k").sort_values("pr_id")
    ci.to_csv(os.path.join(FROZEN, "ci_sample.csv"), index=False)

    with open(os.path.join(FROZEN, "SHA256SUMS"), "w") as f:
        for name in ["repos.csv", "ci_sample.csv"]:
            digest = hashlib.sha256(open(os.path.join(FROZEN, name), "rb").read()).hexdigest()
            f.write(f"{digest}  {name}\n")
    print(f"repos {len(repos)} (train {sum(repos.split == 'train')}, holdout {sum(repos.split == 'holdout')})")
    print(f"independent PRs in sample {len(ind)}; ci_sample {len(ci)} by agent {ci.agent.value_counts().to_dict()}")
    print(open(os.path.join(FROZEN, "SHA256SUMS")).read(), end="")


if __name__ == "__main__":
    main()

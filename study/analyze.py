"""Run the preregistered analysis from the frozen files and write analysis/report.md.

Usage: python3 study/analyze.py            (the real run; only after the items-frozen tag)
       python3 study/analyze.py --permuted (outcomes shuffled; for debugging, writes analysis/permuted-report.md)
Every number in the report is printed by this command; the report is its stdout.
"""

import json
import math
import os
import sys
from hashlib import sha256

import numpy as np
import pandas as pd
import statsmodels.api as sm
from sklearn.metrics import roc_auc_score

from aidev import connect

ROOT = os.path.join(os.path.dirname(__file__), "..")
FROZEN = os.path.join(ROOT, "data", "frozen")
SEED = 20261104
CAP = 50
BOOT = 2000
PERMUTED = "--permuted" in sys.argv
SYNTHETIC = "--synthetic" in sys.argv
AFC_AGENT = {"Claude_Code": "claude-code", "Cursor": "cursor", "Devin": "devin", "OpenAI_Codex": "gpt-5-codex"}
COUNT_TRANSFORM = {"A16.file_count": lambda v: math.log10(max(v, 1)), "A17.package_count": math.log1p}


def h(salt, key):
    return int(sha256(f"{salt}/{key}".encode()).hexdigest()[:15], 16)


def jsonl(path):
    return [json.loads(line) for line in open(path)] if os.path.exists(path) else []


def load():
    repos = pd.read_csv(os.path.join(FROZEN, "repos.csv"))
    meta = pd.DataFrame(jsonl(os.path.join(FROZEN, "meta.jsonl")))
    scan = jsonl(os.path.join(ROOT, "data", "scan.jsonl"))
    items = pd.DataFrame([{"repo_id": r["repo_id"], **r["items"]} for r in scan])
    market = pd.DataFrame([
        {"repo_id": r["repo_id"], "kodus_share": r["market"]["kodusShare"], "kodus_level": r["market"]["kodusLevel"],
         "afc_overall": r["market"]["afcOverall"], **{f"afc.{k}": v for k, v in r["market"]["afcByAgent"].items()}}
        for r in scan
    ])
    c = connect()
    ind = c.execute("SELECT pr_id, repo_id, agent, created_at, merged_at IS NOT NULL AS merged FROM independent WHERE created_at <= '2026-03-31T23:59:59Z'").fetchdf()
    c.register("rw", meta[["repo_id", "window_start", "window_end"]].dropna())
    agent_win = c.execute(
        """SELECT p.repo_id, sum((p.merged_at IS NOT NULL)::INT) AS agent_merged, sum((p.state = 'closed')::INT) AS agent_decided
           FROM pr p JOIN rw ON rw.repo_id = p.repo_id
           WHERE p.created_at >= rw.window_start AND p.created_at <= rw.window_end || 'T23:59:59Z' GROUP BY 1"""
    ).fetchdf()
    return repos, meta, items, market, ind, agent_win, c


def controls(repos, meta, agent_win):
    df = repos.merge(meta, on="repo_id", how="inner", suffixes=("", "_m")).merge(agent_win, on="repo_id", how="left")
    df = df[df["error"].isna()].copy()
    df[["agent_merged", "agent_decided"]] = df[["agent_merged", "agent_decided"]].fillna(0)
    merged = (df["prs_merged_in_window"] - df["agent_merged"]).clip(lower=0)
    decided = (df["prs_merged_in_window"] + df["prs_closed_unmerged_in_window"] - df["agent_decided"]).clip(lower=0)
    merged = np.minimum(merged, decided)
    rate = (merged + 1) / (decided + 2)
    df["nonagent_logit"] = np.log(rate / (1 - rate))
    df["nonagent_rate"] = rate
    df["log_nonagent_decided"] = np.log1p(decided)
    df["log_stars"] = np.log(df["stars"])
    ref = pd.to_datetime(df["ref_date"], utc=True)
    df["log_age"] = np.log(((ref - pd.to_datetime(df["created_at"], utc=True)).dt.days / 365.25).clip(lower=0.1))
    df["log_commits"] = np.log1p(df["commits_in_window"].fillna(0))
    top = df["language"].fillna("none").value_counts().index[:10]
    df["lang"] = np.where(df["language"].isin(top), df["language"], np.where(df["language"].isna(), "none", "other"))
    return df


CONTROL_COLS = ["log_stars", "log_age", "log_commits", "nonagent_logit", "log_nonagent_decided"]


def design(df, extra):
    X = pd.get_dummies(df[["agent", "lang"]].astype(str), drop_first=True, dtype=float)
    X = pd.concat([df[extra + CONTROL_COLS].astype(float), X], axis=1)
    return sm.add_constant(X, has_constant="add")


def fit(df, extra, y="merged"):
    X = design(df, extra)
    model = sm.GLM(df[y].astype(float), X, family=sm.families.Binomial())
    return model.fit(cov_type="cluster", cov_kwds={"groups": df["repo_id"].to_numpy()}), list(X.columns)


def predict(res, cols, df, extra):
    X = design(df, extra).reindex(columns=cols, fill_value=0.0)
    return res.predict(X)


def odds(res, term):
    b, se = res.params[term], res.bse[term]
    return math.exp(b), math.exp(b - 1.96 * se), math.exp(b + 1.96 * se), res.pvalues[term]


def bh(pvals):
    p = np.asarray(pvals)
    order = np.argsort(p)
    ranked = p[order] * len(p) / (np.arange(len(p)) + 1)
    adj = np.minimum.accumulate(ranked[::-1])[::-1]
    out = np.empty_like(adj)
    out[order] = np.minimum(adj, 1)
    return out


def boot_auc_diff(df, pa, pb, rng):
    """AUC(pa) - AUC(pb) on df with a 95% CI from resampling repositories."""
    y = df["merged"].to_numpy().astype(int)
    groups = df.groupby("repo_id").indices
    keys = list(groups)
    point = roc_auc_score(y, pa) - roc_auc_score(y, pb)
    diffs = []
    pa, pb = np.asarray(pa), np.asarray(pb)
    for _ in range(BOOT):
        idx = np.concatenate([groups[k] for k in rng.choice(keys, size=len(keys), replace=True)])
        if y[idx].min() == y[idx].max():
            continue
        diffs.append(roc_auc_score(y[idx], pa[idx]) - roc_auc_score(y[idx], pb[idx]))
    lo, hi = np.percentile(diffs, [2.5, 97.5])
    return point, lo, hi


def fmt_or(t):
    return f"{t[0]:.2f} [{t[1]:.2f}, {t[2]:.2f}]"


def main():
    rng = np.random.default_rng(SEED)
    repos, meta, items, market, ind, agent_win, con = load()
    ctl = controls(repos, meta, agent_win)
    item_ids = [c for c in items.columns if c != "repo_id"]
    kinds = {i: ("count" if i in ("A11.test_ratio", "A16.file_count", "A17.package_count", "A18.language_count") else "graded" if i.startswith("afc.") else "binary") for i in item_ids}

    pr = ind.merge(ctl, on="repo_id", how="inner").merge(items, on="repo_id", how="inner").merge(market, on="repo_id", how="inner")
    pr["k"] = [h("agentready-cap-v1", p) for p in pr["pr_id"]]
    pr = pr.sort_values(["repo_id", "k"]).groupby("repo_id").head(CAP).reset_index(drop=True)
    pr["merged"] = pr["merged"].astype(int)
    if PERMUTED:
        pr["merged"] = rng.permutation(pr["merged"].to_numpy())
    for i, f in COUNT_TRANSFORM.items():
        pr[i] = pr[i].map(f)
    train, hold = pr[pr["split"] == "train"].copy(), pr[pr["split"] == "holdout"].copy()
    repo_train = train.drop_duplicates("repo_id")

    coded = {}
    for i in item_ids:
        col = f"x_{i}"
        if kinds[i] == "binary":
            pr[col] = pr[i].astype(float)
        else:
            mu, sd = repo_train[i].mean(), repo_train[i].std()
            pr[col] = (pr[i] - mu) / sd if sd > 0 else 0.0
        coded[i] = col
    if SYNTHETIC:
        lin = 0.9 + math.log(2.0) * pr[coded["A01.test_command"]] - 0.3 * pr[coded["A16.file_count"]]
        pr["merged"] = (rng.random(len(pr)) < 1 / (1 + np.exp(-lin))).astype(int)
    pr = pr.copy()
    train, hold = pr[pr["split"] == "train"].copy(), pr[pr["split"] == "holdout"].copy()

    out = []
    p = out.append
    p("# agentready validation report" + (" (PERMUTED OUTCOMES: debugging only, not a result)" if PERMUTED else " (SYNTHETIC OUTCOMES, planted A01 odds ratio 2.0 and A16 -0.3 per SD: recovery check, not a result)" if SYNTHETIC else ""))
    p("")
    p("Generated by `python3 study/analyze.py` from the frozen files; the plan is PREREGISTRATION.md. The verb is "
      "\"predicts\": merge decisions reflect maintainers as much as repositories.")
    p("")
    p("## Sample")
    p("")
    p(f"- Repositories in the frozen sample: {len(repos)}; with controls and a scan: {pr['repo_id'].nunique()} "
      f"(train {train['repo_id'].nunique()}, holdout {hold['repo_id'].nunique()}).")
    p(f"- Independently decided agent PRs after the cap of {CAP} per repository: {len(pr)} (train {len(train)}, holdout {len(hold)}).")
    p(f"- Merge rate: train {train['merged'].mean():.3f}, holdout {hold['merged'].mean():.3f}.")
    p("")

    rows = []
    for i in item_ids:
        share = (repo_train[i] != 0).mean()
        if kinds[i] in ("binary", "graded") and not 0.02 <= share <= 0.98:
            rows.append({"item": i, "share": share, "status": "not tested (prevalence)"})
            continue
        if kinds[i] == "count" and repo_train[i].std() == 0:
            rows.append({"item": i, "share": share, "status": "not tested (no variance)"})
            continue
        try:
            res, _ = fit(train, [coded[i]])
            rows.append({"item": i, "share": share, "status": "tested", "or": odds(res, coded[i]), "b": res.params[coded[i]]})
        except Exception as err:  # noqa: BLE001 - a failed fit is reported, not hidden
            rows.append({"item": i, "share": share, "status": f"model failed ({type(err).__name__})"})
    tested = [r for r in rows if r["status"] == "tested"]
    for r, q in zip(tested, bh([r["or"][3] for r in tested])):
        r["q"] = q
        r["retained"] = q < 0.05

    retained = [r["item"] for r in tested if r["retained"]]
    weights = {}
    if retained:
        for attempt in range(2):
            res, _ = fit(train, [coded[i] for i in retained])
            flips = [i for i in retained if np.sign(res.params[coded[i]]) != np.sign(next(r["b"] for r in tested if r["item"] == i))]
            if not flips or attempt == 1:
                weights = {i: res.params[coded[i]] for i in retained if i not in flips}
                break
            retained = [i for i in retained if i not in flips]
        for r in tested:
            r["weight"] = weights.get(r["item"])
    retained = list(weights)

    p("## Items (train)")
    p("")
    p("Per-item adjusted odds ratio with 95% CI (binary items: present vs absent; others: per train SD), "
      "Benjamini-Hochberg q, and the weight in the score when retained.")
    p("")
    p("| Item | Share of train repos | Odds ratio [95% CI] | q | Status | Weight |")
    p("|---|---|---|---|---|---|")
    for r in rows:
        if r["status"] != "tested":
            p(f"| {r['item']} | {r['share']:.3f} | | | {r['status']} | |")
        else:
            status = "retained" if r["item"] in weights else ("dropped (sign flip)" if r["retained"] else "dropped")
            w = f"{weights[r['item']]:.3f}" if r["item"] in weights else ""
            p(f"| {r['item']} | {r['share']:.3f} | {fmt_or(r['or'])} | {r['q']:.3g} | {status} | {w} |")
    p("")
    p(f"Tested {len(tested)} items; retained {len(retained)}.")
    p("")

    pr["score"] = sum(pr[coded[i]] * w for i, w in weights.items()) if weights else 0.0
    train, hold = pr[pr["split"] == "train"].copy(), pr[pr["split"] == "holdout"].copy()

    p("## Held-out tests")
    p("")
    if retained:
        rb, cb = fit(train, [])
        rs, cs = fit(train, ["score"])
        pb, ps = predict(rb, cb, hold, []), predict(rs, cs, hold, ["score"])
        d, lo, hi = boot_auc_diff(hold, ps, pb, rng)
        p(f"- H1: holdout AUC baseline {roc_auc_score(hold['merged'], pb):.4f}, baseline plus score {roc_auc_score(hold['merged'], ps):.4f}; "
          f"difference {d:.4f} [95% CI {lo:.4f}, {hi:.4f}]; {'holds' if lo > 0 else 'does not hold'}.")
        d2, lo2, hi2 = boot_auc_diff(hold, hold["score"].to_numpy(), hold["nonagent_logit"].to_numpy(), rng)
        p(f"- H2: holdout AUC score alone {roc_auc_score(hold['merged'], hold['score']):.4f}, non-agent merge rate alone "
          f"{roc_auc_score(hold['merged'], hold['nonagent_logit']):.4f}; difference {d2:.4f} [95% CI {lo2:.4f}, {hi2:.4f}].")
        rep = 0
        p("- H3: retained items re-estimated on holdout:")
        for i in retained:
            rh, _ = fit(hold, [coded[i]])
            t = odds(rh, coded[i])
            ok = np.sign(rh.params[coded[i]]) == np.sign(weights[i]) and t[3] < 0.05
            rep += int(ok)
            p(f"  - {i}: odds ratio {fmt_or(t)}, p {t[3]:.3g}, {'replicated' if ok else 'not replicated'}")
        p(f"  - replicated {rep} of {len(retained)}.")
    else:
        p("- No item was retained, so the score does not exist and H1 to H3 are not run (preregistered null branch).")
    p("")

    p("## The market's own scores (holdout)")
    p("")
    p("| Score | Odds ratio per SD [95% CI] | AUC gain over baseline [95% CI] | PRs |")
    p("|---|---|---|---|")
    pr["afc_agent"] = [pr.at[ix, f"afc.{AFC_AGENT[a]}"] if a in AFC_AGENT else np.nan for ix, a in zip(pr.index, pr["agent"])]
    for m in ["kodus_share", "kodus_level", "afc_overall", "afc_agent"]:
        sub = pr.dropna(subset=[m]).copy()
        rt = sub[sub["split"] == "train"].drop_duplicates("repo_id")
        sub["z"] = (sub[m] - rt[m].mean()) / rt[m].std()
        tr, ho = sub[sub["split"] == "train"], sub[sub["split"] == "holdout"]
        rh, _ = fit(ho, ["z"])
        rb, cb = fit(tr, [])
        rz, cz = fit(tr, ["z"])
        d, lo, hi = boot_auc_diff(ho, predict(rz, cz, ho, ["z"]), predict(rb, cb, ho, []), rng)
        p(f"| {m} | {fmt_or(odds(rh, 'z'))} | {d:.4f} [{lo:.4f}, {hi:.4f}] | {len(ho)} |")
    p("")

    top = jsonl(os.path.join(ROOT, "data", "top-scan.jsonl"))
    p("## Headline numbers")
    p("")
    if top:
        n1 = sum(r["items"]["A01.test_command"] for r in top)
        p(f"- N1: {n1} of the {len(top)} most-starred repositories scanned ({n1 / len(top):.1%}) have a discoverable one-command test run.")
    if retained:
        best = max(retained, key=lambda i: abs(weights[i]))
        rh, _ = fit(hold, [coded[best]])
        t = odds(rh, coded[best])
        lo_x, hi_x = (0.0, 1.0) if kinds[best] == "binary" else (0.0, 1.0)
        a, b = hold.copy(), hold.copy()
        a[coded[best]], b[coded[best]] = lo_x, hi_x
        cols = list(design(hold, [coded[best]]).columns)
        diff = (predict(rh, cols, b, [coded[best]]) - predict(rh, cols, a, [coded[best]])).mean()
        p(f"- N2: strongest surviving item {best}: holdout odds ratio {fmt_or(t)}; predicted merge probability "
          f"{'with vs without it' if kinds[best] == 'binary' else 'at +1 SD vs the mean'} differs by {diff * 100:.1f} points.")
    p("")
    text = "\n".join(out) + "\n"
    os.makedirs(os.path.join(ROOT, "analysis"), exist_ok=True)
    with open(os.path.join(ROOT, "analysis", "permuted-report.md" if PERMUTED else "synthetic-report.md" if SYNTHETIC else "report.md"), "w") as f:
        f.write(text)
    sys.stdout.write(text)
    del con


if __name__ == "__main__":
    main()

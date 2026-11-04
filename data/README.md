# Data

## Raw (not committed; `python3 study/fetch_aidev.py` restores it)

AIDev v5, `hao-li/AIDev` revision `b8dc67df93e7c11f6f20c84129db7232eb1ec253`, CC BY 4.0. Content quoted from
repositories keeps each repository's own license. Hashes: `raw/SHA256SUMS`.

Fields used, by table:

| Table | Fields | Used for |
|---|---|---|
| `repository` | `id`, `full_name`, `language`, `stars`, `forks`, `is_forked` | sample, language and stars controls |
| `pull_request` | `id`, `number`, `repo_id`, `agent`, `user`, `state`, `created_at`, `closed_at`, `merged_at` | sample, reference date, outcome, agent control, agent PR counts in the window |
| `pr_timeline` | `pr_id`, `event` (`merged`, `closed`, `assigned`, `copilot_work_started`), `actor`, `assignee`, `created_at` | requester and decider |
| `pr_reviews` | `pr_id`, `user`, `user_type`, `submitted_at` | S2 review outcome |

`pr_commits` and `all_repository` are fetched for later robustness work and not used in version 1.

## Frozen (committed)

| File | Written by | Contents |
|---|---|---|
| `frozen/repos.csv` | `study/sample.py` | `repo_id`, `full_name`, `language`, `stars`, `forks`, `n_independent`, `ref_date`, `split`, `scan_rank` |
| `frozen/ci_sample.csv` | `study/sample.py` | `pr_id`, `repo_id`, `number`, `agent`, `full_name`, `split` |
| `frozen/meta.jsonl` | `study/fetch_meta.py` | per repo: `name_now`, `created_at`, `archived`, `default_branch`, `ref_oid`, `ref_commit_date`, `window_start`, `window_end`, `commits_in_window`, `prs_merged_in_window`, `prs_closed_unmerged_in_window`, `error` |
| `frozen/requests.log` | `study/fetch_meta.py` | GraphQL cost and remaining budget per call |
| `frozen/SHA256SUMS` | `study/sample.py` | hashes of the two sample files |

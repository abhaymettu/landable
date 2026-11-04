# Preregistration: which agent-readiness items predict how agent pull requests fare

Version 1, written 2026-11-04 before any item value was joined to any outcome. Any later change is listed in
"Deviations" at the end with its date and reason, and the report prints that list.

## Question

Agent-readiness checklists (Factory's report, Kodus's open CLI, Agent Friendly Code's ranking) grade a repository on
files such as an AGENTS.md, CI, tests and lint config. None of them has tested whether its items predict anything. This
study asks, for each item: in public repositories that received pull requests from coding agents, does the item predict
that a person other than the requester accepted the agent's pull request, after controls for the repository's size,
age, language, activity and how often it merges pull requests in general? Then: does a score built only from the items
that predict beat the repository's own non-agent merge rate on repositories held out from fitting?

The verb is "predicts". Merge decisions reflect maintainers as much as repositories; nothing here is a causal claim.

## Data

AIDev v5 (hao-li/AIDev on Hugging Face, revision `b8dc67df93e7c11f6f20c84129db7232eb1ec253`, CC BY 4.0), the
AIDev-pop tables: `repository` (25,402 repos over 100 stars), `pull_request` (361,296 agent PRs from Claude Code,
Copilot, Codex, Cursor, Devin and Jules, created up to 2026-03-31), `pr_timeline`, `pr_reviews`. File hashes are in
`data/raw/SHA256SUMS` (written by `study/fetch_aidev.py`). Field list: `data/README.md`.

Repository files are read from GitHub with git at one commit per repository (below). Controls come from the GitHub
GraphQL API (`study/fetch_meta.py`). The CI outcome comes from the GraphQL status rollup of each sampled PR's head
commit.

## Definitions

- **Requester.** The PR author when the author is a person. When the author is an agent account (Copilot,
  `devin-ai-integration[bot]`, `google-labs-jules[bot]`, `claude[bot]`, `cursor[bot]`), the first actor of a
  `copilot_work_started` event, else the person the agent account assigned. Unknown otherwise.
- **Decider.** The actor of the `merged` event for a merged PR; the actor of the last `closed` event for a PR closed
  without merge.
- **Independent decision.** A closed PR whose decider is known and is neither the author nor the requester.
- **Primary outcome.** For each independently decided agent PR, `merged` (1) or closed without merge (0).
- **Why not every merge.** Before writing this, the lane found that the merge actor is the PR's own author for 77.5%
  of Claude Code merges and 92.3% of Codex merges in AIDev-pop. A self-merge records that the person who asked for the
  change wanted it, not that the repository was ready for an agent. Counting self-merges as failures would score
  solo-maintainer repositories as unready; dropping only self-merges would bias merge rates down. Restricting to
  independent decisions treats both outcomes the same way.

## Sample (frozen)

`study/sample.py` reads only PR dates, authors, requesters and deciders, never merge state, and writes
`data/frozen/repos.csv` and `data/frozen/ci_sample.csv` (hashes in `data/frozen/SHA256SUMS`).

- Repositories: AIDev-pop, not forks, with at least one independently decided agent PR created by 2026-03-31.
  8,127 repositories, 51,959 PRs.
- **Reference date** per repository: the median creation time of its independently decided agent PRs. Items are read
  from the default branch's last commit at or before that date (`history(first: 1, until: ref_date)`), never from
  today's tree.
- **Window**: reference date minus 90 days to reference date plus 90 days, cut at 2026-03-31.
- **Split**: holdout when `int(sha256("agentready-split-v1/" + repo_id)[:8], 16) % 10 < 3`, else train. 5,718 train
  and 2,409 holdout repositories. Item selection and weights use train only.
- **Per-repo cap**: at most 50 PRs per repository enter any model, the first 50 by `sha256("agentready-cap-v1/" +
  pr_id)`, so a few very active repositories do not decide the result.
- **CI sample**: 5,000 independently decided PRs, all of Cursor's (968) and Devin's (496), and the rest split evenly
  across Claude Code, Copilot and Codex, each agent's PRs taken in `sha256("agentready-ci-v1/" + pr_id)` order.
- **Exclusions**, counted and reported, never replaced: repository not found or private now, no commit at or before the
  reference date, git fetch failure.
- **Scan order**: `sha256("agentready-scan-v1/" + repo_id)`. If the scan cannot finish, the scanned prefix is a random
  subset, and the report says how many repositories it covers.

## Controls

All read for the window and fixed before outcomes are joined.

- Agent (six-level fixed effect).
- Language: AIDev's `language`, the ten most common in the sample as levels, the rest "other", missing as "none".
- log(stars) from AIDev; log(age in years at the reference date) from GraphQL `createdAt`.
- log(1 + default-branch commits in the window).
- **Non-agent merge rate** in the window: (all PRs created in the window and merged, minus AIDev agent PRs created in
  the window and merged) over (all PRs created in the window and closed, minus AIDev agent PRs created in the window
  and closed), smoothed as (m + 1) / (d + 2) and entered as its logit, with log(1 + d). PRs from dependency bots stay
  in; the report calls it the non-agent merge rate, not the human merge rate.

## Items

Each item is a deterministic function of the file list at the reference commit and the text of a few files there.
`src/items/` implements them; the commit that freezes them is tagged `items-frozen` before the scan joins outcomes.
Values are 0 or 1 unless marked (graded values in [0, 1], or counts).

### Family A: agentready's own items (18)

| id | Item | True when |
|---|---|---|
| A01 test_command | One-command test run is discoverable | root `package.json` `scripts.test` that is not npm's placeholder; a Makefile, justfile or Taskfile `test*` target; pytest, tox or nox config (`pytest.ini`, `tox.ini`, `noxfile.py`, `conftest.py`, `[tool.pytest` in pyproject, `[tool:pytest]` in setup.cfg); `Cargo.toml`, `go.mod`, `pom.xml`, `build.gradle(.kts)`, `mix.exs`, `Package.swift` at root; `composer.json` or `deno.json` test script; `scripts/test*`; or a CI workflow step that runs tests (Kodus's `ci-runs-tests` pattern) |
| A02 ci_on_pr | CI runs on pull requests | a `.github/workflows/*.y(a)ml` with a `pull_request` or `pull_request_target` trigger; or CircleCI, Travis or Azure Pipelines config, which build PRs by default |
| A03 agent_instructions | Agent instructions file | `AGENTS.md`, `AGENT.md`, `CLAUDE.md`, `GEMINI.md`, `.cursorrules`, `.windsurfrules`, `.clinerules`, any file under `.cursor/rules/`, `.github/copilot-instructions.md`, or `.github/instructions/*.instructions.md` |
| A04 contributing | Contributor guide | `CONTRIBUTING` (any extension, any case) at root, `.github/` or `docs/` |
| A05 pr_template | PR template | `PULL_REQUEST_TEMPLATE` (any case, `.md` or none) at root, `.github/` or `docs/`, or a `.github/PULL_REQUEST_TEMPLATE/` directory |
| A06 pinned_toolchain | Lockfile and toolchain version pin | a lockfile (Kodus's `lock-file` list plus `uv.lock`, `pdm.lock`, `bun.lock`, `deno.lock`, `mix.lock`, `flake.lock`) and a version pin (`.nvmrc`, `.node-version`, `.tool-versions`, `.python-version`, `mise.toml`, `.mise.toml`, `rust-toolchain(.toml)`, `.ruby-version`, `.java-version`, `.sdkmanrc`, `global.json`, `go.mod`, `package.json` `engines.node` or `packageManager`, pyproject `requires-python`, `Cargo.toml` `rust-version`) |
| A07 repro_env | Reproducible environment | any file under `.devcontainer/`, `.devcontainer.json`, a root `Dockerfile` or `Containerfile`, a root compose file, `flake.nix`, `shell.nix` or `devbox.json` |
| A08 lint_format | Lint or format config | eslint, biome, oxlint, prettier, ruff, black, flake8, pylint, golangci, clippy, rustfmt, rubocop, swiftlint, detekt, checkstyle, phpstan, psalm, php-cs-fixer, clang-format or clang-tidy config at root (files, pyproject or setup.cfg sections, or `eslintConfig`/`prettier` keys in package.json) |
| A09 type_check | Type checking config | root `tsconfig.json` with `compilerOptions.strict: true` (JSON with comments parsed properly; `extends` not followed), mypy config (`mypy.ini`, `.mypy.ini`, `[mypy]` in setup.cfg, `[tool.mypy]` in pyproject) or pyright config (`pyrightconfig.json`, `[tool.pyright]`) |
| A10 tests_exist | Tests exist | a test directory (`test`, `tests`, `__tests__`, `spec`, `specs` at any depth) or a test file by the union of Kodus's and AFC's file patterns plus `*_test.py` |
| A11 test_ratio (count) | Test-to-source file ratio | test files over source files (code extensions, vendored and build directories excluded), capped at 2 |
| A12 readme_setup | Setup steps in the README | a root README with an install, setup, getting started, quick start, development or build heading followed, inside that section, by a code block or a command line |
| A13 env_example | Env example | `.env.example`, `.env.sample`, `.env.template`, `.env.dist`, `env.example` or `example.env` at depth 2 or less |
| A14 codeowners | CODEOWNERS | `CODEOWNERS` at root, `.github/` or `docs/` |
| A15 issue_templates | Issue templates | any file under `.github/ISSUE_TEMPLATE/`, or `ISSUE_TEMPLATE.md` at root or `.github/` |
| A16 file_count (count) | Repository size | number of files in the tree, entered as log10 |
| A17 package_count (count) | Packages | number of manifest files (`package.json`, `pyproject.toml`, `setup.py`, `Cargo.toml`, `go.mod`, `pom.xml`, `build.gradle(.kts)`, `Gemfile`, `composer.json`, `*.csproj`, `mix.exs`, `Package.swift`) outside `node_modules`, `vendor` and `third_party`, entered as log(1 + n) |
| A18 language_count (count) | Languages | number of programming languages, by file extension, that hold at least 1% of code files |

### Family M: the market's checklists as shipped (51)

Every deterministic check of `@kodus/agent-readiness` at commit `e8cac94` (34 of its 39; MIT) and every signal of
Agent Friendly Code at commit `8d59f22` (17 of 17; MIT), implemented to the letter of their source, quirks included
(Kodus ignores `AGENTS.md`; AFC never reads `.github/copilot-instructions.md`; Kodus's tsconfig comment stripper fails
on configs with URLs). Source paths and line numbers for every rule: `study/item-pool-sources.md`. AFC signals keep
their graded values. Excluded, with reason: Kodus's four LLM checks (`naming-conventions`, `test-quality`,
`readme-quality`, `docs-agent-friendliness`, not deterministic) and `no-outdated-deps` (compares a lockfile's mtime to
the wall clock, undefined at a past commit).

### The market's own scores (4)

- `kodus_share`: share of Kodus's 34 deterministic checks passed.
- `kodus_level`: Kodus maturity level 0 to 5 (a level needs 80% of its checks and every lower level), on the 34.
- `afc_overall`: AFC's overall score, the mean of its nine agent scores, each 100 × Σ(pass × weight) / Σ(weight).
- `afc_agent`: AFC's score for the PR's own agent (Claude Code, Cursor, Devin, Codex; Copilot and Jules have no AFC
  weights, so their PRs drop out of this one test).

## Analysis plan

`study/analyze.py` runs everything below from the frozen files and writes `analysis/report.md`. Seeds are fixed
(`20261104`).

1. **Coding.** Binary items as 0/1. Graded and count items as stated above, then standardized with train mean and SD.
   An item is not tested when fewer than 2% or more than 98% of train repositories have a nonzero value; it stays in the
   table with "not tested (prevalence)".
2. **Per-item models (train).** For each item, a PR-level logistic regression of the primary outcome on the item and
   all controls, standard errors clustered by repository. Reported: odds ratio with 95% CI, p value.
3. **Retention rule.** Benjamini-Hochberg at q = 0.05 across all tested items of families A and M together. Retained
   items keep their sign whatever it is; a negative item counts against the score.
4. **Weights (train).** One logistic model with every retained item and all controls. Its item coefficients are the
   weights. An item whose joint coefficient has the opposite sign to its per-item estimate is dropped and the joint
   model is refit once. The score is Σ weight × coded value. The CLI may show it on a 0 to 100 scale; any such scale is
   monotone, so AUCs do not change.
5. **H1, primary (holdout).** Baseline model B: agent, language, stars, age, commits and the non-agent merge rate terms,
   coefficients from train. Model S: B plus the score as one covariate, coefficients from train. Both are applied to
   holdout PRs. H1 holds when the 95% CI of AUC(S) minus AUC(B), from 2,000 bootstrap resamples of holdout
   repositories, lies above zero.
6. **H2 (holdout).** AUC of the score alone against AUC of the non-agent merge rate alone, with the bootstrap CI of the
   difference. This answers "does the readiness score beat the repo's own merge habit".
7. **H3 (holdout).** Each retained item's adjusted odds ratio re-estimated on holdout with the step 2 model. Replicated
   means same sign and p < 0.05. The report gives the count replicated.
8. **H4, the market's scores (holdout).** For each of the four market scores: its adjusted odds ratio per SD (step 2
   model) and AUC(B + score) minus AUC(B), with bootstrap CIs.
9. **Null.** If no item is retained, the score does not exist; the report says so, the CLI prints every item with
   "validation: no item predicted" and H1 to H3 are not run. H4 still runs.

### Secondary and robustness (labelled exploratory in the report)

- **S1, CI at the head commit.** For the 5,000 sampled PRs, the GraphQL `statusCheckRollup.state` of the head commit:
  SUCCESS is 1, FAILURE or ERROR is 0, anything else is dropped. Step 2 models on all sampled PRs (both splits),
  clustered by repository. Every CI claim is a sample claim. `ci_on_pr` cannot be tested here, since PRs without CI
  have no rollup.
- **S2, review.** Among independently decided PRs, a review by a person (AIDev `user_type` User) who is neither author
  nor requester within 72 hours of creation. Step 2 models, train.
- **R1, every decision.** All closed agent PRs with a known decider, self-decisions included, with a self-decision
  indicator added. Step 2 models, train.
- **R2, by agent.** Retained items' odds ratios by agent, train.
- **R3, the full 7.69 million PRs.** Planned, not part of tonight's run: 5,000 repositories with at least 3 agent PRs
  sampled from `all_repository`, any merge as outcome, self-merge caveat stated.

### Headline numbers

- **N1.** The share of the 1,000 most-starred GitHub repositories, at their HEAD on the scan date, with a discoverable
  one-command test run (A01).
- **N2.** The holdout adjusted odds ratio, with 95% CI, of the strongest surviving item (largest absolute train log
  odds ratio among retained items), and the matching difference in predicted merge probability.

## What the lane saw before writing this

Per-agent counts and merge rates in AIDev-pop; the share of merges made by the PR author per agent; the merge rate of
independently decided PRs per agent (Claude Code 70.3%, Copilot 65.4%, Codex 57.2%, Cursor 53.7%, Devin 61.5%; Jules
has none); the repository and PR counts of the frozen sample; git and GraphQL test calls on `vercel/next.js`,
`astral-sh/ruff` and the first 20 repositories in scan order (tree, controls, no item computed). No item was computed
for any repository in the sample, and no item was set against any outcome.

## Deviations

- 2026-11-04 00:01, before any outcome join. Two places where the market items cannot be read exactly as their
  source reads a working copy: AFC's `size` walk skips the fixed directory list and dot paths but does not apply the
  repository's `.gitignore` (the items read tracked files only, which `.gitignore` rarely matches); Kodus's language
  detector is reproduced from its file markers, with Kotlin detected by the substring `kotlin` in `build.gradle(.kts)`
  or `pom.xml`.
- 2026-11-04 00:07, before any outcome join. The prevalence rule in step 1 reads "nonzero value", which would drop
  every count item (a repository always has files) and AFC's `size` (graded 0.2 to 1, never 0). The rule as applied:
  a binary item is tested when 2% to 98% of train repositories have it; a graded or count item is tested when its most
  common value covers at most 98% of train repositories. Found on permuted outcomes, from item distributions only.
- 2026-11-04 00:05. Repositories whose git file listing exceeds 200 MB are scan failures (exclusions), after one such
  repository in the leaderboard set overflowed Node's string limit.
- 2026-11-04 00:08. Exploratory S1, S2 and R1 report every tested item, not only retained ones.

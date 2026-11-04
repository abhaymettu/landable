# MSR 2026 novelty gate for agentready

Checked 2026-11-03. Searches used: 7 of 12. All seven were arXiv title queries, for papers whose MSR detail page had no preprint link. Everything else was a direct fetch of a known URL. That covers the track page, all 62 detail pages, arXiv records whose IDs came from detail pages or reference lists, the Zenodo and figshare records the track page links, and the LGTM preprint the track page links. researchr resolves a detail page by its numeric id, so detail links below use a placeholder slug (`/x`).

## Verdict

No. None of the 62 MSR 2026 Mining Challenge papers publishes per-item, repo-level validation of a set of readiness properties against agent PR outcomes. Neither does the Technical Papers track's "Context Engineering" paper. None ships a scoring instrument. The closest is "Toward Instructions-as-Code" (Arabat and Sayagh, DOI 10.1145/3793302.3793601, arXiv 2606.13449, full text read). It tests exactly one readiness item, the presence of agent instruction files (AGENTS.md, CLAUDE.md, copilot-instructions.md, Cursor rules), with a within-project before/after comparison on 148 AIDev projects and 15,549 agentic PRs. The effect was mixed. After the first file, 27.7% of projects raised their merge rate by at least 20% and 26.35% lowered it by at least 20%. The design has no comparison group of projects without files, no adjustment for time or agent mix, and no significance test on that comparison. Its one significant result is that projects that improved had longer, more sectioned files (median 976 vs 569 words, Mann-Whitney p = 0.0029, small effect). The second closest is "LGTM!" (Branco, Canelas, Gamboa, Fonseca, DOI 10.1145/3793302.3793621, full text read). It compares repositories on stars, forks, a composite GitHub community-health score and CI check runs. Its outcome is auto-merge (merge with no review), not PR success or CI pass. The comparisons are repository-level Mann-Whitney contrasts (health score median 50 vs 75, check runs 4 vs 10, all p < 0.001) with no per-item breakdown of the health score. "Why and When Agentic Pull Requests are (not) Accepted" and "Let's Make Every Pull Request Meaningful" use repository metadata as merge predictors (forks, stars and language in the first; a three-feature repository family in the second, whose members the text does not name). Neither uses readiness items. agentready's novelty holds. It must cite Instructions-as-Code for the AGENTS.md item and LGTM for CI and community files, and its stated difference is a tree read at each PR's date, scored per item, with a comparison group.

## Scope check

- The track page's accepted-papers table lists 62 papers. I fetched all 62 detail pages, read all 62 abstracts, and keyword-scanned them for repository-level and project-level terms, instruction or context files, CI, predictors, regression and merge rate.
- Title 6, "Context Engineering for AI Agents in Open-Source Software", is not a Mining Challenge paper. It is in the MSR 2026 Technical Papers track, and its data does not come from AIDev.

## The six named papers

### 1. Why Are Agentic Pull Requests Merged or Rejected? An Empirical Study

- Read. Full text, arXiv HTML https://arxiv.org/html/2605.22534v1 (MSR detail id 15, https://2026.msrconf.org/details/msr-2026-mining-challenge/15/x).
- Abstract. The authors argue that merge or reject labels misstate agent capability unless review interactions are read. They hand-coded 717 of 9,799 human-reviewed closed agentic PRs from repositories with at least 500 stars. Of 353 rejected PRs, 35.7% were clear agent failures, 31.2% were workflow closures and 33.1% had no visible rationale.
- Unit. PR.
- Repo-level predictors. None. "Workflow constraints" are hand-coded closure reasons (duplicates, superseded changes, inactivity, test PRs, wrong submission), not repository properties.
- Instrument. No. A replication package holds sampling scripts and coding guidelines.

### 2. Why and When Agentic Pull Requests are (not) Accepted: An Exploratory Study

- Read. Full text, `paper.pdf` from Zenodo record https://zenodo.org/records/18008772 (DOI 10.1145/3793302.3793571; Strauss and Schulze; detail id 11).
- Abstract. Targeted association rule mining (Apriori, 5% minimum support, chi-square filtered) over 27,379 AIDev-pop agentic PRs plus the AIDev human PRs. It looks for feature combinations that co-occur with acceptance. Acceptance goes with fast integrator response and small PRs, and human-PR patterns carry over only partly.
- Unit. PR.
- Repo-level predictors. Yes, AIDev repository metadata only. Forks between 25 and 100, main language Python and stars between 100 and 300 appear in the top-lift rules (lift 1.252). No readiness items such as CI, context files, tests or lint.
- Instrument. No. The Zenodo record holds the analysis scripts (`main.py`, `lib.py`, `pull_data.py`).

### 3. Comparing AI Coding Agents: A Task-Stratified Analysis of Pull Request Acceptance

- Read. Full text, arXiv HTML https://arxiv.org/html/2602.08915v2 (DOI 10.1145/3793302.3793583; detail id 16).
- Abstract. Five agents, 7,156 AIDev PRs, weekly acceptance trends plus task-stratified chi-square tests. Task type dominates (documentation 82.1% vs features 66.1%). Codex is consistently high, and no agent leads every task type.
- Unit. PR, aggregated to agent-week and agent-task cells.
- Repo-level predictors. None. The authors write that repository characteristics remain uncontrolled and that the findings are observational.
- Instrument. No. Replication package only.

### 4. When AI Agents Touch CI/CD Configurations: Frequency and Success

- Read. Full text, arXiv HTML https://arxiv.org/html/2601.17413v1 (detail id 21).
- Abstract. 8,031 agentic PRs in 1,605 repositories that touch YAML. CI/CD files are 3.25% of agent file changes and 96.77% of those target GitHub Actions. PRs that touch CI/CD merge 67.77% of the time vs 71.80% for others, and build success is similar across 99,930 runs (75.59% vs 74.87%).
- Unit. PR and workflow run.
- Repo-level predictors. No. The property is whether the PR edits CI configuration, not whether the repository has CI. There is no regression and no repository covariate.
- Instrument. No. A 24-service regex detector is internal to the study.

### 5. On the Reliability of Agentic AI in Continuous Integration Pipelines

- Read. Full text, PDF from figshare https://doi.org/10.6084/m9.figshare.31972818 (detail id 25).
- Abstract. 11,771 PRs (7,619 agentic, 4,152 human) from repositories with at least 500 stars, joined to GitHub Actions runs. Agentic PRs fail CI more often (27.23% vs 20.27%). Agents introduce 79.15% of failures but make 60.63% of fixes, and agent fixes land faster (median 17.23 vs 71.70 minutes).
- Unit. PR and commit (fail-fix pairs).
- Repo-level predictors. None beyond the 500-star filter.
- Instrument. No. The figshare record holds only the paper PDF.

### 6. Context Engineering for AI Agents in Open-Source Software

- Read. Full text, arXiv HTML https://arxiv.org/html/2510.21413 (v4; DOI 10.1145/3793302.3793350; MSR 2026 Technical Papers track).
- Abstract. 10,000 mature repositories sampled through SEART. 466 (5%) had AI context files (Copilot instructions, CLAUDE.md, AGENTS.md, GEMINI.md), and the AGENTS.md files get a qualitative analysis of content, style and commit history. The authors find no settled structure.
- Unit. Repository and context file.
- Repo-level predictors. It describes the context-file property but never relates it to PR outcomes. Its future-work section names that link as an open question.
- Instrument. No. Scripts and data are published.

## Other track papers on repository properties, context files, or merge predictors

### Toward Instructions-as-Code: Understanding the Impact of Instruction Files on Agentic Pull Requests (closest on one item)

- Read. Full text, arXiv HTML https://arxiv.org/html/2606.13449v1 (DOI 10.1145/3793302.3793601; Arabat and Sayagh, ETS Montreal; detail id 41).
- Abstract. Compares each project's agentic PRs before and after it adds instruction files, on merge rate, task size and merge effort. 15,549 PRs from 148 projects. Adding instructions does not reliably help, and projects that improved wrote longer, better-structured files.
- Design. AIDev projects with at least 20 stars, toy projects filtered out, at least 50 commits and 50 PRs, giving 2,449 projects. Agentic PRs were extended to 2025-12-10. Instruction files were found by path predicates: `AGENTS.md`, `CLAUDE.md`, `.claude/*`, `.github/workflows/claude*.yml`, `.github/copilot-instructions.md`, `.github/instructions/*`, `.cursor/*`, `.cursorrules`, `*.mdc`, Devin PR templates and `AGENTS.override.md`. A file's creation date is the first commit that added it. Projects needed at least 5 agentic PRs before and 5 after.
- Results. RQ1 is a per-project merge-rate ratio with no significance test. After the first file, 27.7% of projects rose by at least 20%, 26.35% (39 of 148) fell by at least 20% and 4.72% (7 of 148) did not change. Before the first file vs after the last, the shares were 31.93% up and 27.73% down. RQ2 and RQ3 run per-project Mann-Whitney tests on PR size and merge effort. In RQ4, files in improving projects had a median of 976 words vs 569 in declining projects (Mann-Whitney p = 0.0029, small effect), and they had more H1 to H3 headers.
- Gaps relative to agentready. One item only. No comparison group of projects without files. No adjustment for time trends or agent mix. No CI outcome. It uses a project-level before/after split rather than a tree read at each PR's date. I found no threats-to-validity section in the HTML.
- Unit. Project, with PRs aggregated before and after.
- Instrument. No. Scripts and data are on figshare.

### LGTM! Characteristics of Auto-Merged LLM-based Agentic PRs (closest on several properties)

- Read. Full text, preprint PDF https://pcanelas.com/assets/papers/2026-msr-lgtm.pdf, linked from the track page (DOI 10.1145/3793302.3793621; detail id 61).
- Abstract. Defines auto-merge as merged with no review and no non-author human comment, then compares auto-merged agentic PRs with reviewed ones and with human auto-merges. Auto-merged PRs are smaller, and repositories tend to auto-merge all agentic PRs or none. More mature repositories auto-merge less.
- Repo-level predictors. Yes. Stars, forks, the GitHub community-health score (code of conduct, contributing guide, license, README) and CI check runs, one observation per repository with at least 5 merged PRs. Table 1 medians, auto-merge vs no auto-merge: stars 440 vs 983, forks 81 vs 264, health score 50 vs 75, check runs 4 vs 10. Every Mann-Whitney test gives p < 0.001.
- Gaps relative to agentready. The outcome is auto-merge, a review policy, not whether the agent's PR succeeds or passes CI. The health score is one composite, not per item. The tests are bivariate with no controls, and the authors note that health measures file presence, not quality.
- Unit. Repository (auto-merge rate), plus PR-level size comparisons.
- Instrument. No. An artifact holds the analysis and data.

### Let's Make Every Pull Request Meaningful: An Empirical Analysis of Developer and Agentic Pull Requests

- Read. Full text, arXiv HTML https://arxiv.org/html/2601.18749v1 (DOI 10.1145/3793302.3793567; detail id 7).
- Logistic regression on 64 features in six families (96 terms after VIF filtering), fit for human PRs, all agentic PRs and each agent. The all-agentic model reaches AUC 0.960.
- Repo-level predictors. A "Repository Attributes" family of 3 features, significant for agentic PRs (chi-square 633.78, df 40). The HTML text does not name the three features, so which ones they are is unverified. The df of 40 suggests at least one categorical feature with many levels (guess).
- Unit. PR. Instrument. No.

### When AI Teammates Meet Code Review: Collaboration Signals Shaping the Integration of Agent-Authored Pull Requests

- Read. Full text, arXiv HTML https://arxiv.org/html/2602.19441v1 (detail id 1).
- Logistic regression with repository-clustered standard errors on 33,596 agentic PRs, of which 71.5% merged. Predictors are LOC, files, test files touched, force push, any review, hours to first review, commit count and agent.
- Repo-level predictors. None. The repository enters only through clustering. Unit. PR. Instrument. No.

### On Autopilot? An Empirical Study of Human-AI Teaming and Review Practices in Open Source

- Read. Full text, arXiv HTML https://arxiv.org/html/2601.13754v1 (detail id 13).
- Mines AI-usage guidelines from README, CONTRIBUTING, code of conduct and PR templates. 19 of 145 repositories (13.1%) mention AI usage.
- Repo-level predictors. It describes guideline presence but does not test it against PR outcomes. Unit. Contributor and PR. Instrument. No. The human-PR dataset is published.

### Reliability of AI Bots Footprints in GitHub Actions CI/CD Workflows

- Read. Full text, arXiv PDF https://arxiv.org/pdf/2604.18334v1 (detail id 9).
- 61,837 workflow runs in 2,355 repositories. At the repository level, the number of agentic PRs correlates with workflow success rate at Spearman rho = -0.34 (p < 0.01).
- Repo-level variable. Agent activity volume, not a readiness property. Instrument. No.

### Where Do AI Coding Agents Fail? An Empirical Study of Failed Agentic Pull Requests in GitHub

- Read. Full text, arXiv PDF https://arxiv.org/pdf/2601.15195v1 (detail id 19).
- 33k agentic PRs. Unmerged PRs are larger and fail CI more often, and a taxonomy is built from 600 hand-read PRs. CI result is a PR-level variable. A keyword scan of the text found no repository predictors. Instrument. No.

### Abstract only (full text unverified)

- When Bots Get the Boot (detail id 12). An "APR Signal Set" covering code size, complexity, design, social dynamics and author experience. PR-level.
- The Dose Makes the Agent (detail id 40). Dose-response of PR size on merge probability. PR-level.
- Do AI-Generated Pull Requests Get Rejected More? (detail id 8). A rejection taxonomy, with description features as the strongest predictors. PR-level.
- AI IDEs or Autonomous Agents? (detail id 29, arXiv 2601.13597). A repository-level staggered difference-in-differences of agent adoption on velocity and code quality. The outcomes are repository metrics, not PR outcomes, and adoption is the treatment, not a readiness item.
- Understanding the Rejection of Fixes (32), Why Are AI Agent-Involved Pull Requests (Fix-Related) Remain Unmerged? (51) and Bug-Fixing in the Age of AI (10). Qualitative rejection taxonomies in which CI and test failures appear as reasons. PR-level.
- Android and iOS (36), blockchain (38) and SAST in repositories with at least 500 stars (24). These use repository category as a stratum only.

### Adjacent work outside the Mining Challenge (abstracts via arXiv)

- Agent READMEs: An Empirical Study of Context Files for Agentic Coding (arXiv 2511.12884). 2,303 context files from 1,925 repositories, covering content and maintenance. No PR outcomes. Instructions-as-Code cites it.
- Beyond the Prompt: An Empirical Study of Cursor Rules (arXiv 2512.18925, MSR 2026 Technical Papers). A taxonomy built from 401 repositories. No PR outcomes.

## What this means for agentready

- The AGENTS.md item has one published precedent, and its result is mixed. Roughly as many projects got worse as got better. A PR-dated tree read with projects that never added a file as a comparison group would be a direct improvement on that design, and the paper should say so.
- CI presence and community files have one published association, with auto-merge, in LGTM. Nobody has tested them against agent PR merge or CI pass one item at a time.
- No Mining Challenge paper tests one-command test runs, lint config or a pinned toolchain against any outcome. This is from a keyword scan of all 62 abstracts plus the full texts listed above.
- No paper ships a reusable readiness score or instrument. All shared artifacts are replication scripts and data.

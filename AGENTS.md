# AGENTS.md

landable checks a repository against the agent-readiness items that Kodus and Agent Friendly Code ship, plus 18 of its own, and carries the study that tested every item against 38,070 agent pull requests. The study was run under the working name agentready, so the preregistration and the frozen salts use that name.

## Layout

- `src/`: the scorer (items, snapshot, market scores) and the CLI. No Node imports outside `providers.ts`, `run.ts` and `cli.ts`, so the Worker and the browser can bundle the rest.
- `worker/`: the Cloudflare Worker. `src/index.ts` serves the page, `/api/score`, `/api/head` and `/api/study`; `src/browser.ts` is the page's checker, built to `worker/dist/check.txt`; `src/report.json` is generated.
- `study/`: the pipeline, in the order it ran: `fetch_aidev.py`, `sample.py`, `fetch_meta.py`, `fetch_ci.py`, `top_meta.py`, `scan.mjs`, `score.mjs`, `analyze.py`. Then `page_data.mjs` and `agreement.mjs`.
- `data/frozen/`: inputs fixed before any outcome was joined. Hashes in `data/frozen/SHA256SUMS`; field list in `data/README.md`.
- `analysis/`: generated reports. `report.md` is the result.
- `test/`: rule tests and ten pinned repo snapshots (sources and licenses in `test/fixtures/NOTICE.md`).

## Commands

```bash
pnpm install
pnpm run build && pnpm test && pnpm run typecheck
node dist/cli.js owner/repo            # or a local path; --json for machine output
pnpm run build:worker                  # report.json and the browser bundle
pnpm run deploy:worker                 # needs `wrangler login` on the owner's Cloudflare account
node study/agreement.mjs <base URL> agreement-local.md   # endpoint against CLI on 20 repos
```

Reproduce the report (AIDev parquet files go in `data/raw/`, fetched by `study/fetch_aidev.py` at the pinned revision):

```bash
python3 -m venv .venv && .venv/bin/pip install -r study/requirements.txt
cd study && ../.venv/bin/python analyze.py | shasum -a 256   # equals analysis/report.md
```

## Rules

- Never edit files under `data/frozen/` or change the `agentready-*-v1` salts: the split, caps and sample depend on them.
- `PREREGISTRATION.md` changes only by adding a dated entry under Deviations.
- Kodus and Agent Friendly Code items follow their sources as shipped, quirks included; `study/item-pool-sources.md` cites the line each rule comes from.
- One scorer: the CLI, the Worker and the page all call `src/score.ts`. Never copy item logic into `worker/`.
- The page shows only numbers read from `analysis/report.md` through `worker/src/report.json`; nothing typed by hand.
- Say "predicts", never "causes", and keep the maintainer caveat next to any result. No em or en dashes in prose.
- The page names no repository from the sample; aggregates only.

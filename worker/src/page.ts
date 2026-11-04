import type { Family, Item } from "../../src/item.js";

type Estimate = { readonly est: number; readonly lo: number; readonly hi: number };
type StudyItem = {
  readonly id: string;
  readonly share: number;
  readonly or: Estimate | null;
  readonly q: number | null;
  readonly status: string;
  readonly holdout: (Estimate & { readonly verdict: string }) | null;
};
export type Report = {
  readonly repos: number;
  readonly reposTrain: number;
  readonly reposHoldout: number;
  readonly prs: number;
  readonly tested: number;
  readonly retained: number;
  readonly h1: { readonly baseline: number; readonly withScore: number; readonly diff: Estimate };
  readonly h2: { readonly score: number; readonly mergeRate: number; readonly diff: Estimate };
  readonly market: readonly { readonly score: string; readonly or: Estimate; readonly aucGain: Estimate; readonly prs: number }[];
  readonly items: readonly StudyItem[];
};

const SOURCE: Record<Family, string> = { own: "landable", kodus: "Kodus", afc: "Agent Friendly Code" };
const MARKET: Record<string, string> = {
  kodus_share: "Kodus, share of checks passed",
  kodus_level: "Kodus, readiness level",
  afc_overall: "Agent Friendly Code, overall score",
  afc_agent: "Agent Friendly Code, score for the PR's own agent",
};
const REPO = "https://github.com/abhaymettu/landable";

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const signed = (x: number, digits: number): string => (x < 0 ? "−" : "") + Math.abs(x).toFixed(digits);
const est = (e: Estimate, digits = 2): string => `${signed(e.est, digits)} <span class="ci">${signed(e.lo, digits)} to ${signed(e.hi, digits)}</span>`;
const fmt = new Intl.NumberFormat("en-US");

/** A dot and its 95% interval on a log odds-ratio axis from 0.5 to 2, with the line of no effect at 1. */
function forest(e: Estimate, kept: boolean): string {
  const W = 132;
  const x = (or: number): number => Math.min(W - 3, Math.max(3, ((Math.log(or) - Math.log(0.5)) / (Math.log(2) - Math.log(0.5))) * W));
  const cls = kept ? "kept" : "flat";
  return `<svg class="forest" viewBox="0 0 ${W} 16" width="${W}" height="16" aria-hidden="true"><line class="one" x1="${W / 2}" x2="${W / 2}" y1="1" y2="15"/><line class="${cls}" x1="${x(e.lo).toFixed(1)}" x2="${x(e.hi).toFixed(1)}" y1="8" y2="8"/><circle class="${cls}" cx="${x(e.est).toFixed(1)}" cy="8" r="3.5"/></svg>`;
}

function verdict(i: StudyItem): string {
  if (i.status === "retained" && i.holdout !== null) return `Yes, and on held-out repos: ${est(i.holdout)}`;
  if (i.status.includes("sign flip")) return "No: its sign flipped once the other items were in the model";
  return "No";
}

export function renderPage(report: Report, items: readonly Item[]): string {
  const meta = new Map(items.map((i) => [i.id, i]));
  const tested = report.items.filter((i): i is StudyItem & { or: Estimate; q: number } => i.or !== null && i.q !== null).sort((a, b) => a.q - b.q || a.id.localeCompare(b.id));
  const rare = report.items.filter((i) => i.or === null);
  const itemRows = tested
    .map((i) => {
      const m = meta.get(i.id);
      const kept = i.status === "retained";
      const title = m?.title ?? i.id;
      const named = title !== i.id.slice(i.id.indexOf(".") + 1);
      return `<tr${kept ? ' class="kept-row"' : ""}><th scope="row"><span class="name">${esc(named ? title : i.id)}</span>${named ? `<span class="id">${esc(i.id)}</span>` : ""}</th><td class="from">${esc(m ? SOURCE[m.family] : "")}</td><td class="num">${Math.round(100 * i.share)}%</td><td class="num">${est(i.or)}</td><td>${forest(i.or, kept)}</td><td class="num">${i.q.toPrecision(2)}</td><td class="verdict">${verdict(i)}</td></tr>`;
    })
    .join("\n");
  const marketRows = report.market
    .map((m) => `<tr><th scope="row">${esc(MARKET[m.score] ?? m.score)}</th><td class="num">${est(m.or)}</td><td>${forest(m.or, false)}</td><td class="num">${est(m.aucGain, 4)}</td><td class="num">${fmt.format(m.prs)}</td></tr>`)
    .join("\n");
  const retainedNames = report.items
    .filter((i) => i.status === "retained")
    .map((i) => {
      const m = meta.get(i.id);
      return m === undefined ? esc(i.id) : `${SOURCE[m.family]}'s ${esc(m.title)}`;
    })
    .join(" and ");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>landable</title>
<link rel="icon" href="data:,">
<meta name="description" content="Agent-readiness checklists tested item by item against ${fmt.format(report.prs)} real agent pull requests.">
<style>
:root{--bg:#fbfbfa;--fg:#1d1d1f;--muted:#6b6b70;--faint:#b9b9be;--rule:#e4e4e7;--surface:#f1f1f3;--kept:#0072b2;--flat:#b4b4b9;--kept-bg:rgba(0,114,178,.07);--warn:#9a5b00;--ease:cubic-bezier(.23,1,.32,1);color-scheme:light dark}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#111113;--fg:#f0f0f2;--muted:#a1a1a8;--faint:#4f4f55;--rule:#2a2a2f;--surface:#1b1b1f;--kept:#56b4e9;--flat:#5a5a60;--kept-bg:rgba(86,180,233,.09);--warn:#e69f00}}
:root[data-theme="dark"]{--bg:#111113;--fg:#f0f0f2;--muted:#a1a1a8;--faint:#4f4f55;--rule:#2a2a2f;--surface:#1b1b1f;--kept:#56b4e9;--flat:#5a5a60;--kept-bg:rgba(86,180,233,.09);--warn:#e69f00}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--fg);font:100%/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;font-variant-numeric:tabular-nums}
main{max-width:63rem;margin:0 auto;padding:4.5rem 1rem 5rem}
.prose{max-width:40rem}
h1{font-size:clamp(1.85rem,4.6vw,2.75rem);line-height:1.08;letter-spacing:-.025em;font-weight:680;margin:0 0 1.25rem;text-wrap:balance}
h2{font-size:1.3rem;line-height:1.25;letter-spacing:-.012em;font-weight:650;margin:4rem 0 .6rem}
p{margin:0 0 1rem}
.lede{font-size:1.15rem;line-height:1.5;color:var(--fg)}
.muted,.ci,.id{color:var(--muted)}
a{color:inherit;text-decoration-color:var(--faint);text-underline-offset:.18em}
a:hover{text-decoration-color:currentColor}
.wrap{overflow-x:auto;margin:1.25rem -1rem 0;padding:0 1rem}
table{border-collapse:collapse;width:100%;font-size:.9rem}
th,td{text-align:left;vertical-align:middle;padding:.55rem .75rem .55rem 0;border-bottom:1px solid var(--rule)}
thead th{font-weight:550;color:var(--muted);font-size:.8rem;vertical-align:bottom}
tbody th{font-weight:500}
.num{text-align:right;white-space:nowrap}
.ci{font-size:.8em;margin-left:.3em}
.name{display:block}
.id{display:block;font-size:.78rem;font-weight:400}
.kept-row{background:var(--kept-bg)}
.kept-row .verdict{color:var(--kept);font-weight:550}
.verdict{min-width:10rem}
.from{white-space:nowrap}
.forest{display:block;overflow:visible}
.forest .one{stroke:var(--faint);stroke-dasharray:2 2}
.forest line.flat{stroke:var(--flat);stroke-width:2}
.forest circle.flat{fill:var(--flat)}
.forest line.kept{stroke:var(--kept);stroke-width:2.5}
.forest circle.kept{fill:var(--kept)}
.axis{display:flex;justify-content:space-between;width:132px;font-size:.72rem;color:var(--muted);font-weight:400}
form{display:flex;gap:.5rem;margin:1.25rem 0 0;max-width:30rem}
input{flex:1;min-width:0;font:inherit;color:inherit;background:var(--surface);border:1px solid var(--rule);border-radius:10px;padding:.65rem .8rem}
input:focus-visible,button:focus-visible{outline:2px solid var(--kept);outline-offset:2px}
button{font:inherit;font-weight:550;color:var(--bg);background:var(--fg);border:0;border-radius:10px;padding:.65rem 1.1rem;cursor:pointer;transition:transform 140ms var(--ease),opacity 140ms ease}
button:active{transform:scale(.97)}
button[disabled]{opacity:.55;cursor:progress}
#out{margin-top:1.5rem;transition:opacity 200ms ease}
#out[data-busy]{opacity:.5}
#out h3{font-size:1rem;font-weight:600;margin:0 0 .5rem}
#out ul{list-style:none;padding:0;margin:0 0 1rem}
#out li{padding:.4rem 0;border-bottom:1px solid var(--rule)}
.yes{color:var(--kept);font-weight:600}
.warn{color:var(--warn)}
details{margin-top:.5rem}
summary{cursor:pointer;color:var(--muted)}
footer{margin-top:4.5rem;padding-top:1.25rem;border-top:1px solid var(--rule);font-size:.85rem;color:var(--muted)}
@media (prefers-reduced-motion:reduce){button,#out{transition:none}}
</style>
</head>
<body data-kept="${report.items.filter((i) => i.status === "retained").map((i) => esc(i.id)).join(" ")}">
<main>
<div class="prose">
<h1>Readiness scores don’t predict whether an agent’s pull request gets merged. The repo’s own merge rate does.</h1>
<p class="lede">Across ${fmt.format(report.reposHoldout)} held-out repositories, a readiness score on its own tells merged agent PRs from rejected ones with an AUC of ${report.h2.score.toFixed(3)}, about a coin flip, while the share of other PRs the repo merges reaches ${report.h2.mergeRate.toFixed(3)}. That is prediction, not cause, and a merge says as much about the maintainers as about the repo.</p>
<p class="muted">${fmt.format(report.prs)} agent PRs from AIDev, in ${fmt.format(report.repos)} public repositories with over 100 stars, counted only when someone other than the person who asked for the PR merged or closed it. The plan was committed before any outcome was joined.</p>
</div>

<h2>The market's own scores, as shipped</h2>
<div class="prose"><p class="muted">Odds ratio for a merge per standard deviation of each score on held-out PRs, adjusted for the agent, language, stars, age, commits and the repo's non-agent merge rate. A ratio of 1 means no relation; every interval crosses it.</p></div>
<div class="wrap"><table>
<thead><tr><th>Score</th><th class="num">Odds ratio, 95% CI</th><th><div class="axis"><span>0.5</span><span>1</span><span>2</span></div></th><th class="num">AUC gain over baseline</th><th class="num">PRs</th></tr></thead>
<tbody>
${marketRows}
</tbody></table></div>

<h2>Every item, tested one at a time</h2>
<div class="prose"><p class="muted">${report.tested} of ${report.items.length} items varied enough across repos to test. Each odds ratio is from ${fmt.format(report.reposTrain)} training repos with the same adjustment; yes-or-no items compare having it with not, the rest are per standard deviation. q is the Benjamini-Hochberg false discovery rate across all ${report.tested}. Only ${retainedNames} survived, and both held up on the held-out repos. Adding them as a score moved held-out AUC from ${report.h1.baseline.toFixed(3)} to ${report.h1.withScore.toFixed(3)}, a gain whose interval (${signed(report.h1.diff.lo, 3)} to ${signed(report.h1.diff.hi, 3)}) includes zero.</p></div>
<div class="wrap"><table>
<thead><tr><th>Item</th><th>From</th><th class="num">Repos with it</th><th class="num">Odds ratio, 95% CI</th><th><div class="axis"><span>0.5</span><span>1</span><span>2</span></div></th><th class="num">q</th><th>Predicts a merge?</th></tr></thead>
<tbody>
${itemRows}
</tbody></table></div>
<p class="muted" style="margin-top:1rem">Too rare to test: ${rare.map((i) => esc(i.id)).join(", ")}.</p>

<h2>Check a repository</h2>
<div class="prose"><p class="muted">Reads a public GitHub repo at its latest commit, in your browser with the same code as the CLI, and lists every item with the file behind it.</p></div>
<form id="check"><input id="repo" name="repo" placeholder="owner/name" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="GitHub repository, as owner/name" required><button id="go" type="submit">Check</button></form>
<div id="out" aria-live="polite"></div>

<footer>
<p>Code MIT, data from AIDev v5 (CC BY 4.0). <a href="${REPO}">Source, preregistration and data</a> · <a href="${REPO}/blob/main/analysis/report.md">Full report</a> · <a href="/api/study">Numbers as JSON</a></p>
</footer>
</main>
<script type="module" src="/check.js"></script>
</body>
</html>
`;
}

// Turns analysis/report.md into worker/src/report.json so the page and the endpoint carry no hand-typed numbers.
import { readFileSync, writeFileSync } from "node:fs";

const md = readFileSync(new URL("../analysis/report.md", import.meta.url), "utf8");
const num = (s) => Number(s.replace(/,/g, ""));
const ci = (s) => {
  const m = /^(-?[\d.]+) \[(?:95% CI )?(-?[\d.]+), (-?[\d.]+)\]$/.exec(s.trim());
  if (!m) throw new Error(`not an estimate with CI: ${s}`);
  return { est: num(m[1]), lo: num(m[2]), hi: num(m[3]) };
};
const section = (title) => {
  const start = md.indexOf(`## ${title}\n`);
  if (start < 0) throw new Error(`no section ${title}`);
  const end = md.indexOf("\n## ", start + 4);
  return md.slice(start, end < 0 ? undefined : end);
};
const rows = (text) =>
  text
    .split("\n")
    .filter((l) => l.startsWith("| ") && !l.startsWith("| Item ") && !l.startsWith("| Score "))
    .map((l) => l.split("|").slice(1, -1).map((c) => c.trim()));
const match = (re, text = md) => {
  const m = re.exec(text);
  if (!m) throw new Error(`no match for ${re}`);
  return m;
};

const holdout = section("Held-out tests");
const replicated = Object.fromEntries(
  [...holdout.matchAll(/^ {2}- ([\w.-]+): odds ratio (.+?\]), p ([\d.e-]+), (\w+)$/gm)].map((m) => [m[1], { ...ci(m[2]), p: num(m[3]), verdict: m[4] }]),
);
const items = rows(section("Items (train)")).map(([id, share, or, q, status, weight]) => ({
  id,
  share: num(share),
  or: or === "" ? null : ci(or),
  q: q === "" ? null : num(q),
  status,
  weight: weight === "" ? null : num(weight),
  holdout: replicated[id] ?? null,
}));
const h1 = match(/H1: holdout AUC baseline ([\d.]+), baseline plus score ([\d.]+); difference (.+?\]); (.+)$/m, holdout);
const h2 = match(/H2: holdout AUC score alone ([\d.]+), non-agent merge rate alone ([\d.]+); difference (.+?\])\.?$/m, holdout);
const market = rows(section("The market's own scores (holdout)")).map(([score, or, gain, prs]) => ({
  score,
  or: ci(or),
  aucGain: ci(gain),
  prs: num(prs),
}));
const sample = section("Sample");
const scan = match(/with controls and a scan: (\d+) \(train (\d+), holdout (\d+)\)/, sample);
const prs = match(/after the cap of 50 per repository: (\d+) \(train (\d+), holdout (\d+)\)/, sample);
const n1 = match(/N1: (\d+) of the (\d+) most-starred repositories scanned \(([\d.]+)%\)/);
const n2 = match(/differs by ([\d.]+) points/);

const report = {
  repos: num(scan[1]),
  reposTrain: num(scan[2]),
  reposHoldout: num(scan[3]),
  prs: num(prs[1]),
  tested: num(match(/Tested (\d+) items; retained (\d+)/)[1]),
  retained: num(match(/Tested (\d+) items; retained (\d+)/)[2]),
  h1: { baseline: num(h1[1]), withScore: num(h1[2]), diff: ci(h1[3]), verdict: h1[4] },
  h2: { score: num(h2[1]), mergeRate: num(h2[2]), diff: ci(h2[3]) },
  market,
  items,
  n1: { withTestCommand: num(n1[1]), of: num(n1[2]), pct: num(n1[3]) },
  n2Points: num(n2[1]),
};
writeFileSync(new URL("../worker/src/report.json", import.meta.url), JSON.stringify(report, null, 1) + "\n");
console.log(`items ${items.length}, retained ${items.filter((i) => i.status === "retained").length}, market ${market.length}, h1 ${report.h1.diff.est}, h2 ${report.h2.score} vs ${report.h2.mergeRate}`);

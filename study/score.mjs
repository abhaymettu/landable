// Score every cached snapshot with the built item code and write the frozen scan file, sorted by repo_id.
// Usage: node study/score.mjs [--leaderboard]
// Writes data/scan.jsonl (values) and data/scan-evidence.jsonl.gz (evidence paths), or the top-* pair.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { makeSnapshot } from "../dist/snapshot.js";
import { evaluate } from "../dist/score.js";

const ROOT = new URL("..", import.meta.url).pathname;
const leaderboard = process.argv.includes("--leaderboard");
const cache = join(ROOT, "data", "cache", leaderboard ? "top" : "sample");
const prefix = leaderboard ? "top-scan" : "scan";
const commit = readFileSync(join(ROOT, ".git", "HEAD"), "utf8").trim();

const rows = [];
const evidence = [];
for (const name of readdirSync(cache).filter((n) => n.endsWith(".json.gz"))) {
  const body = JSON.parse(gunzipSync(readFileSync(join(cache, name))).toString("utf8"));
  const ev = evaluate(makeSnapshot({ files: body.files, texts: new Map(Object.entries(body.texts)) }));
  const items = Object.fromEntries([...ev.findings].map(([id, f]) => [id, f.value]));
  rows.push({ repo_id: body.repo_id, full_name: body.full_name, commit: body.commit, n_files: body.files.length, items, market: ev.market });
  evidence.push({ repo_id: body.repo_id, evidence: Object.fromEntries([...ev.findings].map(([id, f]) => [id, f.evidence.slice(0, 2)])) });
}
rows.sort((a, b) => a.repo_id - b.repo_id);
evidence.sort((a, b) => a.repo_id - b.repo_id);
const text = rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
writeFileSync(join(ROOT, "data", `${prefix}.jsonl`), text);
writeFileSync(join(ROOT, "data", `${prefix}-evidence.jsonl.gz`), gzipSync(evidence.map((r) => JSON.stringify(r)).join("\n") + "\n"));
const sha = createHash("sha256").update(text).digest("hex");
process.stdout.write(`${prefix}.jsonl rows ${rows.length} sha256 ${sha} (git HEAD ${commit})\n`);

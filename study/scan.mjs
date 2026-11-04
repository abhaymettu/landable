// Snapshot every sampled repo at its reference commit into data/cache (file list plus the texts items read).
// Idempotent and resumable: a repo with a cache file or a recorded error is skipped, so a kill loses nothing.
// Usage: node study/scan.mjs [--jobs N] [--retry-errors] [--leaderboard]
import { createReadStream, existsSync } from "node:fs";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { gzipSync } from "node:zlib";
import { snapshotAtCommit } from "../dist/providers.js";

const ROOT = new URL("..", import.meta.url).pathname;
const argv = process.argv.slice(2);
const jobs = Number(argv[argv.indexOf("--jobs") + 1]) || 6;
const leaderboard = argv.includes("--leaderboard");
const CACHE = join(ROOT, "data", "cache", leaderboard ? "top" : "sample");
const ERRORS = join(ROOT, "data", "frozen", leaderboard ? "top-scan-errors.jsonl" : "scan-errors.jsonl");
const LOG = join(ROOT, "data", "frozen", leaderboard ? "top-scan.log" : "scan.log");
const INPUT = join(ROOT, "data", "frozen", leaderboard ? "top-meta.jsonl" : "meta.jsonl");

async function lines(path) {
  const out = [];
  if (!existsSync(path)) return out;
  for await (const line of createInterface({ input: createReadStream(path) })) if (line.trim()) out.push(JSON.parse(line));
  return out;
}

await mkdir(CACHE, { recursive: true });
const errored = new Set(argv.includes("--retry-errors") ? [] : (await lines(ERRORS)).map((e) => e.repo_id));
const todo = (await lines(INPUT)).filter((r) => r.ref_oid && !errored.has(r.repo_id) && !existsSync(join(CACHE, `${r.repo_id}.json.gz`)));
process.stdout.write(`to scan: ${todo.length} (jobs ${jobs})\n`);

let done = 0;
let failed = 0;
const started = Date.now();
async function worker() {
  for (let r = todo.shift(); r !== undefined; r = todo.shift()) {
    const t0 = Date.now();
    try {
      const snap = await snapshotAtCommit({ url: `https://github.com/${r.name_now}.git`, commit: r.ref_oid });
      const body = { repo_id: r.repo_id, full_name: r.full_name, commit: r.ref_oid, files: snap.files, texts: Object.fromEntries(snap.texts) };
      await writeFile(join(CACHE, `${r.repo_id}.json.gz`), gzipSync(JSON.stringify(body)));
      done++;
    } catch (err) {
      failed++;
      const message = String(err?.stderr ?? err?.message ?? err).slice(0, 300);
      await appendFile(ERRORS, JSON.stringify({ repo_id: r.repo_id, full_name: r.full_name, error: message }) + "\n");
    }
    if ((done + failed) % 100 === 0) {
      const line = { t: new Date().toISOString(), done, failed, left: todo.length, last_ms: Date.now() - t0, rate_per_min: Math.round(((done + failed) * 60000) / (Date.now() - started)) };
      await appendFile(LOG, JSON.stringify(line) + "\n");
    }
  }
}
await Promise.all(Array.from({ length: jobs }, worker));
process.stdout.write(`scanned ${done}, failed ${failed}, ${Math.round((Date.now() - started) / 1000)} s\n`);

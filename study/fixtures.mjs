// Capture 10 real repositories at their current HEAD as test fixtures, with the CLI's text report for each.
// Usage: node study/fixtures.mjs (rerun only to refresh fixtures; the test compares against the saved reports)
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { snap } from "../dist/providers.js";
import { renderText } from "../dist/run.js";
import { evaluate } from "../dist/score.js";

const REPOS = ["astral-sh/ruff", "vercel/next.js", "pallets/flask", "tokio-rs/tokio", "rails/rails", "laravel/framework", "spring-projects/spring-boot", "sindresorhus/ky", "openai/codex", "dotnet/aspnetcore"];
const DIR = new URL("../test/fixtures/", import.meta.url).pathname;

for (const name of REPOS) {
  const [owner, repo] = name.split("/");
  const snapped = await snap({ kind: "github", owner, repo });
  const base = join(DIR, name.replace("/", "__"));
  const body = { label: snapped.label, commit: snapped.commit, files: snapped.snapshot.files, texts: Object.fromEntries(snapped.snapshot.texts) };
  writeFileSync(`${base}.json.gz`, gzipSync(JSON.stringify(body)));
  writeFileSync(`${base}.txt`, renderText(snapped, evaluate(snapped.snapshot)));
  process.stdout.write(`${name} ${snapped.commit} files ${snapped.snapshot.files.length}\n`);
}

#!/usr/bin/env node
import { snap } from "./providers.js";
import { parseArgs, renderJson, renderText } from "./run.js";
import { evaluate } from "./score.js";

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if ("error" in args) {
    process.stderr.write(args.error);
    return 2;
  }
  const snapped = await snap(args.source);
  const ev = evaluate(snapped.snapshot);
  process.stdout.write(args.json ? renderJson(snapped, ev) : renderText(snapped, ev));
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    process.stderr.write(`agentready: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  },
);

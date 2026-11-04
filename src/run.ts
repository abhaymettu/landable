import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Finding, Item } from "./item.js";
import type { Snapped, Source } from "./providers.js";
import { ITEMS, type Evaluation } from "./score.js";

const USAGE = `usage: landable <owner/repo | github URL | path> [--ref <branch|sha>] [--json]

Reads the repository at one commit and reports every agent-readiness item with the file that is its evidence.
Items: landable's own 18, Kodus's 34 deterministic checks and Agent Friendly Code's 17 signals, as shipped.
`;

export type Args = { readonly source: Source; readonly json: boolean };

export function parseArgs(argv: readonly string[]): Args | { readonly error: string } {
  const positional: string[] = [];
  let json = false;
  let ref: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") json = true;
    else if (a === "--ref") ref = argv[++i];
    else if (a === "-h" || a === "--help") return { error: USAGE };
    else if (a !== undefined) positional.push(a);
  }
  const target = positional[0];
  if (target === undefined || positional.length > 1) return { error: USAGE };
  const gh = /^(?:https?:\/\/github\.com\/)?([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(target);
  if (existsSync(target) || gh === null) return { source: { kind: "local", path: resolve(target) }, json };
  const [, owner, repo] = gh;
  if (owner === undefined || repo === undefined) return { error: USAGE };
  return { source: ref === undefined ? { kind: "github", owner, repo } : { kind: "github", owner, repo, ref }, json };
}

const show = (item: Item, f: Finding): string => {
  const value = item.kind === "binary" ? (f.value === 1 ? "yes" : "no ") : String(f.value).padEnd(3);
  const evidence = f.evidence.length > 0 ? f.evidence.join(", ") : "-";
  return `  ${value}  ${item.id.padEnd(30)} ${evidence}`;
};

export function renderText(snapped: Snapped, ev: Evaluation): string {
  const lines = [`landable ${snapped.label}${snapped.commit ? ` @ ${snapped.commit.slice(0, 12)}` : ""}`, ""];
  const families = [
    ["own", "landable items"],
    ["kodus", "Kodus agent-readiness checks (as shipped)"],
    ["afc", "Agent Friendly Code signals (as shipped)"],
  ] as const;
  for (const [family, heading] of families) {
    lines.push(heading);
    for (const item of ITEMS.filter((i) => i.family === family)) {
      const f = ev.findings.get(item.id);
      if (f !== undefined) lines.push(show(item, f));
    }
    lines.push("");
  }
  const m = ev.market;
  lines.push(`Kodus: ${Math.round(m.kodusShare * 100)}% of deterministic checks, level ${m.kodusLevel}`);
  lines.push(`Agent Friendly Code: overall ${m.afcOverall}`);
  lines.push("");
  lines.push("Validation: preregistered (PREREGISTRATION.md); item weights are published only after the held-out test.");
  return lines.join("\n") + "\n";
}

export function renderJson(snapped: Snapped, ev: Evaluation): string {
  return JSON.stringify(
    {
      repo: snapped.label,
      commit: snapped.commit ?? null,
      items: Object.fromEntries([...ev.findings].map(([id, f]) => [id, { value: f.value, evidence: f.evidence }])),
      market: ev.market,
    },
    null,
    2,
  ) + "\n";
}

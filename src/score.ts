import type { Finding, Item } from "./item.js";
import { afcAgentScore, afcOverall, afcSignals } from "./items/afc.js";
import { AFC_AGENTS, type AfcAgent } from "./items/afc-weights.js";
import { kodusChecks, kodusLevel } from "./items/kodus.js";
import { ownItems } from "./items/own.js";
import type { Snapshot } from "./snapshot.js";

export const ITEMS: readonly Item[] = [...ownItems, ...kodusChecks, ...afcSignals];

export type MarketScores = {
  readonly kodusShare: number;
  readonly kodusLevel: number;
  readonly afcOverall: number;
  readonly afcByAgent: Readonly<Record<AfcAgent, number>>;
};

export type Evaluation = {
  readonly findings: ReadonlyMap<string, Finding>;
  readonly market: MarketScores;
};

export function evaluate(s: Snapshot): Evaluation {
  const findings = new Map<string, Finding>();
  for (const item of ITEMS) findings.set(item.id, item.evaluate(s));
  const kodusPassed = kodusChecks.filter((c) => findings.get(c.id)?.value === 1).length;
  const afcByAgent = Object.fromEntries(AFC_AGENTS.map((a) => [a, afcAgentScore(findings, a)])) as Record<AfcAgent, number>;
  return {
    findings,
    market: {
      kodusShare: Math.round((1e4 * kodusPassed) / kodusChecks.length) / 1e4,
      kodusLevel: kodusLevel(findings),
      afcOverall: afcOverall(findings),
      afcByAgent,
    },
  };
}

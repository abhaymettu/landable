import type { Snapshot } from "./snapshot.js";

export type Family = "own" | "kodus" | "afc";

/** binary: 0 or 1. graded: a value in [0, 1] as the source tool grades it. count: a raw count or ratio. */
export type ValueKind = "binary" | "graded" | "count";

export type Finding = { readonly value: number; readonly evidence: readonly string[] };

export type Item = {
  readonly id: string;
  readonly family: Family;
  readonly title: string;
  readonly kind: ValueKind;
  readonly evaluate: (s: Snapshot) => Finding;
};

export const pass = (...evidence: (string | undefined)[]): Finding => ({
  value: 1,
  evidence: evidence.filter((e): e is string => e !== undefined),
});
export const fail: Finding = { value: 0, evidence: [] };
export const graded = (value: number, ...evidence: (string | undefined)[]): Finding => ({
  value,
  evidence: evidence.filter((e): e is string => e !== undefined),
});

/** The first rule that returns a Finding wins; no rule firing is a fail. */
export function firstHit(rules: readonly (() => Finding | undefined)[]): Finding {
  for (const rule of rules) {
    const hit = rule();
    if (hit !== undefined) return hit;
  }
  return fail;
}

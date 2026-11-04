import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { renderText } from "../src/run.js";
import { makeSnapshot } from "../src/snapshot.js";
import { evaluate, ITEMS } from "../src/score.js";

type Fixture = { label: string; commit: string; files: string[]; texts: Record<string, string> };
const DIR = join(import.meta.dirname, "fixtures");
const names = readdirSync(DIR).filter((n) => n.endsWith(".json.gz"));

describe("ten real repositories", () => {
  it("has ten fixtures", () => {
    expect(names.length).toBe(10);
  });
  for (const name of names) {
    it(`${name} scores to its saved report with one line per item`, () => {
      const parsed: unknown = JSON.parse(gunzipSync(readFileSync(join(DIR, name))).toString("utf8"));
      const fx = parsed as Fixture;
      const snapshot = makeSnapshot({ files: fx.files, texts: new Map(Object.entries(fx.texts)) });
      const report = renderText({ snapshot, commit: fx.commit, label: fx.label }, evaluate(snapshot));
      expect(report).toBe(readFileSync(join(DIR, name.replace(".json.gz", ".txt")), "utf8"));
      expect(report.split("\n").filter((l) => /^  \S+\s+(A\d\d|kodus|afc)\./.test(l)).length).toBe(ITEMS.length);
    });
  }
});

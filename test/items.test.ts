import { describe, expect, it } from "vitest";
import { parseArgs } from "../src/run.js";
import { makeSnapshot } from "../src/snapshot.js";
import { evaluate } from "../src/score.js";

const repo = (files: Record<string, string>) =>
  evaluate(makeSnapshot({ files: Object.keys(files), texts: new Map(Object.entries(files)) }));
const value = (files: Record<string, string>, id: string) => repo(files).findings.get(id)?.value;
const evidence = (files: Record<string, string>, id: string) => repo(files).findings.get(id)?.evidence;

describe("A01 test_command", () => {
  it("rejects npm's placeholder test script", () => {
    expect(value({ "package.json": '{"scripts":{"test":"echo \\"Error: no test specified\\" && exit 1"}}' }, "A01.test_command")).toBe(0);
  });
  it("accepts a real test script and names package.json", () => {
    expect(evidence({ "package.json": '{"scripts":{"test":"vitest run"}}' }, "A01.test_command")).toEqual(["package.json"]);
  });
  it("accepts a Makefile test target", () => {
    expect(evidence({ Makefile: "build:\n\tgo build\n\ntest-unit:\n\tgo test ./...\n" }, "A01.test_command")).toEqual(["Makefile"]);
  });
  it("accepts a CI step that runs tests", () => {
    const files = { ".github/workflows/ci.yml": "on: push\njobs:\n  t:\n    steps:\n      - run: pytest -q\n" };
    expect(evidence(files, "A01.test_command")).toEqual([".github/workflows/ci.yml"]);
  });
});

describe("A02 ci_on_pr", () => {
  it("reads the inline trigger list", () => {
    expect(value({ ".github/workflows/ci.yml": "on: [push, pull_request]\n" }, "A02.ci_on_pr")).toBe(1);
  });
  it("reads the block trigger form", () => {
    expect(value({ ".github/workflows/ci.yml": "on:\n  push:\n    branches: [main]\n  pull_request:\n    types: [opened]\n" }, "A02.ci_on_pr")).toBe(1);
  });
  it("does not count a push-only workflow", () => {
    expect(value({ ".github/workflows/ci.yml": "on:\n  push:\n    branches: [main]\n" }, "A02.ci_on_pr")).toBe(0);
  });
});

describe("agent instruction files", () => {
  const agentsOnly = { "AGENTS.md": "x".repeat(300) };
  it("agentready counts AGENTS.md", () => {
    expect(value(agentsOnly, "A03.agent_instructions")).toBe(1);
  });
  it("Kodus ignores AGENTS.md, as shipped", () => {
    expect(value(agentsOnly, "kodus.ai-context")).toBe(0);
  });
  it("AFC grades AGENTS.md by length", () => {
    expect(value(agentsOnly, "afc.agents_md")).toBe(0.8);
  });
});

describe("type checking", () => {
  const tsconfig = { "tsconfig.json": '{\n  "$schema": "https://json.schemastore.org/tsconfig",\n  "compilerOptions": { "strict": true }\n}\n' };
  it("agentready parses a tsconfig with a URL", () => {
    expect(value(tsconfig, "A09.type_check")).toBe(1);
  });
  it("Kodus's comment stripper breaks on the same file, as shipped", () => {
    expect(value(tsconfig, "kodus.type-checker")).toBe(0);
  });
  it("Kodus passes a strict tsconfig without URLs", () => {
    expect(value({ "tsconfig.json": '{"compilerOptions":{"strict":true}}' }, "kodus.type-checker")).toBe(1);
  });
});

describe("README", () => {
  it("finds setup steps under an install heading", () => {
    expect(value({ "README.md": "# x\n\n## Installation\n\n```bash\nnpm i x\n```\n" }, "A12.readme_setup")).toBe(1);
  });
  it("needs a command, not prose, in the section", () => {
    expect(value({ "README.md": "# x\n\n## Installation\n\nAsk the team.\n\n## Other\n\n```\nnpm i x\n```\n" }, "A12.readme_setup")).toBe(0);
  });
  it("grades README length the way AFC does", () => {
    expect([150, 500, 1200].map((n) => value({ "README.md": "r".repeat(n) }, "afc.readme"))).toEqual([0.3, 0.7, 1]);
  });
});

describe("counts", () => {
  it("test ratio counts test files over source files", () => {
    const files = { "src/a.ts": "", "src/b.ts": "", "src/c.ts": "", "src/d.ts": "", "src/a.test.ts": "", "tests/e.py": "" };
    expect(value(files, "A11.test_ratio")).toBe(0.5);
  });
  it("languages need 1% of code files", () => {
    const files: Record<string, string> = { "x.go": "" };
    for (let i = 0; i < 120; i++) files[`src/f${i}.ts`] = "";
    expect(evidence(files, "A18.language_count")).toEqual(["TypeScript"]);
  });
});

describe("market scores", () => {
  it("AFC agent score is the weighted pass share, size signal included", () => {
    expect(repo({ LICENSE: "MIT" }).market.afcByAgent["claude-code"]).toBe(9.9);
  });
  it("Kodus level needs 80% of each level in turn", () => {
    const l1 = { ".editorconfig": "", "README.md": "r".repeat(600), "package-lock.json": "{}", LICENSE: "MIT" };
    expect(repo(l1).market.kodusLevel).toBe(1);
  });
});

describe("parseArgs", () => {
  it("reads owner/repo as GitHub", () => {
    expect(parseArgs(["astral-sh/ruff", "--json"])).toEqual({ source: { kind: "github", owner: "astral-sh", repo: "ruff" }, json: true });
  });
  it("reads a GitHub URL with a ref", () => {
    expect(parseArgs(["https://github.com/pallets/flask", "--ref", "main"])).toEqual({
      source: { kind: "github", owner: "pallets", repo: "flask", ref: "main" },
      json: false,
    });
  });
});

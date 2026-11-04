// landable's own items (agentready during the study), family A of PREREGISTRATION.md.
import { fail, firstHit, graded, pass, type Item } from "../item.js";
import {
  field,
  filesMatching,
  isFile,
  isRecord,
  packageJson,
  parseJson,
  read,
  rootFiles,
  stripJsonComments,
  type Snapshot,
} from "../snapshot.js";

const VENDORED = ["node_modules", "vendor", "third_party", "dist", "build", "target", ".git"];
const vendored = (f: string): boolean => f.split("/").slice(0, -1).some((d) => VENDORED.includes(d));
const anyFile = (s: Snapshot, paths: readonly string[]): string | undefined => paths.find((p) => isFile(s, p));
const rootMatch = (s: Snapshot, re: RegExp): string | undefined => rootFiles(s).find((f) => re.test(f));
const textMatches = (s: Snapshot, path: string | undefined, re: RegExp): boolean => path !== undefined && re.test(read(s, path) ?? "");
const workflows = (s: Snapshot): string[] => filesMatching(s, /^\.github\/workflows\/[^/]+\.ya?ml$/);
const ciFiles = (s: Snapshot): string[] => [
  ...workflows(s),
  ...[".gitlab-ci.yml", ".circleci/config.yml", "Jenkinsfile", ".travis.yml", "azure-pipelines.yml"].filter((p) => isFile(s, p)),
];

export const CI_RUNS_TESTS =
  /\b(npm\s+test|yarn\s+test|pnpm\s+test|bun\s+test|jest|vitest|pytest|go\s+test|make\s+test|npm\s+run\s+test|gradle\s+test|\.\/gradlew\s+test|gradlew\s+test|gradle\s+check|\.\/gradlew\s+check|mvn\s+test|\.\/mvnw\s+test|mvn\s+verify|\.\/mvnw\s+verify|cargo\s+test|dotnet\s+test|bundle\s+exec\s+r(ake|spec)|phpunit|composer\s+test|swift\s+test)\b/i;

const TEST_FILE =
  /(^|\/)([^/]+\.(test|spec)\.[^/]+|test_[^/]*\.py|[^/]*_test\.(py|go|rs|exs|dart|rb)|[^/]*_spec\.rb|[^/]*Tests?\.(java|kt|cs|php|swift|scala)|[^/]*Spec\.(kt|scala))$/;
const TEST_DIR = /(^|\/)(tests?|__tests__|specs?)\//;
const CODE_EXT: Readonly<Record<string, string>> = {
  ts: "TypeScript", tsx: "TypeScript", mts: "TypeScript", cts: "TypeScript", js: "JavaScript", jsx: "JavaScript", mjs: "JavaScript",
  cjs: "JavaScript", py: "Python", go: "Go", rs: "Rust", java: "Java", kt: "Kotlin", kts: "Kotlin", scala: "Scala", cs: "C#",
  fs: "F#", c: "C", h: "C", cc: "C++", cpp: "C++", cxx: "C++", hpp: "C++", m: "Objective-C", mm: "Objective-C", swift: "Swift",
  rb: "Ruby", php: "PHP", ex: "Elixir", exs: "Elixir", erl: "Erlang", hs: "Haskell", ml: "OCaml", clj: "Clojure", dart: "Dart",
  lua: "Lua", r: "R", jl: "Julia", zig: "Zig", nim: "Nim", sh: "Shell", bash: "Shell", ps1: "PowerShell", vue: "Vue",
  svelte: "Svelte", sol: "Solidity", groovy: "Groovy", pl: "Perl",
};
const extOf = (f: string): string | undefined => {
  const base = f.slice(f.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : undefined;
};
const codeLanguage = (f: string): string | undefined => {
  const ext = extOf(f);
  return ext === undefined ? undefined : CODE_EXT[ext];
};
const isTestFile = (f: string): boolean => TEST_FILE.test(f) || TEST_DIR.test(f);

function testCommand(s: Snapshot) {
  const pkgTest = field(packageJson(s), "scripts")?.["test"];
  return firstHit([
    () => (typeof pkgTest === "string" && !/no test specified/.test(pkgTest) ? pass("package.json") : undefined),
    () => {
      const mk = anyFile(s, ["Makefile", "makefile", "GNUmakefile"]);
      return mk && textMatches(s, mk, /^test[\w.-]*\s*:/m) ? pass(mk) : undefined;
    },
    () => {
      const just = anyFile(s, ["justfile", "Justfile", ".justfile"]);
      return just && textMatches(s, just, /^@?test[\w-]*\b[^\n:=]*:(?!=)/m) ? pass(just) : undefined;
    },
    () => {
      const task = anyFile(s, ["Taskfile.yml", "Taskfile.yaml"]);
      return task && textMatches(s, task, /^\s+test[\w:-]*\s*:/m) ? pass(task) : undefined;
    },
    () => { const h = anyFile(s, ["pytest.ini", "tox.ini", "noxfile.py", "conftest.py"]); return h ? pass(h) : undefined; },
    () => (textMatches(s, "pyproject.toml", /\[tool\.(pytest|tox|hatch\.envs)/) ? pass("pyproject.toml") : undefined),
    () => (textMatches(s, "setup.cfg", /\[tool:pytest\]/) ? pass("setup.cfg") : undefined),
    () => { const h = anyFile(s, ["Cargo.toml", "go.mod", "pom.xml", "build.gradle", "build.gradle.kts", "gradlew", "mvnw", "mix.exs", "Package.swift"]); return h ? pass(h) : undefined; },
    () => {
      const composer = parseJson(read(s, "composer.json"));
      return isRecord(composer) && field(composer, "scripts")?.["test"] !== undefined ? pass("composer.json") : undefined;
    },
    () => {
      const deno = anyFile(s, ["deno.json", "deno.jsonc"]);
      const parsed = deno ? parseJson(stripJsonComments(read(s, deno) ?? "")) : undefined;
      return deno && isRecord(parsed) && field(parsed, "tasks")?.["test"] !== undefined ? pass(deno) : undefined;
    },
    () => { const h = s.files.find((f) => /^scripts\/test[^/]*$/.test(f)); return h ? pass(h) : undefined; },
    () => { const h = ciFiles(s).find((f) => CI_RUNS_TESTS.test(read(s, f) ?? "")); return h ? pass(h) : undefined; },
  ]);
}

const PR_TRIGGER = [
  /^\s*on\s*:\s*\[?[^\n#]*\bpull_request(_target)?\b/m,
  /^\s*-\s*["']?pull_request(_target)?["']?\s*$/m,
  /^\s*["']?pull_request(_target)?["']?\s*:/m,
];

function readmeSetup(s: Snapshot) {
  const readme = rootFiles(s).find((f) => /^readme(\.(md|markdown|rst|txt))?$/i.test(f));
  const text = readme ? read(s, readme) : undefined;
  if (readme === undefined || text === undefined) return fail;
  const lines = text.split("\n");
  const heading = /(install|setup|set up|getting started|get started|quick ?start|development|developing|building|build from source|usage)/i;
  const command = /^\s*(\$ |>\s)?(npm|npx|pnpm|yarn|bun|pip|pip3|pipx|uv|poetry|conda|cargo|go|make|just|docker|git clone|brew|bundle|gem|mvn|gradle|\.\/gradlew|dotnet|composer|mix|deno|python3? -m|cmake|nix)\b/;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const next = lines[i + 1] ?? "";
    const isHeading = /^#{1,6}\s/.test(line) || (/^[=\-~^]{3,}\s*$/.test(next) && line.trim() !== "") || /^<h[1-6][^>]*>/i.test(line);
    if (!isHeading || !heading.test(line)) continue;
    for (let j = i + 1; j < Math.min(lines.length, i + 60); j++) {
      const body = lines[j] ?? "";
      if (/^#{1,6}\s/.test(body)) break;
      if (/^\s*(```|~~~)/.test(body) || /^\s*\.\. code(-block)?::/.test(body) || /::\s*$/.test(body) || command.test(body)) return pass(readme);
    }
  }
  return fail;
}

function strictTsconfig(s: Snapshot): boolean {
  const parsed = parseJson(stripJsonComments(read(s, "tsconfig.json") ?? ""));
  return isRecord(parsed) && field(parsed, "compilerOptions")?.["strict"] === true;
}

const items: readonly (Omit<Item, "family">)[] = [
  { id: "A01.test_command", title: "One-command test run is discoverable", kind: "binary", evaluate: testCommand },
  {
    id: "A02.ci_on_pr",
    title: "CI runs on pull requests",
    kind: "binary",
    evaluate: (s) => {
      const wf = workflows(s).find((f) => PR_TRIGGER.some((re) => re.test(read(s, f) ?? "")));
      if (wf) return pass(wf);
      const other = anyFile(s, [".circleci/config.yml", ".travis.yml", "azure-pipelines.yml"]);
      return other ? pass(other) : fail;
    },
  },
  {
    id: "A03.agent_instructions",
    title: "Agent instructions file",
    kind: "binary",
    evaluate: (s) => {
      const hit =
        anyFile(s, ["AGENTS.md", "AGENT.md", "CLAUDE.md", "GEMINI.md", ".cursorrules", ".windsurfrules", ".clinerules", ".github/copilot-instructions.md"]) ??
        s.files.find((f) => f.startsWith(".cursor/rules/") || /^\.github\/instructions\/[^/]+\.instructions\.md$/.test(f));
      return hit ? pass(hit) : fail;
    },
  },
  {
    id: "A04.contributing",
    title: "Contributor guide",
    kind: "binary",
    evaluate: (s) => { const h = s.files.find((f) => /^(\.github\/|docs\/)?contributing(\.[a-z]+)?$/i.test(f)); return h ? pass(h) : fail; },
  },
  {
    id: "A05.pr_template",
    title: "PR template",
    kind: "binary",
    evaluate: (s) => {
      const h = s.files.find((f) => /^(\.github\/|docs\/)?pull_request_template(\.md)?$/i.test(f) || /^\.github\/pull_request_template\/[^/]+$/i.test(f));
      return h ? pass(h) : fail;
    },
  },
  {
    id: "A06.pinned_toolchain",
    title: "Lockfile and toolchain version pin",
    kind: "binary",
    evaluate: (s) => {
      const lock = anyFile(s, ["package-lock.json", "bun.lock", "bun.lockb", "yarn.lock", "pnpm-lock.yaml", "uv.lock", "pdm.lock", "poetry.lock", "Pipfile.lock", "go.sum", "Cargo.lock", "gradle.lockfile", "gradle/verification-metadata.xml", "packages.lock.json", "Gemfile.lock", "composer.lock", "Package.resolved", "deno.lock", "mix.lock", "flake.lock"]);
      if (lock === undefined) return fail;
      const pkg = packageJson(s);
      const pin =
        anyFile(s, [".nvmrc", ".node-version", ".tool-versions", ".python-version", "mise.toml", ".mise.toml", "rust-toolchain.toml", "rust-toolchain", ".ruby-version", ".java-version", ".sdkmanrc", "global.json", "go.mod"]) ??
        (field(pkg, "engines")?.["node"] !== undefined || typeof pkg?.["packageManager"] === "string" ? "package.json" : undefined) ??
        (textMatches(s, "pyproject.toml", /^\s*requires-python\s*=/m) ? "pyproject.toml" : undefined) ??
        (textMatches(s, "Cargo.toml", /^\s*rust-version\s*=/m) ? "Cargo.toml" : undefined);
      return pin ? pass(lock, pin) : fail;
    },
  },
  {
    id: "A07.repro_env",
    title: "Reproducible environment",
    kind: "binary",
    evaluate: (s) => {
      const h =
        s.files.find((f) => f.startsWith(".devcontainer/")) ??
        anyFile(s, [".devcontainer.json", "Dockerfile", "Containerfile", "docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml", "flake.nix", "shell.nix", "devbox.json"]);
      return h ? pass(h) : fail;
    },
  },
  {
    id: "A08.lint_format",
    title: "Lint or format config",
    kind: "binary",
    evaluate: (s) => {
      const file = rootMatch(
        s,
        /^(\.eslintrc(\..+)?|eslint\.config\..+|biome\.jsonc?|\.oxlintrc\.jsonc?|oxlint\.config\.ts|\.prettierrc(\..+)?|prettier\.config\..+|\.?ruff\.toml|\.flake8|\.pylintrc|pylintrc|\.golangci\.ya?ml|\.?clippy\.toml|\.?rustfmt\.toml|\.rubocop\.yml|\.swiftlint\.yml|\.swiftformat|\.?detekt\.yml|checkstyle\.xml|phpstan\.neon(\.dist)?|psalm\.xml(\.dist)?|\.php-cs-fixer(\.dist)?\.php|\.clang-format|\.clang-tidy|\.editorconfig-checker\.json|\.stylelintrc(\..+)?|\.markdownlint(\..+)?)$/,
      );
      if (file) return pass(file);
      if (textMatches(s, "pyproject.toml", /\[tool\.(ruff|black|flake8|pylint|isort)/)) return pass("pyproject.toml");
      if (textMatches(s, "setup.cfg", /\[(flake8|pylint|pycodestyle)/)) return pass("setup.cfg");
      if (textMatches(s, "tox.ini", /\[flake8\]/)) return pass("tox.ini");
      const pkg = packageJson(s);
      return pkg?.["eslintConfig"] !== undefined || pkg?.["prettier"] !== undefined ? pass("package.json") : fail;
    },
  },
  {
    id: "A09.type_check",
    title: "Type checking config",
    kind: "binary",
    evaluate: (s) =>
      firstHit([
        () => (strictTsconfig(s) ? pass("tsconfig.json") : undefined),
        () => { const h = anyFile(s, ["mypy.ini", ".mypy.ini", "pyrightconfig.json"]); return h ? pass(h) : undefined; },
        () => (textMatches(s, "setup.cfg", /\[mypy\]/) ? pass("setup.cfg") : undefined),
        () => (textMatches(s, "pyproject.toml", /\[tool\.(mypy|pyright)\]/) ? pass("pyproject.toml") : undefined),
      ]),
  },
  {
    id: "A10.tests_exist",
    title: "Tests exist",
    kind: "binary",
    evaluate: (s) => { const h = s.files.find((f) => !vendored(f) && isTestFile(f)); return h ? pass(h) : fail; },
  },
  {
    id: "A11.test_ratio",
    title: "Test-to-source file ratio",
    kind: "count",
    evaluate: (s) => {
      let tests = 0;
      let sources = 0;
      for (const f of s.files) {
        if (vendored(f) || codeLanguage(f) === undefined) continue;
        if (isTestFile(f)) tests++;
        else sources++;
      }
      const ratio = sources === 0 ? (tests > 0 ? 2 : 0) : Math.min(2, tests / sources);
      return graded(Math.round(ratio * 1e4) / 1e4, `${tests} test files`, `${sources} source files`);
    },
  },
  { id: "A12.readme_setup", title: "Setup steps in the README", kind: "binary", evaluate: readmeSetup },
  {
    id: "A13.env_example",
    title: "Env example",
    kind: "binary",
    evaluate: (s) => {
      const h = s.files.find((f) => f.split("/").length <= 3 && /(^|\/)(\.env\.(example|sample|template|dist)|env\.example|example\.env)$/.test(f));
      return h ? pass(h) : fail;
    },
  },
  {
    id: "A14.codeowners",
    title: "CODEOWNERS",
    kind: "binary",
    evaluate: (s) => { const h = anyFile(s, ["CODEOWNERS", ".github/CODEOWNERS", "docs/CODEOWNERS"]); return h ? pass(h) : fail; },
  },
  {
    id: "A15.issue_templates",
    title: "Issue templates",
    kind: "binary",
    evaluate: (s) => {
      const h = s.files.find((f) => /^\.github\/ISSUE_TEMPLATE\/[^/]+$/i.test(f) || /^(\.github\/)?ISSUE_TEMPLATE\.md$/i.test(f));
      return h ? pass(h) : fail;
    },
  },
  {
    id: "A16.file_count",
    title: "Repository size (files)",
    kind: "count",
    evaluate: (s) => graded(s.files.length, `${s.files.length} files`),
  },
  {
    id: "A17.package_count",
    title: "Packages (manifest files)",
    kind: "count",
    evaluate: (s) => {
      const manifests = s.files.filter(
        (f) => !f.split("/").slice(0, -1).some((d) => ["node_modules", "vendor", "third_party"].includes(d)) &&
          /(^|\/)(package\.json|pyproject\.toml|setup\.py|Cargo\.toml|go\.mod|pom\.xml|build\.gradle(\.kts)?|Gemfile|composer\.json|[^/]+\.csproj|mix\.exs|Package\.swift)$/.test(f),
      );
      return graded(manifests.length, ...manifests.slice(0, 5));
    },
  },
  {
    id: "A18.language_count",
    title: "Programming languages",
    kind: "count",
    evaluate: (s) => {
      const counts = new Map<string, number>();
      let total = 0;
      for (const f of s.files) {
        const lang = vendored(f) ? undefined : codeLanguage(f);
        if (lang === undefined) continue;
        counts.set(lang, (counts.get(lang) ?? 0) + 1);
        total++;
      }
      const langs = [...counts].filter(([, n]) => n / total >= 0.01).sort((a, b) => b[1] - a[1]).map(([l]) => l);
      return graded(langs.length, ...langs);
    },
  },
];

export const ownItems: readonly Item[] = items.map((i) => ({ ...i, family: "own" }));


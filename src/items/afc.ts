// The 17 signals of Agent Friendly Code at commit 8d59f22 (MIT), graded as its source grades them.
// Line references: study/item-pool-sources.md. AFC matches paths case-insensitively.
import { graded, type Finding, type Item } from "../item.js";
import { AFC_AGENTS, AFC_WEIGHTS, type AfcAgent } from "./afc-weights.js";
import { isDirI, isFileI, packageJson, field, readI, realPathI, rootFiles, type Snapshot } from "../snapshot.js";

const existsI = (s: Snapshot, p: string): boolean => isFileI(s, p) || isDirI(s, p);
const firstExistingI = (s: Snapshot, paths: readonly string[]): string | undefined => paths.find((p) => existsI(s, p));
const lengthGrade = (text: string | undefined): number => {
  if (text === undefined) return 0;
  const n = text.trim().length;
  if (n === 0) return 0.2;
  if (n < 200) return 0.5;
  if (n < 800) return 0.8;
  return 1;
};
const depth = (f: string): number => f.split("/").length - 1;
const SKIP_WALK = ["node_modules", ".git", "vendor", "target"];
const walkable = (f: string, maxDepth: number): boolean =>
  depth(f) <= maxDepth && !f.split("/").slice(0, -1).some((d) => SKIP_WALK.includes(d));

const signals: readonly { id: string; evaluate: (s: Snapshot) => Finding }[] = [
  {
    id: "agents_md",
    evaluate: (s) => {
      const candidates = ["AGENTS.md", "CLAUDE.md", "AGENT.md", ".claude/CLAUDE.md", ".claude/AGENTS.md"].filter((p) => existsI(s, p));
      const chosen = candidates.find((p) => (readI(s, p) ?? "").trim().length > 0) ?? candidates[0];
      if (chosen === undefined) return graded(0);
      return graded(lengthGrade(readI(s, chosen) ?? ""), realPathI(s, chosen));
    },
  },
  {
    id: "cursor_rules",
    evaluate: (s) => {
      const mdc = s.files.find((f) => {
        const parts = f.split("/");
        const at = parts.findIndex((p, i) => p === ".cursor" && parts[i + 1] === "rules");
        if (at < 0 || at > 3) return false;
        if (parts.slice(0, at).some((d) => ["node_modules", ".git", "vendor", "target", ".cursor"].includes(d))) return false;
        return parts.length - (at + 2) <= 4 && /\.mdc$/i.test(f);
      });
      if (mdc) return graded(1, mdc);
      return existsI(s, ".cursorrules") ? graded(0.5, ".cursorrules") : graded(0);
    },
  },
  {
    id: "gemini_md",
    evaluate: (s) => {
      if (!existsI(s, "GEMINI.md")) return graded(0);
      let inFence = false;
      const expanded = (readI(s, "GEMINI.md") ?? "")
        .split("\n")
        .map((line) => {
          if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
          const m = inFence ? null : /^\s*@(?:\.\/)?(AGENTS\.md|CLAUDE\.md|AGENT\.md)\s*$/.exec(line);
          return m?.[1] ? (readI(s, m[1]) ?? "") : line;
        })
        .join("\n");
      return graded(lengthGrade(expanded), realPathI(s, "GEMINI.md"));
    },
  },
  {
    id: "openhands_setup",
    evaluate: (s) => {
      if (!existsI(s, ".openhands/setup.sh")) return graded(0);
      return graded((readI(s, ".openhands/setup.sh") ?? "").trim() === "" ? 0.2 : 1, ".openhands/setup.sh");
    },
  },
  {
    id: "aider_conf",
    evaluate: (s) => {
      if (!existsI(s, ".aider.conf.yml")) return graded(0);
      const text = readI(s, ".aider.conf.yml") ?? "";
      if (text.trim() === "") return graded(0.2, ".aider.conf.yml");
      const strong = [/^(?:test|lint)-cmd[ \t]*:[ \t]*[^\s#]/m, /^auto-test[ \t]*:[ \t]*true\b/im, /^read[ \t]*:[ \t]*(?:[^\s#[]|\[[ \t]*[^\s\]]|\r?\n[ \t]+-[ \t]*\S)/m];
      return graded(strong.some((re) => re.test(text)) ? 1 : 0.5, ".aider.conf.yml");
    },
  },
  {
    id: "agent_skills",
    evaluate: (s) => {
      const hit = s.files.find((f) => /^\.agents\/skills\/[^/]+\/skill\.md$/i.test(f));
      return hit ? graded(1, hit) : graded(0);
    },
  },
  {
    id: "readme",
    evaluate: (s) => {
      const f = firstExistingI(s, ["README.md", "README.rst", "README.txt", "README"]);
      if (f === undefined) return graded(0);
      const n = (readI(s, f) ?? "").trim().length;
      return graded(n < 200 ? 0.3 : n < 1000 ? 0.7 : 1, realPathI(s, f));
    },
  },
  {
    id: "tests",
    evaluate: (s) => {
      const dir = ["tests", "test", "__tests__", "spec", "specs", "src/test"].find((d) => isDirI(s, d));
      if (dir) return graded(1, realPathI(s, dir));
      const re = /(^|\/)(.*\.test\.|.*\.spec\.|test_.*\.py$|.*_test\.go$|.*_test\.rs$|.*Test\.java$|.*Tests?\.kt$|.*_test\.exs$|.*_test\.dart$|.*Spec\.scala$|.*Test\.scala$|.*Test\.php$|.*_test\.rb$|.*_spec\.rb$|.*Tests?\.cs$)/;
      const hit = s.files.find((f) => walkable(f, 3) && re.test(f));
      return hit ? graded(0.7, hit) : graded(0);
    },
  },
  {
    id: "ci",
    evaluate: (s) => {
      const wf = s.files.find((f) => /^\.github\/workflows\/[^/]+\.ya?ml$/i.test(f));
      if (wf) return graded(1, wf);
      const other = firstExistingI(s, [".gitlab-ci.yml", ".circleci/config.yml", "azure-pipelines.yml", ".travis.yml", "Jenkinsfile", ".buildkite/pipeline.yml"]);
      return other ? graded(0.9, realPathI(s, other)) : graded(0);
    },
  },
  {
    id: "linter",
    evaluate: (s) => {
      const hit = firstExistingI(s, [
        ".eslintrc", ".eslintrc.js", ".eslintrc.json", ".eslintrc.cjs", "eslint.config.js", "eslint.config.mjs", ".prettierrc",
        ".prettierrc.json", ".prettierrc.js", "prettier.config.js", "ruff.toml", ".ruff.toml", ".pylintrc", ".flake8", "setup.cfg",
        "rustfmt.toml", ".rustfmt.toml", "clippy.toml", ".golangci.yml", ".golangci.yaml", "biome.json", ".biome.json", ".rubocop.yml",
        ".standard.yml", ".swiftlint.yml", ".swiftformat", ".swift-format", "detekt.yml", "config/detekt/detekt.yml", ".scalafmt.conf",
        "phpstan.neon", "phpstan.neon.dist", "psalm.xml", "psalm.xml.dist", ".php-cs-fixer.dist.php", ".php-cs-fixer.php", ".credo.exs",
        ".formatter.exs", "stylua.toml", ".stylua.toml", "checkstyle.xml", "config/checkstyle/checkstyle.xml", "analysis_options.yaml",
        ".clang-format", ".clang-tidy", ".clj-kondo/config.edn",
      ]);
      if (hit) return graded(1, realPathI(s, hit));
      return /\[tool\.(ruff|black|flake8|pylint|mypy)/.test(readI(s, "pyproject.toml") ?? "") ? graded(1, "pyproject.toml") : graded(0);
    },
  },
  {
    id: "deps_manifest",
    evaluate: (s) => {
      const names = ["package.json", "pnpm-lock.yaml", "yarn.lock", "pyproject.toml", "requirements.txt", "Pipfile", "poetry.lock", "Cargo.toml", "go.mod", "Gemfile", "composer.json", "pubspec.yaml", "build.gradle", "build.gradle.kts", "build.sbt", "pom.xml", "mix.exs", "Package.swift", "deps.edn", "project.clj", "stack.yaml", "dune-project", "rebar.config", "shard.yml", "build.zig", "CMakeLists.txt", "meson.build", "conanfile.txt", "conanfile.py", "vcpkg.json"];
      const hit = names.find((n) => isFileI(s, n)) ?? rootFiles(s).find((f) => /\.(csproj|fsproj|vbproj|sln)$/i.test(f) || /\.cabal$/i.test(f) || /\.nimble$/i.test(f));
      return hit ? graded(1, realPathI(s, hit) ?? hit) : graded(0);
    },
  },
  {
    id: "dev_env",
    evaluate: (s) => {
      const found = ["Makefile", ".devcontainer/devcontainer.json", ".devcontainer.json", "flake.nix", "shell.nix", "Dockerfile", "docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml", "justfile", "Taskfile.yml", "tox.ini", "noxfile.py", "mvnw", "gradlew", "bin/setup", ".devin/blueprint.yaml", ".cursor/environment.json"].filter((p) => existsI(s, p));
      if (found.length >= 2) return graded(1, ...found);
      if (found.length === 1) return graded(0.7, ...found);
      const scripts = field(packageJson(s), "scripts");
      return scripts !== undefined && Object.keys(scripts).length >= 3 ? graded(0.6, "package.json") : graded(0);
    },
  },
  {
    id: "type_config",
    evaluate: (s) => {
      const hit =
        ["tsconfig.json", "jsconfig.json", "mypy.ini", ".mypy.ini", "pyrightconfig.json"].find((p) => isFileI(s, p)) ??
        (/\[tool\.(mypy|pyright)/.test(readI(s, "pyproject.toml") ?? "") ? "pyproject.toml" : undefined) ??
        ["Cargo.toml", "go.mod", "pom.xml", "build.gradle", "build.gradle.kts", "build.sbt", "Package.swift", "global.json", "dune-project", "stack.yaml", "build.zig"].find((p) => isFileI(s, p)) ??
        rootFiles(s).find((f) => /\.(csproj|fsproj|vbproj|sln)$/i.test(f) || /\.cabal$/i.test(f));
      return hit ? graded(1, realPathI(s, hit) ?? hit) : graded(0);
    },
  },
  {
    id: "license",
    evaluate: (s) => {
      const hit = ["LICENSE", "LICENSE.md", "LICENSE.txt", "COPYING", "COPYING.md"].find((p) => isFileI(s, p));
      return hit ? graded(1, realPathI(s, hit)) : graded(0);
    },
  },
  {
    id: "contributing",
    evaluate: (s) => {
      const names = ["CONTRIBUTING.md", "CONTRIBUTING.rst", "CONTRIBUTING.adoc", "CONTRIBUTING"];
      const hit = ["", ".github/", "docs/"].flatMap((d) => names.map((n) => d + n)).find((p) => isFileI(s, p));
      return hit ? graded(1, realPathI(s, hit)) : graded(0);
    },
  },
  {
    id: "pre_commit",
    evaluate: (s) => {
      const hit = firstExistingI(s, [".pre-commit-config.yaml", ".husky", "lefthook.yml", "lefthook.yaml"]);
      return hit ? graded(1, realPathI(s, hit)) : graded(0);
    },
  },
  {
    id: "size",
    evaluate: (s) => {
      const skip = ["node_modules", ".git", "vendor", "target", "dist", "build", ".next"];
      let n = 0;
      for (const f of s.files) {
        const parts = f.split("/");
        if (parts.length - 1 > 8) continue;
        if (parts.some((p) => p.startsWith(".") || skip.includes(p))) continue;
        n++;
        if (n > 10000) break;
      }
      const value = n < 50 ? 0.9 : n < 500 ? 1 : n < 2000 ? 0.8 : n < 5000 ? 0.5 : 0.2;
      return graded(value, `${n > 10000 ? ">10000" : n} files`);
    },
  },
];

export const afcSignals: readonly Item[] = signals.map((sig) => ({
  ...sig,
  id: `afc.${sig.id}`,
  family: "afc",
  kind: "graded",
  title: sig.id,
}));

/** AFC's agent score: 100 * sum(pass * weight) / sum(weights), rounded to 0.1. */
export function afcAgentScore(results: ReadonlyMap<string, Finding>, agent: AfcAgent): number {
  let num = 0;
  let den = 0;
  for (const [signal, weights] of Object.entries(AFC_WEIGHTS)) {
    num += (results.get(`afc.${signal}`)?.value ?? 0) * weights[agent];
    den += weights[agent];
  }
  return Math.round((1000 * num) / den) / 10;
}

export function afcOverall(results: ReadonlyMap<string, Finding>): number {
  const scores = AFC_AGENTS.map((a) => afcAgentScore(results, a));
  return Math.round((10 * scores.reduce((t, x) => t + x, 0)) / scores.length) / 10;
}


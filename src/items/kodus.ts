// The deterministic checks of @kodus/agent-readiness at commit e8cac94 (MIT), to the letter of its source.
// Line references: study/item-pool-sources.md. Quirks are kept on purpose: the study tests the checklist as shipped.
import { fail, firstHit, pass, type Finding, type Item } from "../item.js";
import {
  exists,
  field,
  filesMatching,
  isFile,
  isRecord,
  packageJson,
  read,
  rootFiles,
  type Snapshot,
} from "../snapshot.js";

type KodusSpec = { readonly id: string; readonly level: 1 | 2 | 3 | 4 | 5; readonly evaluate: (s: Snapshot) => Finding };
type KodusCheck = Item & { readonly level: KodusSpec["level"] };

const hasRoot = (s: Snapshot, re: RegExp): string | undefined => rootFiles(s).find((f) => re.test(f));
const anyExists = (s: Snapshot, paths: readonly string[]): string | undefined => paths.find((p) => exists(s, p));
const anyFile = (s: Snapshot, paths: readonly string[]): string | undefined => paths.find((p) => isFile(s, p));
const contains = (s: Snapshot, path: string, needles: readonly string[]): string | undefined => {
  const text = read(s, path);
  return text !== undefined && needles.some((n) => text.includes(n)) ? path : undefined;
};
const containsI = (s: Snapshot, path: string, re: RegExp): string | undefined => {
  const text = read(s, path);
  return text !== undefined && re.test(text) ? path : undefined;
};
const segments = (f: string): string[] => f.split("/");
const notUnder = (f: string, dirs: readonly string[]): boolean => !segments(f).slice(0, -1).some((d) => dirs.includes(d));
const noDotDirs = (f: string): boolean => !segments(f).some((d) => d.startsWith("."));

const workflowFiles = (s: Snapshot): string[] => filesMatching(s, /^\.github\/workflows\/[^/]+\.ya?ml$/);
const ciFiles = (s: Snapshot): string[] => [
  ...workflowFiles(s),
  ...[".gitlab-ci.yml", ".circleci/config.yml", "Jenkinsfile", ".travis.yml"].filter((p) => isFile(s, p)),
];
const ciMatch = (s: Snapshot, re: RegExp): string | undefined => ciFiles(s).find((f) => re.test(read(s, f) ?? ""));
const csprojContains = (s: Snapshot, needles: readonly string[]): string | undefined =>
  filesMatching(s, /(^|\/)[^/]+\.csproj$/).find((f) => contains(s, f, needles) !== undefined);
const rootCsproj = (s: Snapshot): string | undefined => hasRoot(s, /\.csproj$/);
const rootSln = (s: Snapshot): string | undefined => hasRoot(s, /\.sln$/);
const gradle = (s: Snapshot, needles: readonly string[]): string | undefined =>
  contains(s, "build.gradle.kts", needles) ?? contains(s, "build.gradle", needles);

function detectedTypes(s: Snapshot): Set<string> {
  const types = new Set<string>();
  if (isFile(s, "go.mod")) types.add("go");
  if (isFile(s, "Cargo.toml")) types.add("rust");
  if (isFile(s, "pom.xml") || isFile(s, "build.gradle") || isFile(s, "build.gradle.kts")) types.add("java");
  if (gradle(s, ["kotlin"]) ?? contains(s, "pom.xml", ["kotlin"])) types.add("kotlin");
  if (rootCsproj(s) ?? rootSln(s)) types.add("csharp");
  if (isFile(s, "Package.swift")) types.add("swift");
  return types;
}

const scripts = (s: Snapshot): Record<string, unknown> | undefined => field(packageJson(s), "scripts");
const depKeys = (s: Snapshot, kinds: readonly string[]): string[] => {
  const pkg = packageJson(s);
  return kinds.flatMap((k) => Object.keys(field(pkg, k) ?? {}));
};
const scriptsJoined = (s: Snapshot): string => Object.values(scripts(s) ?? {}).filter((v) => typeof v === "string").join(" ");
const firstConfig = (s: Snapshot, re: RegExp): string | undefined => hasRoot(s, re);

const KODUS_STRIP = /\/\/.*$|\/\*[\s\S]*?\*\//gm;

const specs: readonly KodusSpec[] = [
  {
    id: "kodus.linter",
    level: 2,
    evaluate: (s) =>
      firstHit([
        () => {
          const hit =
            hasRoot(s, /^(\.eslintrc(\..+)?|eslint\.config\..+|biome\.jsonc?|\.oxlintrc\.jsonc?|oxlint\.config\.ts|\.?ruff\.toml|\.golangci\.ya?ml|\.?detekt\.yml|detekt-config\.yml|stylecop\.json|\.rubocop\.yml|phpstan\.neon(\.dist)?|psalm\.xml|phpcs\.xml(\.dist)?|\.swiftlint\.yml)$/);
          return hit ? pass(hit) : undefined;
        },
        () => (scriptsJoined(s).includes("oxlint") || depKeys(s, ["dependencies", "devDependencies", "peerDependencies"]).includes("oxlint") ? pass("package.json") : undefined),
        () => { const h = gradle(s, ["detekt", "ktlint", "checkstyle", "pmd", "spotbugs"]); return h ? pass(h) : undefined; },
        () => { const h = anyExists(s, ["checkstyle.xml", ".checkstyle", "pmd.xml", ".pmd", "spotbugs-exclude.xml"]); return h ? pass(h) : undefined; },
        () => { const h = contains(s, "pom.xml", ["checkstyle", "maven-pmd-plugin", "spotbugs"]); return h ? pass(h) : undefined; },
        () => { const h = rootFiles(s).filter((f) => f.endsWith(".csproj")).find((f) => contains(s, f, ["Microsoft.CodeAnalysis", "StyleCop.Analyzers"])); return h ? pass(h) : undefined; },
        () => { const h = contains(s, "composer.json", ["phpstan", "psalm", "squizlabs/php_codesniffer"]); return h ? pass(h) : undefined; },
        () => { const h = contains(s, "Gemfile", ["rubocop"]); return h ? pass(h) : undefined; },
        () => { const h = anyExists(s, ["clippy.toml", ".clippy.toml"]); return h ? pass(h) : undefined; },
        () => (isFile(s, "Cargo.toml") ? pass("Cargo.toml") : undefined),
      ]),
  },
  {
    id: "kodus.formatter",
    level: 2,
    evaluate: (s) => {
      const types = detectedTypes(s);
      return firstHit([
        () => { const h = hasRoot(s, /^(\.prettierrc(\..+)?|prettier\.config\..+|\.oxfmtrc\.jsonc?|oxfmt\.config\.ts)$/); return h ? pass(h) : undefined; },
        () => (scriptsJoined(s).includes("oxfmt") || depKeys(s, ["dependencies", "devDependencies", "peerDependencies"]).includes("oxfmt") ? pass("package.json") : undefined),
        () => {
          const biome = isFile(s, "biome.json") ? "biome.json" : isFile(s, "biome.jsonc") ? "biome.jsonc" : undefined;
          return biome && contains(s, biome, ["formatter"]) ? pass(biome) : undefined;
        },
        () => { const h = contains(s, "pyproject.toml", ["[tool.black]", "[tool.ruff"]); return h ? pass(h) : undefined; },
        () => (types.has("go") ? pass("go.mod") : undefined),
        () => { const h = anyExists(s, ["rustfmt.toml", ".rustfmt.toml"]); return h ? pass(h) : undefined; },
        () => (types.has("rust") ? pass("Cargo.toml") : undefined),
        () => (types.has("csharp") ? pass(rootCsproj(s) ?? rootSln(s)) : undefined),
        () => (isFile(s, ".rubocop.yml") ? pass(".rubocop.yml") : undefined),
        () => { const h = contains(s, "Gemfile", ["rubocop"]); return h ? pass(h) : undefined; },
        () => { const h = anyExists(s, [".php-cs-fixer.php", ".php-cs-fixer.dist.php", ".php_cs", ".php_cs.dist"]); return h ? pass(h) : undefined; },
        () => (exists(s, ".swiftformat") ? pass(".swiftformat") : undefined),
        () => { const h = gradle(s, ["ktlint", "ktfmt", "spotless", "google-java-format"]); return h ? pass(h) : undefined; },
        () => { const h = contains(s, "pom.xml", ["spotless", "google-java-format", "formatter-maven-plugin"]); return h ? pass(h) : undefined; },
      ]);
    },
  },
  {
    id: "kodus.type-checker",
    level: 3,
    evaluate: (s) => {
      const types = detectedTypes(s);
      return firstHit([
        () => (["kotlin", "go", "java", "rust", "csharp", "swift"].some((t) => types.has(t)) ? pass("detected typed language") : undefined),
        () => {
          const text = read(s, "tsconfig.json");
          if (text === undefined) return undefined;
          try {
            const parsed: unknown = JSON.parse(text.replace(KODUS_STRIP, ""));
            return isRecord(parsed) && field(parsed, "compilerOptions")?.["strict"] === true ? pass("tsconfig.json") : undefined;
          } catch {
            return undefined;
          }
        },
        () => { const h = anyExists(s, ["mypy.ini", ".mypy.ini"]); return h ? pass(h) : undefined; },
        () => { const h = contains(s, "setup.cfg", ["[mypy]"]); return h ? pass(h) : undefined; },
        () => (exists(s, "pyrightconfig.json") ? pass("pyrightconfig.json") : undefined),
      ]);
    },
  },
  {
    id: "kodus.pre-commit-hooks",
    level: 3,
    evaluate: (s) => {
      const h = anyExists(s, [".husky", ".lefthook.yml", "lefthook.yml", ".pre-commit-config.yaml"]);
      if (h) return pass(h);
      return packageJson(s)?.["lint-staged"] !== undefined ? pass("package.json") : fail;
    },
  },
  { id: "kodus.editorconfig", level: 1, evaluate: (s) => (exists(s, ".editorconfig") ? pass(".editorconfig") : fail) },
  {
    id: "kodus.test-framework",
    level: 2,
    evaluate: (s) =>
      firstHit([
        () => { const h = hasRoot(s, /^((jest|vitest)\.config\..+|pytest\.ini|conftest\.py)$/); return h ? pass(h) : undefined; },
        () => { const h = s.files.find((f) => f.endsWith("_test.go") && notUnder(f, ["node_modules", "vendor"])); return h ? pass(h) : undefined; },
        () => { const h = contains(s, "pyproject.toml", ["[tool.pytest"]); return h ? pass(h) : undefined; },
        () => { const h = contains(s, "build.gradle.kts", ["kotest", "junit", "jupiter", "kotlin.test", 'kotlin("test")', "testImplementation"]); return h ? pass(h) : undefined; },
        () => { const h = contains(s, "build.gradle", ["junit", "jupiter", "kotest", "kotlin.test", "testng", "testImplementation"]); return h ? pass(h) : undefined; },
        () => { const h = contains(s, "pom.xml", ["junit", "testng", "jupiter"]); return h ? pass(h) : undefined; },
        () => (isFile(s, "Cargo.toml") ? pass("Cargo.toml") : undefined),
        () => { const h = csprojContains(s, ["xunit", "nunit", "MSTest", "Microsoft.NET.Test.Sdk"]); return h ? pass(h) : undefined; },
        () => { const h = anyExists(s, [".rspec", "spec"]); return h ? pass(h) : undefined; },
        () => { const h = contains(s, "Gemfile", ["rspec", "minitest"]); return h ? pass(h) : undefined; },
        () => { const h = anyExists(s, ["phpunit.xml", "phpunit.xml.dist"]); return h ? pass(h) : undefined; },
        () => { const h = contains(s, "composer.json", ["phpunit"]); return h ? pass(h) : undefined; },
        () => (isFile(s, "Package.swift") ? pass("Package.swift") : undefined),
      ]),
  },
  {
    id: "kodus.test-files-exist",
    level: 2,
    evaluate: (s) => {
      const patterns: readonly RegExp[] = [
        /(^|\/)[^/]+\.test\.[^/]+$/, /(^|\/)[^/]+\.spec\.[^/]+$/, /(^|\/)test_[^/]*\.py$/, /(^|\/)[^/]*_test\.go$/,
        /(^|\/)[^/]*Test\.kt$/, /(^|\/)[^/]*Tests\.kt$/, /(^|\/)[^/]*Spec\.kt$/, /^src\/test\/.*\.kt$/,
        /(^|\/)[^/]*Test\.java$/, /(^|\/)[^/]*Tests\.java$/, /^src\/test\/.*\.java$/, /^tests\/.*\.rs$/,
        /^src\/(.*\/)?tests\.rs$/, /^src\/(.*\/)?test_[^/]*\.rs$/, /(^|\/)[^/]*Test\.cs$/, /(^|\/)[^/]*Tests\.cs$/,
        /^spec\/(.*\/)?[^/]*_spec\.rb$/, /^test\/(.*\/)?test_[^/]*\.rb$/, /^test\/(.*\/)?[^/]*_test\.rb$/,
        /^tests\/(.*\/)?[^/]*Test\.php$/, /(^|\/)[^/]*Test\.php$/, /^Tests\/(.*\/)?[^/]*Tests\.swift$/, /^Tests\/(.*\/)?[^/]*Test\.swift$/,
      ];
      const ignored = ["node_modules", "vendor", "dist", ".next", "build", "target"];
      const hit = s.files.find((f) => noDotDirs(f) && notUnder(f, ignored) && patterns.some((p) => p.test(f)));
      return hit ? pass(hit) : fail;
    },
  },
  {
    id: "kodus.test-script",
    level: 2,
    evaluate: (s) =>
      firstHit([
        () => (scripts(s)?.["test"] !== undefined ? pass("package.json") : undefined),
        () => { const h = containsI(s, "Makefile", /^test\s*:/m); return h ? pass(h) : undefined; },
        () => { const h = anyExists(s, ["gradlew", "build.gradle.kts", "build.gradle", "mvnw", "pom.xml", "Cargo.toml"]); return h ? pass(h) : undefined; },
        () => { const h = rootSln(s) ?? rootCsproj(s); return h ? pass(h) : undefined; },
        () => (exists(s, "Rakefile") ? pass("Rakefile") : undefined),
        () => {
          const composer = parseObject(read(s, "composer.json"));
          return field(composer, "scripts")?.["test"] !== undefined ? pass("composer.json") : undefined;
        },
        () => (exists(s, "Package.swift") ? pass("Package.swift") : undefined),
      ]),
  },
  {
    id: "kodus.coverage-config",
    level: 4,
    evaluate: (s) =>
      firstHit([
        () => { const h = hasRoot(s, /^(\.coveragerc|\.nycrc(\..+)?)$/); return h ? pass(h) : undefined; },
        () => { const f = firstConfig(s, /^jest\.config\..+$/); return f && contains(s, f, ["coverage"]) ? pass(f) : undefined; },
        () => { const f = firstConfig(s, /^vitest\.config\..+$/); return f && contains(s, f, ["coverage"]) ? pass(f) : undefined; },
        () => { const h = contains(s, "build.gradle.kts", ["jacoco", "kover", "kotlinx-kover"]) ?? contains(s, "build.gradle", ["jacoco"]); return h ? pass(h) : undefined; },
        () => { const h = contains(s, "pom.xml", ["jacoco"]); return h ? pass(h) : undefined; },
        () => { const h = anyExists(s, [".tarpaulin.toml", "tarpaulin.toml"]); return h ? pass(h) : undefined; },
        () => { const h = contains(s, "Cargo.toml", ["cargo-tarpaulin", "cargo-llvm-cov"]); return h ? pass(h) : undefined; },
        () => { const h = csprojContains(s, ["coverlet.collector", "coverlet.msbuild"]); return h ? pass(h) : undefined; },
        () => { const h = contains(s, "Gemfile", ["simplecov"]); return h ? pass(h) : undefined; },
        () => { const h = contains(s, "phpunit.xml", ["<coverage", "<logging"]) ?? contains(s, "phpunit.xml.dist", ["<coverage", "<logging"]); return h ? pass(h) : undefined; },
        () => { const h = contains(s, "composer.json", ["pcov", "xdebug"]); return h ? pass(h) : undefined; },
        () => { const h = workflowFiles(s).find((f) => contains(s, f, ["coverage"]) !== undefined); return h ? pass(h) : undefined; },
      ]),
  },
  {
    id: "kodus.e2e-tests",
    level: 4,
    evaluate: (s) => {
      const h = hasRoot(s, /^(playwright|cypress)\.config\..+$/) ?? anyExists(s, ["cypress", "e2e", "tests/e2e", "integration"]);
      return h ? pass(h) : fail;
    },
  },
  {
    id: "kodus.readme",
    level: 1,
    evaluate: (s) => {
      const f = ["README.md", "readme.md", "Readme.md"].find((p) => isFile(s, p));
      return f !== undefined && (read(s, f) ?? "").length > 500 ? pass(f) : fail;
    },
  },
  {
    id: "kodus.contributing",
    level: 2,
    evaluate: (s) => {
      const h = isFile(s, "CONTRIBUTING.md") ? "CONTRIBUTING.md" : s.files.find((f) => /^docs\/contributing[^/]*$/.test(f));
      return h ? pass(h) : fail;
    },
  },
  {
    id: "kodus.api-docs",
    level: 3,
    evaluate: (s) => {
      const h = hasRoot(s, /^(openapi|swagger)\..+$/) ?? s.files.find((f) => /^docs\/api[^/]*$/.test(f)) ?? anyExists(s, ["jsdoc.json", "typedoc.json"]);
      return h ? pass(h) : fail;
    },
  },
  { id: "kodus.codeowners", level: 3, evaluate: (s) => { const h = anyExists(s, ["CODEOWNERS", ".github/CODEOWNERS"]); return h ? pass(h) : fail; } },
  {
    id: "kodus.ai-context",
    level: 3,
    evaluate: (s) => { const h = anyExists(s, ["CLAUDE.md", ".cursor/rules", ".cursorrules", ".github/copilot-instructions.md"]); return h ? pass(h) : fail; },
  },
  {
    id: "kodus.architecture-docs",
    level: 4,
    evaluate: (s) => {
      const h = s.files.find((f) => /^docs\/architecture[^/]*$/.test(f) || /^docs\/adr\/[^/]+$/.test(f)) ?? anyExists(s, ["ARCHITECTURE.md"]);
      return h ? pass(h) : fail;
    },
  },
  {
    id: "kodus.lock-file",
    level: 1,
    evaluate: (s) => {
      const h = anyFile(s, ["package-lock.json", "bun.lock", "bun.lockb", "yarn.lock", "pnpm-lock.yaml", "uv.lock", "poetry.lock", "Pipfile.lock", "go.sum", "Cargo.lock", "gradle.lockfile", "gradle/verification-metadata.xml", "packages.lock.json", "Gemfile.lock", "composer.lock", "Package.resolved"]);
      return h ? pass(h) : fail;
    },
  },
  {
    id: "kodus.containerization",
    level: 3,
    evaluate: (s) => {
      const h =
        anyExists(s, ["Dockerfile", "docker-compose.yml", "docker-compose.yaml", ".devcontainer"]) ??
        s.files.find((f) => /(^|\/)(Dockerfile|docker-compose\.ya?ml)$/.test(f)) ??
        anyExists(s, ["docker/Dockerfile", "deploy/Dockerfile", ".devcontainer/devcontainer.json"]);
      return h ? pass(h) : fail;
    },
  },
  {
    id: "kodus.env-documentation",
    level: 2,
    evaluate: (s) => { const h = anyExists(s, [".env.example", ".env.template", ".env.sample"]); return h ? pass(h) : fail; },
  },
  {
    id: "kodus.setup-script",
    level: 2,
    evaluate: (s) =>
      firstHit([
        () => { const h = containsI(s, "Makefile", /^(setup|install)\s*:/m); return h ? pass(h) : undefined; },
        () => { const h = s.files.find((f) => /^scripts\/setup[^/]*$/.test(f)); return h ? pass(h) : undefined; },
        () => { const h = anyExists(s, ["gradlew", "mvnw"]); return h ? pass(h) : undefined; },
        () => { const h = rootSln(s); return h ? pass(h) : undefined; },
        () => (exists(s, "Rakefile") ? pass("Rakefile") : undefined),
        () => (scripts(s)?.["dev"] !== undefined ? pass("package.json") : undefined),
      ]),
  },
  {
    id: "kodus.version-pinned",
    level: 2,
    evaluate: (s) => {
      const h = anyFile(s, [".nvmrc", ".node-version", ".python-version", ".tool-versions", ".mise.toml", "go.mod", ".sdkmanrc", ".java-version", "gradle.properties", "rust-toolchain.toml", "rust-toolchain", ".ruby-version", ".php-version", ".swift-version", "global.json"]);
      if (h) return pass(h);
      const pkg = packageJson(s);
      const pm = pkg?.["packageManager"];
      return (typeof pm === "string" && pm.startsWith("bun@")) || typeof field(pkg, "engines")?.["bun"] === "string" ? pass("package.json") : fail;
    },
  },
  {
    id: "kodus.ci-config",
    level: 2,
    evaluate: (s) => { const h = ciFiles(s)[0]; return h ? pass(h) : fail; },
  },
  {
    id: "kodus.ci-runs-tests",
    level: 3,
    evaluate: (s) => {
      const h = ciMatch(s, /\b(npm\s+test|yarn\s+test|pnpm\s+test|bun\s+test|jest|vitest|pytest|go\s+test|make\s+test|npm\s+run\s+test|gradle\s+test|\.\/gradlew\s+test|gradlew\s+test|gradle\s+check|\.\/gradlew\s+check|mvn\s+test|\.\/mvnw\s+test|mvn\s+verify|\.\/mvnw\s+verify|cargo\s+test|dotnet\s+test|bundle\s+exec\s+r(ake|spec)|phpunit|composer\s+test|swift\s+test)\b/i);
      return h ? pass(h) : fail;
    },
  },
  {
    id: "kodus.ci-runs-linters",
    level: 3,
    evaluate: (s) => {
      const h = ciMatch(s, /\b(npm\s+run\s+lint|yarn\s+lint|pnpm\s+lint|bun\s+run\s+lint|eslint|biome\s+check|biome\s+lint|oxlint|oxfmt|ruff\s+check|ruff\s+lint|golangci-lint|make\s+lint|gradle\s+ktlintCheck|\.\/gradlew\s+ktlintCheck|gradle\s+detekt|\.\/gradlew\s+detekt|gradle\s+ktfmtCheck|\.\/gradlew\s+ktfmtCheck|\.\/gradlew\s+spotlessCheck|gradle\s+spotlessCheck|mvn\s+checkstyle|\.\/mvnw\s+checkstyle|mvn\s+pmd|cargo\s+clippy|cargo\s+fmt\s+--check|dotnet\s+format|rubocop|phpstan|psalm|phpcs|swiftlint)\b/i);
      return h ? pass(h) : fail;
    },
  },
  {
    id: "kodus.build-automated",
    level: 3,
    evaluate: (s) =>
      firstHit([
        () => (scripts(s)?.["build"] !== undefined ? pass("package.json") : undefined),
        () => { const h = ciMatch(s, /\b(npm\s+run\s+build|yarn\s+build|pnpm\s+build|bun\s+run\s+build|make\s+build|go\s+build|cargo\s+build|docker\s+build|gradle\s+build|\.\/gradlew\s+build|gradle\s+assemble|\.\/gradlew\s+assemble|mvn\s+package|mvn\s+install|\.\/mvnw\s+package|\.\/mvnw\s+install|mvn\s+compile|python\s+-m\s+build|poetry\s+build|dotnet\s+build|dotnet\s+publish|swift\s+build|xcodebuild)\b/i); return h ? pass(h) : undefined; },
        () => { const h = containsI(s, "Makefile", /^build\s*:/m); return h ? pass(h) : undefined; },
      ]),
  },
  {
    id: "kodus.deploy-pipeline",
    level: 4,
    evaluate: (s) => {
      const h = ciMatch(s, /\b(deploy|deployment|publish|release|cd\s*:)\b/i) ?? anyExists(s, ["vercel.json", "netlify.toml", "fly.toml", "railway.json", "render.yaml", "app.yaml", "serverless.yml", "serverless.yaml", "terraform", "pulumi"]);
      return h ? pass(h) : fail;
    },
  },
  {
    id: "kodus.branch-protection",
    level: 4,
    evaluate: (s) => {
      const first = s.files.find((f) => /^\.github\/branch-protection[^/]*$/.test(f)) ?? anyExists(s, [".github/settings.yml", ".github/settings.yaml"]);
      if (first && containsI(s, first, /branch.?protection|protected.?branch/i)) return pass(first);
      const c = containsI(s, "CONTRIBUTING.md", /branch.?protection|protected.?branch|required.?review/i);
      if (c) return pass(c);
      const settings = containsI(s, ".github/settings.yml", /branches:/i);
      return settings ? pass(settings) : fail;
    },
  },
  {
    id: "kodus.dead-code-detection",
    level: 4,
    evaluate: (s) =>
      firstHit([
        () => { const h = anyExists(s, ["knip.json", "knip.ts", "knip.config.ts", ".knip.json"]) ?? hasRoot(s, /^\.deadcode/); return h ? pass(h) : undefined; },
        () => { const h = ["detekt.yml", ".detekt.yml", "detekt-config.yml"].map((p) => contains(s, p, ["UnusedPrivateMember"])).find((x) => x); return h ? pass(h) : undefined; },
        () => { const h = gradle(s, ["detekt"]); return h ? pass(h) : undefined; },
        () => { const h = contains(s, "pyproject.toml", ["vulture"]) ?? anyExists(s, [".vulture_whitelist.py", "vulture_whitelist.py"]); return h ? pass(h) : undefined; },
        () => { const h = contains(s, "Cargo.toml", ["cargo-udeps"]) ?? csprojContains(s, ["Roslynator"]); return h ? pass(h) : undefined; },
        () => { const h = contains(s, "Gemfile", ["debride", "reek"]) ?? contains(s, "composer.json", ["phpmd"]) ?? contains(s, "pom.xml", ["spotbugs", "findbugs"]); return h ? pass(h) : undefined; },
        () => (scripts(s)?.["knip"] !== undefined ? pass("package.json") : undefined),
        () => { const h = [".eslintrc", ".eslintrc.js", ".eslintrc.cjs", ".eslintrc.json", ".eslintrc.yml", ".eslintrc.yaml"].map((p) => contains(s, p, ["unused-exports"])).find((x) => x); return h ? pass(h) : undefined; },
        () => { const f = firstConfig(s, /^eslint\.config\..+$/); return f && contains(s, f, ["unused-exports"]) ? pass(f) : undefined; },
      ]),
  },
  {
    id: "kodus.bundle-analysis",
    level: 5,
    evaluate: (s) => {
      const tools = ["webpack-bundle-analyzer", "@next/bundle-analyzer", "size-limit", "@size-limit/preset-small-lib", "@size-limit/preset-app", "bundlewatch", "bundlephobia"];
      if (depKeys(s, ["dependencies", "devDependencies"]).some((k) => tools.includes(k))) return pass("package.json");
      const h = anyExists(s, [".size-limit.json", ".size-limit.js", ".size-limit.cjs"]);
      if (h) return pass(h);
      return packageJson(s)?.["size-limit"] !== undefined ? pass("package.json") : fail;
    },
  },
  {
    id: "kodus.license",
    level: 1,
    evaluate: (s) => { const h = anyExists(s, ["LICENSE", "LICENSE.md", "LICENSE.txt", "LICENCE", "LICENCE.md", "LICENCE.txt"]); return h ? pass(h) : fail; },
  },
  {
    id: "kodus.security-scanning",
    level: 4,
    evaluate: (s) => {
      const re = /\b(codeql|snyk|trivy|semgrep|sonarqube|sonarcloud|dependabot|security[_-]scan|sast)\b/i;
      return firstHit([
        () => { const h = workflowFiles(s).find((f) => re.test(read(s, f) ?? "")); return h ? pass(h) : undefined; },
        () => (exists(s, ".snyk") ? pass(".snyk") : undefined),
        () => { const h = containsI(s, ".gitlab-ci.yml", re); return h ? pass(h) : undefined; },
        () => { const h = gradle(s, ["org.owasp.dependencycheck", "dependency-check"]) ?? contains(s, "pom.xml", ["dependency-check", "owasp"]); return h ? pass(h) : undefined; },
        () => (exists(s, ".cargo-audit.toml") ? pass(".cargo-audit.toml") : undefined),
        () => { const h = workflowFiles(s).find((f) => /\bcargo[\s-]audit\b/i.test(read(s, f) ?? "")); return h ? pass(h) : undefined; },
        () => { const h = csprojContains(s, ["Microsoft.CodeAnalysis.NetAnalyzers", "SecurityCodeScan"]); return h ? pass(h) : undefined; },
        () => { const h = contains(s, "Gemfile", ["brakeman", "bundler-audit"]) ?? contains(s, "composer.json", ["roave/security-advisories", "enlightn/security-checker"]); return h ? pass(h) : undefined; },
      ]);
    },
  },
  {
    id: "kodus.secrets-detection",
    level: 4,
    evaluate: (s) =>
      firstHit([
        () => (exists(s, ".gitleaks.toml") ? pass(".gitleaks.toml") : undefined),
        () => { const h = contains(s, ".pre-commit-config.yaml", ["detect-secrets", "gitleaks"]); return h ? pass(h) : undefined; },
        () => { const h = workflowFiles(s).find((f) => /\b(gitleaks|detect-secrets|trufflehog|git-secrets)\b/i.test(read(s, f) ?? "")); return h ? pass(h) : undefined; },
      ]),
  },
  { id: "kodus.security-policy", level: 3, evaluate: (s) => { const h = anyExists(s, ["SECURITY.md", ".github/SECURITY.md"]); return h ? pass(h) : fail; } },
  {
    id: "kodus.dep-update-automation",
    level: 3,
    evaluate: (s) => {
      const h = anyExists(s, [".github/dependabot.yml", ".github/dependabot.yaml", "renovate.json", ".renovaterc", ".renovaterc.json"]) ?? gradle(s, ["com.github.ben-manes.versions", "version-catalog-update"]);
      return h ? pass(h) : fail;
    },
  },
];

const checks: readonly KodusCheck[] = specs.map((c) => ({ ...c, family: "kodus", kind: "binary", title: c.id.slice("kodus.".length) }));

function parseObject(text: string | undefined): Record<string, unknown> | undefined {
  if (text === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(text);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export const kodusChecks: readonly KodusCheck[] = checks;

/** Kodus maturity: a level is reached when 80% of its checks pass and every lower level is reached. */
export function kodusLevel(results: ReadonlyMap<string, Finding>): number {
  let level = 0;
  for (const target of [1, 2, 3, 4, 5] as const) {
    const atLevel = kodusChecks.filter((c) => c.level === target);
    const passed = atLevel.filter((c) => (results.get(c.id)?.value ?? 0) === 1).length;
    if (atLevel.length === 0 || passed / atLevel.length < 0.8) break;
    level = target;
  }
  return level;
}


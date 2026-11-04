/** The files whose text any item reads. Providers fetch exactly these, so every provider sees the same inputs. */
const ROOT_TEXT =
  /^(package\.json|tsconfig\.json|pyproject\.toml|setup\.cfg|tox\.ini|Makefile|makefile|GNUmakefile|justfile|Justfile|\.justfile|Taskfile\.ya?ml|Cargo\.toml|build\.gradle(\.kts)?|pom\.xml|composer\.json|Gemfile|deno\.jsonc?|biome\.jsonc?|(jest|vitest)\.config\..+|eslint\.config\..+|\.eslintrc(\..+)?|phpunit\.xml(\.dist)?|\.pre-commit-config\.yaml|\.?detekt\.yml|detekt-config\.yml|\.aider\.conf\.yml|[^/]+\.csproj|\.gitlab-ci\.yml|\.travis\.yml|Jenkinsfile|azure-pipelines\.yml)$/;
const ROOT_TEXT_I = /^(readme(\.(md|markdown|rst|txt))?|contributing\.md|agents?\.md|claude\.md|gemini\.md|pyproject\.toml|\.openhands)$/i;
const NESTED_TEXT =
  /^(\.github\/workflows\/[^/]+\.ya?ml|\.circleci\/config\.yml|\.github\/settings\.ya?ml|\.github\/branch-protection[^/]*|\.openhands\/setup\.sh|\.claude\/(CLAUDE|AGENTS)\.md)$/i;
const ANY_CSPROJ = /(^|\/)[^/]+\.csproj$/;
const MAX_CSPROJ = 50;
const MAX_WORKFLOWS = 60;

export function wantedTexts(files: readonly string[]): string[] {
  const wanted: string[] = [];
  let csproj = 0;
  let workflows = 0;
  for (const f of files) {
    const root = !f.includes("/");
    if (root && (ROOT_TEXT.test(f) || ROOT_TEXT_I.test(f))) wanted.push(f);
    else if (NESTED_TEXT.test(f)) {
      if (f.startsWith(".github/workflows/") && ++workflows > MAX_WORKFLOWS) continue;
      wanted.push(f);
    } else if (ANY_CSPROJ.test(f) && ++csproj <= MAX_CSPROJ) wanted.push(f);
  }
  return wanted;
}

/** Text over this size is cut; no item reads past the first megabyte of a file. */
export const MAX_TEXT_BYTES = 1 << 20;

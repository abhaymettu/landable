// The page's checker. It runs the same scorer as the CLI in the visitor's browser, so GitHub's anonymous
// API limit is the visitor's own 60 an hour rather than one shared by every caller of the Worker.
import { ITEMS, evaluate } from "../../src/score.js";
import { GitHubError, snapAtCommit } from "./github.js";

const kept = new Set((document.body.dataset["kept"] ?? "").split(" "));
const form = document.getElementById("check") as HTMLFormElement;
const input = document.getElementById("repo") as HTMLInputElement;
const go = document.getElementById("go") as HTMLButtonElement;
const out = document.getElementById("out") as HTMLDivElement;

const el = (tag: string, className: string, ...kids: (Node | string)[]): HTMLElement => {
  const node = document.createElement(tag);
  if (className !== "") node.className = className;
  node.append(...kids);
  return node;
};

async function check(target: string): Promise<HTMLElement[]> {
  const res = await fetch(`/api/head?repo=${encodeURIComponent(target)}`);
  const head = (await res.json()) as { repo: string; commit: string } | { error: string };
  if ("error" in head) return [el("p", "warn", head.error)];
  const [owner = "", repo = ""] = head.repo.split("/");
  const { snapshot } = await snapAtCommit(owner, repo, head.commit, { maxTexts: Infinity, headers: {} });
  const { findings, market } = evaluate(snapshot);
  const line = (id: string): HTMLElement => {
    const item = ITEMS.find((i) => i.id === id);
    const f = findings.get(id);
    const on = (f?.value ?? 0) > 0;
    const value = item?.kind === "binary" ? (on ? "Yes" : "No") : String(f?.value ?? 0);
    return el("li", "", el("span", on ? "yes" : "muted", value), ` ${item?.title ?? id}${f && f.evidence.length > 0 ? `, ${f.evidence.join(", ")}` : ""}`);
  };
  return [
    el("h3", "", `${head.repo} at ${head.commit.slice(0, 7)}`),
    el("p", "muted", "The two items that predicted a merge:"),
    el("ul", "", ...ITEMS.filter((i) => kept.has(i.id)).map((i) => line(i.id))),
    el(
      "p",
      "muted",
      `Market scores, which predicted nothing: Kodus ${Math.round(100 * market.kodusShare)}% of checks, level ${market.kodusLevel}; Agent Friendly Code ${market.afcOverall}.`,
    ),
    el("details", "", el("summary", "", `All ${ITEMS.length} items`), el("ul", "", ...ITEMS.map((i) => line(i.id)))),
  ];
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const target = input.value.trim();
  if (target === "") return;
  go.disabled = true;
  out.dataset["busy"] = "";
  check(target)
    .then((nodes) => out.replaceChildren(...nodes))
    .catch((err: unknown) => out.replaceChildren(el("p", "warn", err instanceof GitHubError ? err.message : "Could not read that repository from GitHub.")))
    .finally(() => {
      go.disabled = false;
      delete out.dataset["busy"];
    });
});

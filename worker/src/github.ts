import { makeSnapshot, type Snapshot } from "../../src/snapshot.js";
import { MAX_TEXT_BYTES, wantedTexts } from "../../src/wanted.js";

/** A free-tier Worker may make 50 outgoing requests per call: one ref lookup, one tree, and up to this many file texts. */
export const MAX_TEXTS = 46;

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export type Fetched = {
  readonly snapshot: Snapshot;
  /** Set when the Worker saw less than the CLI would: a truncated tree, or more wanted texts than it may fetch. */
  readonly partial: { readonly wanted: number; readonly read: number; readonly truncatedTree: boolean } | null;
};

/** The Worker names itself to GitHub; a browser may not set these headers without a CORS preflight that raw.githubusercontent.com refuses. */
export const WORKER_HEADERS = { "user-agent": "landable (github.com/abhaymettu/landable)", "x-github-api-version": "2022-11-28" };
const UA = { "user-agent": WORKER_HEADERS["user-agent"] };
const pkt = (line: string): string => (line.length + 4).toString(16).padStart(4, "0") + line;

/** One git protocol v2 ls-refs call, which spends none of the REST API's anonymous hourly limit. */
export async function resolveCommit(owner: string, repo: string, ref: string | undefined): Promise<string> {
  if (ref !== undefined && /^[0-9a-f]{40}$/.test(ref)) return ref;
  const wanted = ref === undefined ? ["HEAD"] : [`refs/heads/${ref}`, `refs/tags/${ref}`];
  const body = pkt("command=ls-refs\n") + "0001" + wanted.map((w) => pkt(`ref-prefix ${w}\n`)).join("") + "0000";
  const res = await fetch(`https://github.com/${owner}/${repo}.git/git-upload-pack`, {
    method: "POST",
    headers: { ...UA, "content-type": "application/x-git-upload-pack-request", "git-protocol": "version=2" },
    body,
  });
  if (res.status === 401 || res.status === 404) throw new GitHubError(`no public repository ${owner}/${repo}`, 404);
  if (!res.ok) throw new GitHubError(`GitHub answered ${res.status} for ${owner}/${repo}`, 502);
  const refs = new Map([...(await res.text()).matchAll(/([0-9a-f]{40}) (\S+)/g)].map((m) => [m[2], m[1]]));
  for (const w of wanted) {
    const oid = refs.get(w);
    if (oid !== undefined) return oid;
  }
  throw new GitHubError(`no commit for ${ref ?? "HEAD"} in ${owner}/${repo}`, 404);
}

async function listFiles(owner: string, repo: string, commit: string, headers: Record<string, string>): Promise<{ files: string[]; truncated: boolean }> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${commit}?recursive=1`, {
    headers: { ...headers, accept: "application/vnd.github+json" },
  });
  if (res.status === 403 || res.status === 429) {
    throw new GitHubError("GitHub's anonymous API limit (60 an hour per address) is spent. The CLI at github.com/abhaymettu/landable reads any repo without it.", 503);
  }
  if (!res.ok) throw new GitHubError(`GitHub answered ${res.status} for the file tree of ${owner}/${repo}`, 502);
  const body = (await res.json()) as { tree?: { path: string; type: string }[]; truncated?: boolean };
  return { files: (body.tree ?? []).filter((e) => e.type === "blob").map((e) => e.path), truncated: body.truncated === true };
}

/** Same bytes as the CLI's `git cat-file`: cut at MAX_TEXT_BYTES, decoded as UTF-8 with any BOM kept. */
async function readText(owner: string, repo: string, commit: string, path: string, headers: Record<string, string>): Promise<string | undefined> {
  const res = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${commit}/${path.split("/").map(encodeURIComponent).join("/")}`, { headers });
  if (!res.ok) return undefined;
  return new TextDecoder("utf-8", { ignoreBOM: true }).decode(new Uint8Array(await res.arrayBuffer()).subarray(0, MAX_TEXT_BYTES));
}

export async function snapAtCommit(
  owner: string,
  repo: string,
  commit: string,
  { maxTexts, headers }: { readonly maxTexts: number; readonly headers: Record<string, string> },
): Promise<Fetched> {
  const { files, truncated } = await listFiles(owner, repo, commit, headers);
  const wanted = wantedTexts(files);
  const read = [...wanted.filter((p) => !p.includes("/")), ...wanted.filter((p) => p.includes("/"))].slice(0, maxTexts);
  const got = await Promise.all(read.map((p) => readText(owner, repo, commit, p, headers)));
  const texts = new Map<string, string>();
  read.forEach((p, i) => {
    const text = got[i];
    if (text !== undefined) texts.set(p, text);
  });
  const partial = truncated || wanted.length > read.length ? { wanted: wanted.length, read: read.length, truncatedTree: truncated } : null;
  return { snapshot: makeSnapshot({ files, texts }), partial };
}

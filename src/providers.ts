import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { promisify } from "node:util";
import { makeSnapshot, type Snapshot } from "./snapshot.js";
import { MAX_TEXT_BYTES, wantedTexts } from "./wanted.js";

const exec = promisify(execFile);
const git = async (cwd: string, args: readonly string[], input?: string): Promise<string> => {
  if (input === undefined) {
    const { stdout } = await exec("git", [...args], { cwd, maxBuffer: 200 << 20, encoding: "utf8" });
    return stdout;
  }
  return new Promise((resolve, reject) => {
    const child = execFile("git", [...args], { cwd, maxBuffer: 200 << 20, encoding: "buffer" }, (err, stdout) =>
      err ? reject(err) : resolve(stdout.toString("latin1")),
    );
    child.stdin?.end(input);
  });
};

export type Source =
  | { readonly kind: "local"; readonly path: string }
  | { readonly kind: "github"; readonly owner: string; readonly repo: string; readonly ref?: string };

export type Snapped = { readonly snapshot: Snapshot; readonly commit: string | undefined; readonly label: string };

/** Parses `git cat-file --batch` output (latin1 so byte lengths line up) into path -> UTF-8 text. */
function parseBatch(raw: string, paths: readonly string[]): Map<string, string> {
  const texts = new Map<string, string>();
  let at = 0;
  for (const path of paths) {
    const eol = raw.indexOf("\n", at);
    if (eol < 0) break;
    const header = raw.slice(at, eol);
    at = eol + 1;
    const m = /^[0-9a-f]+ blob (\d+)$/.exec(header);
    if (!m?.[1]) continue;
    const size = Number(m[1]);
    const body = Buffer.from(raw.slice(at, at + size), "latin1").subarray(0, MAX_TEXT_BYTES);
    texts.set(path, body.toString("utf8"));
    at += size + 1;
  }
  return texts;
}

async function snapshotFromGit(cwd: string, commit: string): Promise<Snapshot> {
  const listing = await git(cwd, ["ls-tree", "-r", "-z", "--full-tree", commit]);
  const files: string[] = [];
  const oids = new Map<string, string>();
  for (const entry of listing.split("\0")) {
    const m = /^\d+ (blob|commit) ([0-9a-f]+)\t(.+)$/s.exec(entry);
    if (!m?.[1] || !m[2] || !m[3] || m[1] !== "blob") continue;
    files.push(m[3]);
    oids.set(m[3], m[2]);
  }
  const wanted = wantedTexts(files);
  const missing = wanted.map((p) => oids.get(p)).filter((o): o is string => o !== undefined);
  if (missing.length > 0) {
    await git(cwd, ["-c", "fetch.negotiationAlgorithm=noop", "fetch", "-q", "--no-tags", "--no-write-fetch-head", "--filter=blob:none", "origin", ...missing]).catch(() => "");
  }
  const raw = wanted.length > 0 ? await git(cwd, ["cat-file", "--batch"], wanted.map((p) => `${oids.get(p) ?? ""}\n`).join("")) : "";
  return makeSnapshot({ files, texts: parseBatch(raw, wanted) });
}

/** Fetches one commit's trees (no blobs) into a scratch repo, then only the blobs the items read. */
export async function snapshotAtCommit({ url, commit }: { url: string; commit: string }): Promise<Snapshot> {
  const dir = await mkdtemp(join(tmpdir(), "agentready-"));
  try {
    await git(dir, ["init", "-q"]);
    await git(dir, ["remote", "add", "origin", url]);
    await git(dir, ["-c", "protocol.version=2", "fetch", "-q", "--depth=1", "--no-tags", "--filter=blob:none", "origin", commit]);
    return await snapshotFromGit(dir, commit);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function remoteHead(url: string, ref: string | undefined): Promise<string> {
  const out = await git(tmpdir(), ["ls-remote", url, ref ?? "HEAD"]);
  const oid = /^([0-9a-f]{40})\t/m.exec(out)?.[1];
  if (oid === undefined) throw new Error(`no commit for ${ref ?? "HEAD"} at ${url}`);
  return oid;
}

async function walk(root: string): Promise<string[]> {
  const out: string[] = [];
  const visit = async (dir: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await visit(full);
      else if (entry.isFile()) out.push(relative(root, full).split(sep).join("/"));
    }
  };
  await visit(root);
  return out;
}

async function snapshotLocal(path: string): Promise<Snapped> {
  const tracked = await git(path, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"]).catch(() => undefined);
  const files = tracked === undefined ? await walk(path) : tracked.split("\0").filter((f) => f !== "");
  const texts = new Map<string, string>();
  for (const f of wantedTexts(files)) {
    const full = join(path, f);
    const info = await stat(full).catch(() => undefined);
    if (!info?.isFile()) continue;
    texts.set(f, (await readFile(full)).subarray(0, MAX_TEXT_BYTES).toString("utf8"));
  }
  const commit = await git(path, ["rev-parse", "HEAD"]).then((s) => s.trim()).catch(() => undefined);
  return { snapshot: makeSnapshot({ files, texts }), commit, label: path };
}

export async function snap(source: Source): Promise<Snapped> {
  switch (source.kind) {
    case "local":
      return snapshotLocal(source.path);
    case "github": {
      const url = `https://github.com/${source.owner}/${source.repo}.git`;
      const commit = /^[0-9a-f]{40}$/.test(source.ref ?? "") && source.ref !== undefined ? source.ref : await remoteHead(url, source.ref);
      return { snapshot: await snapshotAtCommit({ url, commit }), commit, label: `${source.owner}/${source.repo}` };
    }
    default: {
      const _exhaustive: never = source;
      return _exhaustive;
    }
  }
}

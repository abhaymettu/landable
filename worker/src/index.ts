import { ITEMS, evaluate } from "../../src/score.js";
import checkJs from "../dist/check.txt";
import { GitHubError, MAX_TEXTS, WORKER_HEADERS, resolveCommit, snapAtCommit } from "./github.js";
import { renderPage } from "./page.js";
import report from "./report.json" with { type: "json" };

type KV = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options: { expirationTtl: number }): Promise<void>;
};
type RateLimiter = { limit(options: { key: string }): Promise<{ success: boolean }> };
type Env = { readonly CACHE: KV; readonly LIMITER: RateLimiter };

const DAY = 86_400;
const NAME = /^[\w.-]{1,100}$/;
const studyById = new Map(report.items.map((i) => [i.id, i]));
const html = renderPage(report, ITEMS);

const json = (body: unknown, status = 200, extra: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body, null, 1), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*", ...extra },
  });

function target(url: URL): { owner: string; repo: string; ref: string | undefined } | undefined {
  const [owner, repo, extra] = (url.searchParams.get("repo") ?? "").trim().replace(/^https?:\/\/github\.com\//, "").replace(/(\.git)?\/?$/, "").split("/");
  if (owner === undefined || repo === undefined || extra !== undefined || !NAME.test(owner) || !NAME.test(repo)) return undefined;
  return { owner, repo, ref: url.searchParams.get("ref") ?? undefined };
}

const BAD_TARGET = { error: "pass ?repo=owner/name for a public GitHub repository" };
const limited = async (env: Env, ip: string): Promise<boolean> => !(await env.LIMITER.limit({ key: ip })).success;
const SLOW_DOWN = { error: "ten checks a minute per address; wait a minute" };

/** The page scores in the visitor's browser and asks here only for the commit, which costs no GitHub API call. */
async function head(url: URL, env: Env, ip: string): Promise<Response> {
  const t = target(url);
  if (t === undefined) return json(BAD_TARGET, 400);
  if (await limited(env, ip)) return json(SLOW_DOWN, 429, { "retry-after": "60" });
  try {
    return json({ repo: `${t.owner}/${t.repo}`, commit: await resolveCommit(t.owner, t.repo, t.ref) });
  } catch (err) {
    if (err instanceof GitHubError) return json({ error: err.message }, err.status);
    throw err;
  }
}

async function score(url: URL, env: Env, ip: string): Promise<Response> {
  const t = target(url);
  if (t === undefined) return json(BAD_TARGET, 400);
  if (await limited(env, ip)) return json(SLOW_DOWN, 429, { "retry-after": "60" });
  const { owner, repo, ref } = t;
  try {
    const commit = await resolveCommit(owner, repo, ref);
    const key = `score/v1/${owner.toLowerCase()}/${repo.toLowerCase()}/${commit}`;
    const cached = await env.CACHE.get(key);
    if (cached !== null) return json({ ...JSON.parse(cached), cached: true });
    const fetched = await snapAtCommit(owner, repo, commit, { maxTexts: MAX_TEXTS, headers: WORKER_HEADERS });
    const { findings, market } = evaluate(fetched.snapshot);
    const body = {
      repo: `${owner}/${repo}`,
      commit,
      scoredAt: new Date().toISOString(),
      partial: fetched.partial,
      market,
      items: ITEMS.map((item) => {
        const f = findings.get(item.id);
        const study = studyById.get(item.id);
        return {
          id: item.id,
          family: item.family,
          title: item.title,
          kind: item.kind,
          value: f?.value ?? 0,
          evidence: f?.evidence ?? [],
          study: study === undefined ? null : { status: study.status, oddsRatio: study.or, holdout: study.holdout },
        };
      }),
      note: `Of ${report.tested} items tested on ${report.prs} agent PRs, ${report.retained} predicted a merge on held-out repos; no readiness score, ours or the market's, did. Predicts, not causes: merges reflect maintainers.`,
    };
    await env.CACHE.put(key, JSON.stringify(body), { expirationTtl: DAY }).catch(() => undefined);
    return json({ ...body, cached: false });
  } catch (err) {
    if (err instanceof GitHubError) return json({ error: err.message }, err.status);
    throw err;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "GET" && request.method !== "HEAD") return new Response("GET only", { status: 405 });
    if (url.pathname === "/") return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" } });
    const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
    if (url.pathname === "/api/score") return score(url, env, ip);
    if (url.pathname === "/api/head") return head(url, env, ip);
    if (url.pathname === "/check.js") return new Response(checkJs, { headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "public, max-age=300" } });
    if (url.pathname === "/api/study") return json(report, 200, { "cache-control": "public, max-age=3600" });
    return new Response("not found", { status: 404 });
  },
};

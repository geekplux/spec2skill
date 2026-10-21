// The /api/ai/describe contract, shared by the Worker and the browser (PLAN 5.8, D23): the compact
// summary sent (ids, method/path, capped titles, cluster membership, top edges; never descriptions),
// the hand-written checks for it and for the model's answer, and the cache key both sides compute.
import { canonicalJson, sha256Hex } from '../model/hash';

export const PROMPT_VERSION = 'describe-v1';
export const MAX_SUMMARY_BYTES = 32 * 1024;
export const CAP = { title: 120, name: 32, description: 160, summary: 200, idea: 600 } as const;

export interface AiSummary {
  title: string;
  kind: 'openapi' | 'mcp';
  ops: { id: string; method?: string; path?: string; title?: string }[];
  /** `keep`: the name came from a spec tag, so the model keeps it and only describes the cluster. */
  clusters: { id: string; name: string; keep: boolean; size: number; ops: string[] }[];
  edges: { from: string; to: string; label: string }[];
}

export interface AiDescription {
  clusters: { id: string; name: string; description: string }[];
  prose: { summary: string; idea: string };
}

type Obj = Record<string, unknown>;
const fail = (): never => {
  throw new TypeError('invalid');
};
const obj = (v: unknown): Obj => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Obj) : fail());
const str = (v: unknown, max: number): string => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : fail());
const opt = (v: unknown, max: number) => (v === undefined ? undefined : str(v, max));
const arr = <T>(v: unknown, max: number, each: (item: unknown) => T): T[] => (Array.isArray(v) && v.length <= max ? v.map(each) : fail());
const unique = (ids: string[]) => (new Set(ids).size === ids.length ? ids : fail());

/** The summary rebuilt from known fields only, or undefined when it is malformed, names unknown ids or is over 32 KB. */
export function checkSummary(raw: unknown): AiSummary | undefined {
  try {
    const r = obj(raw);
    const ops = arr(r.ops, 200, (v) => {
      const o = obj(v);
      return { id: str(o.id, 120), method: opt(o.method, 10), path: opt(o.path, 200), title: opt(o.title, CAP.title) };
    });
    const ids = new Set(unique(ops.map((o) => o.id)));
    const known = (id: unknown) => (ids.has(id as string) ? (id as string) : fail());
    const clusters = arr(r.clusters, 80, (v) => {
      const c = obj(v);
      const size = Number.isInteger(c.size) && (c.size as number) > 0 ? (c.size as number) : fail();
      return { id: str(c.id, 120), name: str(c.name, 60), keep: c.keep === true, size, ops: arr(c.ops, 8, known) };
    });
    unique(clusters.map((c) => c.id));
    const edges = arr(r.edges, 20, (v) => {
      const e = obj(v);
      return { from: known(e.from), to: known(e.to), label: str(e.label, 80) };
    });
    const kind = r.kind === 'mcp' || r.kind === 'openapi' ? r.kind : fail();
    const summary: AiSummary = { title: str(r.title, CAP.title), kind, ops, clusters, edges };
    return new TextEncoder().encode(JSON.stringify(summary)).length <= MAX_SUMMARY_BYTES ? summary : undefined;
  } catch {
    return undefined;
  }
}

// Plain text only: no control or format characters, markup, Markdown punctuation or links.
const UNSAFE = /[\p{Cc}\p{Cf}<>`[\]{}|*#\\]|https?:|www\.|:\/\//iu;
const plain = (v: unknown, max: number): string => {
  const text = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';
  return text && text.length <= max && !UNSAFE.test(text) ? text : fail();
};

/** The model's answer (a JSON string or object) if it describes only clusters of `summary`, each at most once, in capped plain text. */
export function checkOutput(raw: unknown, summary: AiSummary): AiDescription | undefined {
  try {
    const r = obj(typeof raw === 'string' ? JSON.parse(raw) : raw);
    const known = new Set(summary.clusters.map((c) => c.id));
    const clusters = arr(r.clusters, known.size, (v) => {
      const c = obj(v);
      const id = known.has(c.id as string) ? (c.id as string) : fail();
      return { id, name: plain(c.name, CAP.name), description: plain(c.description, CAP.description) };
    });
    unique(clusters.map((c) => c.id));
    const prose = obj(r.prose);
    return { clusters, prose: { summary: plain(prose.summary, CAP.summary).replace(/\.$/, '') || fail(), idea: plain(prose.idea, CAP.idea) } };
  } catch {
    return undefined;
  }
}

/** `ai:v1:describe:<sha256(summary + prompt version + model)>`: the KV key, and the browser's localStorage key. */
export const cacheKey = async (summary: AiSummary, model: string): Promise<string> =>
  `ai:v1:describe:${await sha256Hex(canonicalJson(summary) + PROMPT_VERSION + model)}`;

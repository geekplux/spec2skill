// Temporary (phase 1): a flat operation list read straight from a raw
// Swagger 2 / OpenAPI 3 object. Replaced by the normalised model in phase 3.

export interface QuickOp {
  method: string;
  path: string;
  summary: string;
  operationId?: string;
}

const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function quickTitle(spec: unknown): string {
  const info = isRecord(spec) ? spec.info : undefined;
  const title = isRecord(info) ? info.title : undefined;
  return typeof title === 'string' && title.trim() !== '' ? title.trim() : 'Untitled API';
}

/** Lists operations in document order (paths, then methods as written). */
export function quickList(spec: unknown): QuickOp[] {
  const paths = isRecord(spec) ? spec.paths : undefined;
  if (!isRecord(paths)) return [];
  const ops: QuickOp[] = [];
  for (const [path, item] of Object.entries(paths)) {
    if (!isRecord(item)) continue;
    for (const [key, op] of Object.entries(item)) {
      if (!METHODS.includes(key) || !isRecord(op)) continue;
      const summary = typeof op.summary === 'string' ? op.summary : '';
      const entry: QuickOp = { method: key.toUpperCase(), path, summary };
      if (typeof op.operationId === 'string') entry.operationId = op.operationId;
      ops.push(entry);
    }
  }
  return ops;
}

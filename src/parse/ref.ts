// Local `$ref` resolution (JSON pointers into the same document). Cycle-safe: ref chains
// are tracked by ref string and capped at MAX_REF_DEPTH hops; every visited node spends
// from a shared budget so hostile documents (YAML alias fan-out, huge inline schemas)
// stay bounded. External refs are not followed (D18): they produce a warning.
import type { Warning, WarningCode } from '../model/types';
import { isRecord } from '../model/util';

export const MAX_REF_DEPTH = 64;
export const MAX_NODES = 50_000;
const MAX_WARNINGS = 200;

export function encodePointer(segments: readonly string[]): string {
  return `#/${segments.map((s) => s.replace(/~/g, '~0').replace(/\//g, '~1')).join('/')}`;
}

/** `#/a/b~1c` -> ['a', 'b/c']; undefined for external refs and non-pointer fragments. */
export function decodePointer(ref: string): string[] | undefined {
  if (!ref.startsWith('#')) return undefined;
  let fragment: string;
  try {
    fragment = decodeURIComponent(ref.slice(1));
  } catch {
    return undefined;
  }
  if (fragment === '') return [];
  if (!fragment.startsWith('/')) return undefined; // `#anchor` refs are not supported
  return fragment.slice(1).split('/').map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'));
}

export class RefResolver {
  readonly warnings: Warning[] = [];
  private readonly root: unknown;
  private readonly maxNodes: number;
  private nodes = 0;
  private readonly warned = new Set<string>();

  constructor(root: unknown, { maxNodes = MAX_NODES }: { maxNodes?: number } = {}) {
    this.root = root;
    this.maxNodes = maxNodes;
  }

  warn(code: WarningCode, message: string, pointer?: string): void {
    const key = `${code}\u0000${message}`;
    if (this.warned.has(key) || this.warnings.length >= MAX_WARNINGS) return;
    this.warned.add(key);
    this.warnings.push(pointer === undefined ? { code, message } : { code, message, pointer });
  }

  /** Counts one visited node; false once the budget is spent (warns once). */
  spend(): boolean {
    if (++this.nodes <= this.maxNodes) return true;
    this.warn('budget-exceeded', `The document is too large to read fully; stopped after ${this.maxNodes} nodes.`);
    return false;
  }

  get exhausted(): boolean {
    return this.nodes > this.maxNodes;
  }

  /** The value at a local `$ref`, or undefined (with a warning) for external, malformed or missing refs. */
  lookup(ref: string, from?: string): unknown {
    if (!ref.startsWith('#')) {
      this.warn('external-ref', `External $ref "${ref.slice(0, 200)}" is not followed (not supported yet).`, from);
      return undefined;
    }
    const segments = decodePointer(ref);
    let node: unknown = segments ? this.root : undefined;
    for (const segment of segments ?? []) {
      if (Array.isArray(node) && /^(0|[1-9]\d*)$/.test(segment)) node = node[Number(segment)];
      else if (isRecord(node) && Object.hasOwn(node, segment)) node = node[segment];
      else node = undefined;
      if (node === undefined) break;
    }
    if (node === undefined) this.warn('missing-ref', `$ref "${ref.slice(0, 200)}" points at nothing.`, from);
    return node;
  }

  /**
   * Follows a chain of `$ref`s to the first value that is not a ref. `ref` is the last ref
   * followed; `value` is undefined when the chain is external, missing, cyclic or too long.
   */
  deref(value: unknown, from?: string): { value: unknown; ref?: string } {
    let current = value;
    let last: string | undefined;
    const seen = new Set<string>();
    while (isRecord(current) && typeof current.$ref === 'string') {
      const ref = current.$ref;
      if (seen.has(ref) || seen.size >= MAX_REF_DEPTH) {
        this.warn('cyclic-ref', `$ref "${ref.slice(0, 200)}" refers back to itself.`, from);
        return { value: undefined, ref };
      }
      seen.add(ref);
      last = ref;
      if (!this.spend()) return { value: undefined, ref };
      current = this.lookup(ref, from);
    }
    return { value: current, ref: last };
  }
}

// Search for the map and the list view. Pure: a lowercase index built once per model, then
// each keystroke is a scan of short strings (well under a frame for 1000 operations). The Filters
// menu is gone since redesign R4 (DESIGN.md 4): search is the one way to narrow the view.
import type { Edge } from '../graph';
import type { ApiModel } from '../model/types';

export interface SearchIndex { rows: { id: string; text: string }[] }

/** Id, title (summary), path and parameter names, lowercased once per model. */
export function searchIndex(model: ApiModel): SearchIndex {
  return {
    rows: model.operations.map((op) => ({
      id: op.id,
      text: [op.id, op.title, op.path ?? '', ...op.inputs.map((p) => p.name)].join('\n').toLowerCase(),
    })),
  };
}

/** The operations matching every word of `q`; null when nothing narrows. */
export function matches(index: SearchIndex, q: string): Set<string> | null {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  return new Set(index.rows.filter((r) => words.every((w) => r.text.includes(w))).map((r) => r.id));
}

/** An edge is listed and counted as shown when at least one end matches. */
export const edgeShown = (e: Edge, match: Set<string> | null): boolean => !match || match.has(e.from) || match.has(e.to);

// The skill pane's file tree as the rows on screen (pure): anatomy order at the top level, folders
// first below it, and what each tree key does (WAI-ARIA tree pattern).
import type { FileTree } from '../skillgen/types';

export interface Row {
  /** File path, or folder path ending in `/`. */
  path: string;
  name: string;
  level: number;
  folder: boolean;
  open: boolean;
  /** Files under a folder (any depth). */
  files: number;
  /** Position among siblings (aria-posinset / aria-setsize). */
  pos: number;
  size: number;
}

const ORDER = ['SKILL.md', 'kit/', 'references/', 'examples/', 'scripts/', 'evals/', 'ci/', 'README.md'];
const rank = (name: string) => (ORDER.includes(name) ? ORDER.indexOf(name) : ORDER.length);

/** The folders containing `path`: `examples/a/run.mjs` -> `examples/`, `examples/a/`. */
export const ancestors = (path: string): string[] =>
  path.split('/').slice(0, -1).map((_, i, parts) => `${parts.slice(0, i + 1).join('/')}/`);

export const parentOf = (path: string): string => path.replace(/[^/]+\/?$/, '');

/** The visible rows for `paths` with the folders in `open` expanded. */
export function treeRows(paths: string[], open: ReadonlySet<string>): Row[] {
  const out: Row[] = [];
  const walk = (prefix: string, level: number) => {
    const files = new Map<string, number>();
    for (const p of paths.filter((x) => x.startsWith(prefix))) {
      const rest = p.slice(prefix.length);
      const name = rest.includes('/') ? rest.slice(0, rest.indexOf('/') + 1) : rest;
      files.set(name, (files.get(name) ?? 0) + (name.endsWith('/') ? 1 : 0));
    }
    const kids = [...files.keys()].toSorted((a, b) =>
      (level === 1 ? rank(a) - rank(b) : 0) || Number(b.endsWith('/')) - Number(a.endsWith('/')) || a.localeCompare(b));
    kids.forEach((name, i) => {
      const path = prefix + name;
      const folder = name.endsWith('/');
      out.push({ path, name, level, folder, open: folder && open.has(path), files: files.get(name)!, pos: i + 1, size: kids.length });
      if (folder && open.has(path)) walk(path, level + 1);
    });
  };
  walk('', 1);
  return out;
}

export interface TreeAction { focus?: number; open?: string; close?: string; select?: string }

/** What `key` does on row `i`: move focus, open or close a folder, or select a file. */
export function treeKey(rows: Row[], i: number, key: string): TreeAction | null {
  const row = rows[i];
  if (!row) return null;
  if (key === 'ArrowDown') return { focus: Math.min(i + 1, rows.length - 1) };
  if (key === 'ArrowUp') return { focus: Math.max(i - 1, 0) };
  if (key === 'Home') return { focus: 0 };
  if (key === 'End') return { focus: rows.length - 1 };
  if (key === 'ArrowRight') return row.folder ? (row.open ? { focus: i + 1 } : { open: row.path }) : null;
  if (key === 'ArrowLeft') {
    if (row.open) return { close: row.path };
    const up = rows.findIndex((r) => r.path === parentOf(row.path));
    return up < 0 ? null : { focus: up };
  }
  if (key === 'Enter' || key === ' ') return row.folder ? (row.open ? { close: row.path } : { open: row.path }) : { select: row.path };
  return null;
}

/** The reference page that documents operation `id` (its `## \`id\`` heading). */
export const opFile = (tree: FileTree, id: string): string | undefined =>
  Object.keys(tree).find((p) => p.startsWith('references/') && tree[p]!.includes(`\n## \`${id}\`\n`));

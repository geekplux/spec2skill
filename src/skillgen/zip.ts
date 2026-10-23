// The downloadable skill: every file under `<slug>/` in a zip with fixed timestamps, so the same
// tree always gives the same bytes. Paths are re-checked before anything is packed (S3).
import { strToU8, zipSync } from 'fflate';
import { assertSafePaths, kebab } from './sanitize';
import type { FileTree } from './types';

/** Local-time fields, so the DOS timestamp is the same in every time zone. */
const MTIME = new Date(2026, 0, 1, 12, 0, 0);

export function zipSkill(slug: string, tree: FileTree): Uint8Array {
  const root = kebab(slug) || 'skill';
  const paths = Object.keys(tree).toSorted();
  assertSafePaths(paths);
  return zipSync(Object.fromEntries(paths.map((p) => [`${root}/${p}`, strToU8(tree[p]!)])), { level: 6, mtime: MTIME });
}

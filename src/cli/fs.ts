// Writes a generated skill to `<target>/` (S3): refuses a non-empty target unless forced, re-checks
// every path so nothing lands outside the target (no `..`, no absolute paths, no symlinked folders),
// and marks the runnable scripts executable.
import { chmodSync, lstatSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { assertSafePaths } from '../skillgen/sanitize';
import type { FileTree } from '../skillgen/types';

/** A reason the skill was not written (the target is in use or unsafe). */
export class WriteError extends Error {}

const EXECUTABLE = /^(scripts\/[^/]+\.mjs|examples\/[^/]+\/run\.mjs)$/;

const kindOf = (path: string) => {
  try {
    const s = lstatSync(path);
    return s.isSymbolicLink() ? 'link' : s.isDirectory() ? 'dir' : 'file';
  } catch {
    return 'none';
  }
};

/** The absolute file for `path` under `target`, or throw if it could escape it. */
export function insideTarget(target: string, path: string): string {
  const file = resolve(target, path);
  const rel = relative(target, file);
  if (!rel || rel.startsWith('..') || isAbsolute(rel) || rel !== path.split('/').join(sep)) throw new WriteError(`refusing to write outside ${target}: ${JSON.stringify(path)}`);
  return file;
}

export function writeTree(target: string, tree: FileTree, force = false): string[] {
  const paths = Object.keys(tree).toSorted();
  assertSafePaths(paths);
  const files = paths.map((p) => insideTarget(target, p));
  const kind = kindOf(target);
  if (kind === 'file' || kind === 'link') throw new WriteError(`${target} exists and is not a directory`);
  if (kind === 'dir' && readdirSync(target).length && !force) throw new WriteError(`${target} is not empty; pick another --out or pass --force to overwrite`);
  if (kind === 'none') mkdirSync(target, { recursive: true });
  paths.forEach((path, i) => {
    let dir = target;
    for (const part of path.split('/').slice(0, -1)) {
      dir = join(dir, part);
      const k = kindOf(dir);
      if (k === 'none') mkdirSync(dir, { recursive: true });
      else if (k !== 'dir') throw new WriteError(`${dir} is in the way (not a plain directory)`);
    }
    if (kindOf(files[i]!) === 'link') throw new WriteError(`${files[i]} is a symbolic link; not overwriting it`);
    writeFileSync(files[i]!, tree[path]!);
    if (EXECUTABLE.test(path)) chmodSync(files[i]!, 0o755);
  });
  return files;
}

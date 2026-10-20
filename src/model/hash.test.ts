import { describe, expect, it } from 'vitest';
import tasksText from '../../samples/tasks-openapi31.yaml?raw';
import { parseText } from '../parse/text';
import { canonicalJson, hashModel, sha256Hex } from './hash';
import { buildOpenApi3, normaliseOpenApi3 } from './openapi3';

/** Deep copy with every object's keys in reverse order (arrays keep their order). */
function shuffleKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(shuffleKeys);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(Object.keys(value).toReversed().map((k) => [k, shuffleKeys((value as Record<string, unknown>)[k])]));
}

describe('canonicalJson and sha256Hex', () => {
  it('sorts keys, drops undefined and is whitespace-free', () => {
    expect(canonicalJson({ b: 1, a: [true, null, { d: undefined, c: 'x' }], e: undefined })).toBe('{"a":[true,null,{"c":"x"}],"b":1}');
    expect(canonicalJson({ y: 1, x: 2 })).toBe(canonicalJson({ x: 2, y: 1 }));
  });

  it('hashes with SHA-256', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('model hash', () => {
  const doc = parseText(tasksText).value;

  it('is stable across runs and key orders, and ignores source.url', async () => {
    const first = await normaliseOpenApi3(doc);
    const again = await normaliseOpenApi3(parseText(tasksText).value, { url: 'https://elsewhere.example.com/spec.yaml' });
    const shuffled = await normaliseOpenApi3(shuffleKeys(doc));
    expect(Object.keys(shuffleKeys(doc) as object)[0]).not.toBe(Object.keys(doc)[0]);
    expect(again.hash).toBe(first.hash);
    expect(shuffled.hash).toBe(first.hash);
  });

  it('changes when an operation changes', async () => {
    const base = buildOpenApi3(doc);
    const changed = structuredClone(base);
    changed.operations[0]!.title = 'Edit a comment (v2)';
    expect(await hashModel(changed)).not.toBe(await hashModel(base));
  });
});

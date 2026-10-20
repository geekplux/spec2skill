import { describe, expect, it } from 'vitest';
import { RefResolver, decodePointer, encodePointer } from './ref';

const doc = {
  components: {
    schemas: { 'a/b': { type: 'string' }, 'm~n': { type: 'integer' }, Chain: { $ref: '#/components/schemas/a~1b' } },
    loop: { x: { $ref: '#/components/loop/y' }, y: { $ref: '#/components/loop/x' } },
  },
  list: [{ $ref: '#/list/0' }, 'second'],
};

describe('JSON pointers', () => {
  it('round-trips escaped segments and rejects non-local refs', () => {
    expect(encodePointer(['paths', '/pets/{id}', 'get'])).toBe('#/paths/~1pets~1{id}/get');
    expect(decodePointer('#/paths/~1pets~1%7Bid%7D/get')).toEqual(['paths', '/pets/{id}', 'get']);
    expect(decodePointer('#/components/schemas/m~0n')).toEqual(['components', 'schemas', 'm~n']);
    expect(decodePointer('#')).toEqual([]);
    expect(decodePointer('other.yaml#/a')).toBeUndefined();
    expect(decodePointer('#anchor')).toBeUndefined();
  });
});

describe('RefResolver', () => {
  it('looks up and follows ref chains', () => {
    const r = new RefResolver(doc);
    expect(r.lookup('#/list/1')).toBe('second');
    expect(r.deref({ $ref: '#/components/schemas/Chain' })).toEqual({ value: { type: 'string' }, ref: '#/components/schemas/a~1b' });
    expect(r.deref('plain')).toEqual({ value: 'plain', ref: undefined });
    expect(r.warnings).toEqual([]);
  });

  it('terminates on cycles and self-references with a warning', () => {
    const r = new RefResolver(doc);
    expect(r.deref({ $ref: '#/components/loop/x' }).value).toBeUndefined();
    expect(r.deref({ $ref: '#/list/0' }).value).toBeUndefined();
    expect(r.warnings.map((w) => w.code)).toEqual(['cyclic-ref', 'cyclic-ref']);
  });

  it('does not follow external refs or prototype keys', () => {
    const r = new RefResolver(doc);
    expect(r.deref({ $ref: 'https://example.com/x.json#/A' }, '#/p')).toEqual({ value: undefined, ref: 'https://example.com/x.json#/A' });
    expect(r.lookup('#/components/constructor')).toBeUndefined();
    expect(r.lookup('#/list/01')).toBeUndefined();
    expect(r.warnings.map((w) => [w.code, w.pointer])).toEqual([['external-ref', '#/p'], ['missing-ref', undefined], ['missing-ref', undefined]]);
  });

  it('stops when the node budget is spent and warns once', () => {
    const r = new RefResolver(doc, { maxNodes: 2 });
    expect([r.spend(), r.spend(), r.spend(), r.spend()]).toEqual([true, true, false, false]);
    expect(r.exhausted).toBe(true);
    expect(r.warnings.map((w) => w.code)).toEqual(['budget-exceeded']);
  });
});

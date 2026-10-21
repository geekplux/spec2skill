import { describe, expect, it } from 'vitest';
import { readUrl, writeUrl } from './url';

const BASE = 'https://example.test/';

describe('readUrl', () => {
  it('reads sample, view, q and #op=', () => {
    expect(readUrl(`${BASE}?sample=petstore&view=list&q=pet%20id#op=getPetById`)).toEqual({ sample: 'petstore', view: 'list', q: 'pet id', op: 'getPetById' });
  });
  it('ignores unknown views, empty values and malformed hashes', () => {
    expect(readUrl(`${BASE}?view=grid&sample=#op=%E0%A4%A`)).toEqual({ sample: undefined, view: undefined, q: '', op: undefined });
    expect(readUrl(BASE)).toEqual({ sample: undefined, view: undefined, q: '', op: undefined });
  });
});

describe('writeUrl', () => {
  it('sets and removes parameters, keeps others, encodes the hash', () => {
    const href = writeUrl(`${BASE}?url=x&view=map#op=a`, { sample: 'tasks', view: 'list', q: 'a b', op: 'get task' });
    expect(href).toBe(`${BASE}?url=x&view=list&sample=tasks&q=a+b#op=get%20task`);
    expect(writeUrl(href, { q: '' })).toBe(`${BASE}?url=x`);
  });
  it('round-trips', () => {
    const state = { sample: 'filesystem', view: 'map' as const, q: 'read file', op: 'read_text_file' };
    expect(readUrl(writeUrl(BASE, state))).toEqual(state);
  });
});

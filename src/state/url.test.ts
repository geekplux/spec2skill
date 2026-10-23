import { describe, expect, it } from 'vitest';
import { canonicalUrl, readUrl, writeUrl } from './url';

const BASE = 'https://example.test/';

describe('readUrl', () => {
  it('reads sample, view, q and #op=', () => {
    expect(readUrl(`${BASE}?sample=petstore&view=list&q=pet%20id#op=getPetById`)).toEqual({ sample: 'petstore', view: 'list', q: 'pet id', op: 'getPetById' });
  });
  it('reads ?url= (a loaded spec URL)', () => {
    expect(readUrl(`${BASE}?url=https%3A%2F%2Fspecs.example.test%2Ftasks.yaml`).url).toBe('https://specs.example.test/tasks.yaml');
  });
  it('ignores unknown views, empty values and malformed hashes', () => {
    expect(readUrl(`${BASE}?view=grid&sample=#op=%E0%A4%A`)).toEqual({ sample: undefined, url: undefined, view: undefined, q: '', op: undefined });
    expect(readUrl(BASE)).toEqual({ sample: undefined, url: undefined, view: undefined, q: '', op: undefined });
  });
});

describe('writeUrl', () => {
  it('sets and removes parameters, keeps others, encodes the hash', () => {
    const href = writeUrl(`${BASE}?keep=x&view=map#op=a`, { sample: 'tasks', view: 'list', q: 'a b', op: 'get task' });
    expect(href).toBe(`${BASE}?keep=x&view=list&sample=tasks&q=a+b#op=get%20task`);
    expect(writeUrl(href, { q: '' })).toBe(`${BASE}?keep=x`);
    expect(writeUrl(href, { q: '', url: 'https://a.test/x.json' })).toBe(`${BASE}?keep=x&url=https%3A%2F%2Fa.test%2Fx.json`);
  });
  it('round-trips', () => {
    const state = { sample: 'filesystem', url: 'https://a.test/openapi.yaml', view: 'map' as const, q: 'read file', op: 'read_text_file' };
    expect(readUrl(writeUrl(BASE, state))).toEqual(state);
  });
});

const known = (id: string) => ['tasks', 'petstore'].includes(id);
describe('canonicalUrl', () => {
  it('names the sample shown and drops unknown views', () => {
    expect(canonicalUrl(`${BASE}?sample=nope&view=bogus&q=x#op=a`, known, 'tasks')).toBe(`${BASE}?sample=tasks&q=x#op=a`);
    expect(canonicalUrl(`${BASE}?sample=&view=`, known, 'tasks')).toBe(`${BASE}?sample=tasks`);
  });
  it('leaves valid and absent parameters alone', () => {
    const href = `${BASE}?sample=petstore&view=list#op=getPetById`;
    expect(canonicalUrl(href, known, 'tasks')).toBe(href);
    expect(canonicalUrl(BASE, known, 'tasks')).toBe(BASE);
  });
});

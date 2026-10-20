import { describe, expect, it } from 'vitest';
import { DEFAULT_SAMPLE_ID, SAMPLES, getSample } from './index';
import { quickList, quickTitle } from './quick-list';

describe('sample registry', () => {
  it('has a loadable default sample', () => {
    expect(getSample(DEFAULT_SAMPLE_ID)).toBeDefined();
    expect(getSample('nope')).toBeUndefined();
    expect(new Set(SAMPLES.map((s) => s.id)).size).toBe(SAMPLES.length);
  });

  it('petstore is trimmed to the pet and user tags (no store/order)', () => {
    const spec = getSample('petstore')!.load() as {
      tags: { name: string }[];
      definitions: Record<string, unknown>;
    };
    expect(quickTitle(spec)).toBe('Swagger Petstore');
    expect(spec.tags.map((t) => t.name)).toEqual(['pet', 'user']);
    expect(Object.keys(spec.definitions)).not.toContain('Order');
    const ops = quickList(spec);
    expect(ops).toHaveLength(16);
    expect(ops.some((op) => op.path.startsWith('/store'))).toBe(false);
    expect(ops).toContainEqual(expect.objectContaining({ method: 'GET', path: '/pet/{petId}' }));
  });
});

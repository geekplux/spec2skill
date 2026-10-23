import { describe, expect, it } from 'vitest';
import { DEFAULT_SAMPLE_ID, SAMPLES, getSample, sampleModel } from './index';

describe('sample registry', () => {
  it('has tasks (default), petstore and filesystem', () => {
    expect(SAMPLES.map((s) => `${s.id}:${s.kind}`)).toEqual(['tasks:openapi3', 'petstore:swagger2', 'filesystem:mcp']);
    expect(DEFAULT_SAMPLE_ID).toBe('tasks');
    expect(getSample('nope')).toBeUndefined();
  });

  it('every sample normalises, with its kind, once per session', async () => {
    const counts: Record<string, number> = {};
    for (const sample of SAMPLES) {
      const model = await sampleModel(sample);
      expect(model.source.kind).toBe(sample.kind);
      expect(sampleModel(sample)).toBe(sampleModel(sample));
      counts[sample.id] = model.operations.length;
    }
    expect(counts).toEqual({ tasks: 22, petstore: 16, filesystem: 14 });
  });

  it('petstore is trimmed to the pet and user tags (no store/order)', async () => {
    const spec = getSample('petstore')!.load() as { tags: { name: string }[]; definitions: Record<string, unknown> };
    expect(spec.tags.map((t) => t.name)).toEqual(['pet', 'user']);
    expect(Object.keys(spec.definitions)).not.toContain('Order');
    const model = await sampleModel(getSample('petstore')!);
    expect(model.operations.some((op) => op.path!.startsWith('/store'))).toBe(false);
  });
});

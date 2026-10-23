import { describe, expect, it } from 'vitest';
import type { ApiModel, Operation } from '../model/types';
import { buildGraph } from './index';
import { counted, singular, words } from './words';

const tool = (id: string, extra: Partial<Operation> = {}): Operation => ({
  id, kind: 'tool', title: id, tags: [], inputs: [], responses: [], security: [], hints: {}, ...extra,
});
const mcpModel = (operations: Operation[]): ApiModel => ({
  hash: 'x', source: { kind: 'mcp', specVersion: '2025-06-18', title: 't' }, servers: [], auth: [], operations, schemas: {}, warnings: [],
});

describe('words and singular', () => {
  it('counts with the noun in agreement', () => {
    expect(counted(1, 'relationship')).toBe('1 relationship');
    expect(counted(0, 'relationship')).toBe('0 relationships');
    expect(counted(85, 'relationship')).toBe('85 relationships');
    expect(counted(1, 'directory', 'directories')).toBe('1 directory');
    expect(counted(2, 'directory', 'directories')).toBe('2 directories');
  });
  it('splits snake, kebab and camel case', () => {
    expect(words('list_directory_with_sizes')).toEqual(['list', 'directory', 'with', 'sizes']);
    expect(words('getPetById')).toEqual(['get', 'pet', 'by', 'id']);
    expect(words('userID')).toEqual(['user', 'id']);
    expect(words('HTMLParser-v2')).toEqual(['html', 'parser', 'v2']);
  });

  it('singularises with a small rule table', () => {
    const cases = { directories: 'directory', files: 'file', classes: 'class', boxes: 'box', statuses: 'status', status: 'status', databases: 'database', pets: 'pet', bus: 'bus', analysis: 'analysis' };
    for (const [plural, one] of Object.entries(cases)) expect(singular(plural)).toBe(one);
  });
});

describe('clusters and crud', () => {
  it('merges untagged single-operation clusters into Other only above 12 clusters', () => {
    const nouns = 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu'.split(' ');
    const twelve = buildGraph(mcpModel(nouns.map((n) => tool(`get_${n}`))));
    expect(twelve.clusters).toHaveLength(12);
    const thirteen = buildGraph(mcpModel([...nouns, 'nu'].map((n) => tool(`get_${n}`)).concat(tool('list_alphas'))));
    expect(thirteen.clusters.map((c) => c.name)).toEqual(['Alpha', 'Other']);
    expect(thirteen.clusters[1]!.operationIds).toHaveLength(12);
  });

  it('uses annotations when a tool has no known verb, and keeps hostile ids as plain data', () => {
    const g = buildGraph(mcpModel([tool('__proto__', { hints: { readOnly: true } }), tool('constructor'), tool('purge_cache', { hints: { destructive: true } })]));
    expect(Object.entries(g.crud)).toEqual([['__proto__', 'read'], ['constructor', 'action'], ['purge_cache', 'action']]);
    expect(Object.getPrototypeOf(g.crud)).toBe(Object.prototype);
  });

  it('keeps at most 6 incoming feeds, exact before inferred', () => {
    const path = { name: 'path', in: 'argument' as const, required: true, schema: { type: 'string' } };
    const listers = Array.from({ length: 8 }, (_, i) => tool(`list_thing${i}`, { hints: { readOnly: true } }));
    const g = buildGraph(mcpModel([...listers, tool('read_thing', { inputs: [path] })]));
    const into = g.edges.filter((e) => e.to === 'read_thing');
    expect(into.map((e) => e.from)).toEqual(listers.slice(0, 6).map((op) => op.id));
  });
});

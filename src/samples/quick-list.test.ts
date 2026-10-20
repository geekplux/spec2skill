import { describe, expect, it } from 'vitest';
import { quickList, quickTitle } from './quick-list';

describe('quickList', () => {
  it('lists operations in document order with upper-case methods', () => {
    const spec = {
      paths: {
        '/a': { get: { summary: 'List a', operationId: 'listA' }, post: {} },
        '/a/{id}': { parameters: [], delete: { summary: 'Delete a' } },
      },
    };
    expect(quickList(spec)).toEqual([
      { method: 'GET', path: '/a', summary: 'List a', operationId: 'listA' },
      { method: 'POST', path: '/a', summary: '' },
      { method: 'DELETE', path: '/a/{id}', summary: 'Delete a' },
    ]);
  });

  it('ignores non-method keys and malformed input', () => {
    expect(quickList({ paths: { '/x': { summary: 'x', servers: [], $ref: '#/y' } } })).toEqual([]);
    expect(quickList(null)).toEqual([]);
    expect(quickList({ paths: [] })).toEqual([]);
    expect(quickList({ paths: { '/x': null, '/y': { get: 'nope' } } })).toEqual([]);
  });
});

describe('quickTitle', () => {
  it('reads info.title, with a fallback', () => {
    expect(quickTitle({ info: { title: ' Pets ' } })).toBe('Pets');
    expect(quickTitle({ info: {} })).toBe('Untitled API');
    expect(quickTitle('x')).toBe('Untitled API');
  });
});

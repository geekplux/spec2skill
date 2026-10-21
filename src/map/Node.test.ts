import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Cluster } from '../graph';
import type { LayoutNode } from '../layout/layout';
import { Summary } from './Node';

describe('Summary', () => {
  it('names the cluster and its count; "collapsed" is left to aria-expanded', () => {
    const node = { id: 'summary:facets', cluster: 'facets', x: 0, y: 0, w: 200, h: 44, depth: 0, column: 0, summary: true } as unknown as LayoutNode;
    const cluster = { id: 'facets', name: 'Facets', operationIds: ['listFacets', 'getFacet'] } as unknown as Cluster;
    const html = renderToStaticMarkup(createElement('svg', null, createElement(Summary, { node, cluster, crud: { listFacets: 'list', getFacet: 'read' }, noun: 'operations', tabbable: true })));
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-label="Facets cluster: 2 operations, list, read. Enter expands it."');
    expect(html).not.toMatch(/aria-label="[^"]*collapsed/i);
  });
});

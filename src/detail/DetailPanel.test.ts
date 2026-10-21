import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { buildGraph } from '../graph';
import { normalise } from '../model/normalise';
import { getSample, sampleModel } from '../samples';
import hostile from './__fixtures__/hostile-strings.json';
import { DetailPanel } from './DetailPanel';

const render = async (model: Awaited<ReturnType<typeof normalise>>, id: string) =>
  renderToStaticMarkup(createElement(DetailPanel, { model, graph: buildGraph(model), op: model.operations.find((o) => o.id === id)!, onGo: () => {}, onClose: () => {}, announce: () => {} }));

describe('DetailPanel', () => {
  it('shows inputs, output fields, auth, related operations and the example for getTask', async () => {
    const html = await render(await sampleModel(getSample('tasks')!), 'getTask');
    expect(html).toContain('<code>GET /tasks/{taskId}</code>');
    expect(html).toMatch(/<td><code>taskId<\/code><\/td><td>path<\/td><td><code>string<\/code><\/td><td>yes<\/td>/);
    expect(html).toContain('Output <code>Task</code>');
    expect(html).toContain('<code>assigneeId</code>');
    expect(html).toContain('<code>bearerAuth</code>: http bearer JWT');
    expect(html).toMatch(/<div role="group" aria-labelledby="([^"]+)"><h4 id="\1">Fed by<\/h4><ul class="related"><li><button[^>]*>GET \/projects\/\{projectId\}\/tasks<\/button> via <code>id -&gt; taskId<\/code>/);
    expect(html).toContain('curl &#x27;https://tasks.example.com/v1/tasks/&lt;taskId&gt;&#x27;');
  });

  it('renders spec strings as literal text, never markup (S3)', async () => {
    const html = await render(await normalise(hostile), 'getThing');
    expect(html).toContain('&lt;script&gt;alert(&#x27;summary&#x27;)&lt;/script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(&#x27;description&#x27;)&gt;\nSecond line');
    expect(html).toContain('&lt;svg onload=alert(1)&gt;');
    expect(html).not.toMatch(/<(script|img|svg|i)\b/);
  });
});

describe('S3: no raw HTML injection anywhere in src/', () => {
  it('never uses dangerouslySetInnerHTML or innerHTML', () => {
    const sources = import.meta.glob<string>(['../**/*.{ts,tsx}', '!../**/*.test.ts'], { query: '?raw', import: 'default', eager: true });
    expect(Object.keys(sources).length).toBeGreaterThan(30);
    expect(Object.keys(sources).filter((f) => /dangerouslySetInnerHTML|\.innerHTML\s*=/.test(sources[f]!))).toEqual([]);
  });
});

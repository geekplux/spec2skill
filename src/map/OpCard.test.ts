// The operation card (redesign R4), which replaces the detail panel: these are the detail panel's
// checks (inputs, output, auth, related operations, example, "In skill", S3), moved to the card.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { buildGraph } from '../graph';
import { normalise } from '../model/normalise';
import { getSample, sampleModel } from '../samples';
import hostile from './__fixtures__/hostile-strings.json';
import { OpCard, opLinks } from './OpCard';

type Model = Awaited<ReturnType<typeof normalise>>;
const markup = (model: Model, id: string, pinned: boolean, inSkill?: string) =>
  renderToStaticMarkup(createElement(OpCard, {
    model, graph: buildGraph(model), op: model.operations.find((o) => o.id === id)!, pinned, inSkill, onInSkill: () => {},
    onGo: () => {}, onClose: () => {}, announce: () => {},
  }));
/** The markup without the word-boundary <wbr>s (src/design/breaks.tsx), so assertions read the plain ids. */
const render = (...args: Parameters<typeof markup>) => markup(...args).replaceAll('<wbr/>', '');

describe('OpCard', () => {
  it('previews getTask as V2Hover draws it: method and path, title, Input, Output, Fed by, Feeds, In skill', async () => {
    const html = render(await sampleModel(getSample('tasks')!), 'getTask', false, 'references/tasks.md');
    expect(html).toMatch(/^<div class="op-card" data-testid="op-preview" aria-hidden="true">/);
    expect(html).toContain('<p class="oc-path mono">GET /tasks/{taskId}</p>');
    expect(html).toMatch(/<h3 class="oc-title" id="[^"]+"><span class="visually-hidden">GET \/tasks\/\{taskId\}, <\/span>Get a task<\/h3>/);
    expect(html).toContain('<dt>Input</dt><dd><span class="oc-input"><span class="mono">taskId</span> <span class="muted">path, string, required</span></span></dd>');
    expect(html).toContain('<dt>Output</dt><dd><span class="mono">Task</span></dd>');
    expect(html).toMatch(/<dt>Fed by<\/dt><dd><span class="mono">listTasks<\/span>, <span class="mono">createTask<\/span>/);
    expect(html).toMatch(/<dt>Feeds<\/dt><dd><span class="mono">getProject<\/span>/);
    expect(html).toMatch(/<dt>Shares schema<\/dt><dd><span><span class="mono">Task<\/span> <span class="muted">with<\/span> /);
    expect(html).toContain('<dt>Sub-paths</dt><dd><span class="mono">listComments</span>');
    // The preview takes no focus and leaves the pinned card's extras out.
    expect(html).toContain('<button type="button" class="oc-ref mono" tabindex="-1" aria-label="Show references/tasks.md in the skill">references/tasks.md</button>');
    expect(html).not.toMatch(/Close|Copy example|bearerAuth|role="dialog"|<button type="button" class="oc-link/);
    // Ids, paths and file names wrap only at their word boundaries.
    const raw = markup(await sampleModel(getSample('tasks')!), 'getTask', false, 'references/tasks.md');
    expect(raw).toContain('<p class="oc-path mono">GET /<wbr/>tasks/<wbr/>{task<wbr/>Id}</p>');
    expect(raw).toContain('<span class="mono">list<wbr/>Tasks</span>');
    expect(raw).toContain('aria-label="Show references/tasks.md in the skill">references/<wbr/>tasks.md</button>');
  });

  it('preview: at most four inputs and four related operations per group, then "and N more"; pinned lists them all', async () => {
    const tasks = await sampleModel(getSample('tasks')!);
    const preview = render(tasks, 'getTask', false);
    expect(preview).toMatch(/<dt>Feeds<\/dt><dd>(<span class="mono">\w+<\/span>, ){4}<span class="muted">and 1 more<\/span><\/dd>/);
    expect(render(tasks, 'getTask', true)).not.toContain('more</span>');
    const petstore = await sampleModel(getSample('petstore')!);
    const user = render(petstore, 'createUser', false);
    expect(user.match(/class="oc-input"/g)).toHaveLength(4);
    expect(user).toContain('<span class="oc-more muted"><br/>and 4 more</span>');
    expect(render(petstore, 'createUser', true).match(/class="oc-input"/g)).toHaveLength(8);
  });

  it('pinned: a dialog with Close, output fields, auth, related operations as buttons and the example', async () => {
    const html = render(await sampleModel(getSample('tasks')!), 'getTask', true, 'references/tasks.md');
    expect(html).toMatch(/^<div class="op-card" data-testid="op-card" role="dialog" aria-labelledby="([^"]+)">[\s\S]*<h3 class="oc-title" id="\1">/);
    expect(html).toContain('<button type="button" class="oc-close">Close<span class="visually-hidden"> details</span></button>');
    expect(html).toMatch(/<dt>Output<\/dt><dd><span class="mono">Task<\/span><span class="oc-fields muted"> with [\s\S]*<span class="mono">assigneeId<\/span>/);
    expect(html).toContain('<dt>Auth</dt><dd><span><span class="mono">bearerAuth</span> <span class="muted">http bearer JWT</span></span></dd>');
    // Each feed with the field that fills the parameter (the detail panel's "via id -> taskId").
    expect(html).toMatch(/<dt>Fed by<\/dt><dd><span class="oc-feed"><button type="button" class="oc-link mono">listTasks<\/button><span class="oc-via"><span class="nowrap">id → taskId<\/span><\/span><\/span>/);
    expect(html).toMatch(/<dt>Feeds<\/dt><dd><span class="oc-feed"><button type="button" class="oc-link mono">getProject<\/button><span class="oc-via"><span class="nowrap">[^<]+ → projectId<\/span><\/span>/);
    expect(html).toContain('<button type="button" class="oc-ref mono" aria-label="Show references/tasks.md in the skill">references/tasks.md</button>');
    expect(html).toContain('curl &#x27;https://tasks.example.com/v1/tasks/&lt;taskId&gt;&#x27;');
    expect(html).toContain('<span class="label">Copy example</span></button>');
  });

  it('shows "In skill" only once there is a skill file', async () => {
    const model = await sampleModel(getSample('tasks')!);
    expect(render(model, 'getTask', true)).not.toContain('In skill');
    expect(render(model, 'getTask', false)).not.toContain('In skill');
  });

  it('groups links by relation, each other operation once, sub-paths both ways', async () => {
    const model = await sampleModel(getSample('tasks')!);
    const graph = buildGraph(model);
    const links = opLinks(graph, 'getTask');
    expect(links.map((l) => l.group)).toEqual(['Fed by', 'Feeds', 'Shares schema', 'Sub-paths']);
    expect(links.find((l) => l.group === 'Fed by')!.items.map((i) => i.id)).toContain('listTasks');
    expect(opLinks(graph, 'listComments').find((l) => l.group === 'Sub-path of')!.items.map((i) => i.id)).toEqual(['getTask']);
    for (const l of links) expect(new Set(l.items.map((i) => i.id)).size).toBe(l.items.length);
  });

  it('renders spec strings as literal text, never markup (S3)', async () => {
    const html = render(await normalise(hostile), 'getThing', true);
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

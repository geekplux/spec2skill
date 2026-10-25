// The frame head, the workflow caption and the list view (redesign R5), rendered to static markup.
// Behaviour (copy, download, toggles, phones) is covered by scripts/browser/flows/redesign-r5.mjs.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { buildGraph } from '../graph';
import { drawnWorkflow } from '../layout/route';
import { ListView } from '../list/ListView';
import { getSample, sampleModel } from '../samples';
import { topChains } from '../skillgen/graph-chains';
import { ResultHead, installCommands, sourceLabel } from './ResultHead';
import { WorkflowCaption, stepLabel } from './WorkflowCaption';

const tasks = async () => {
  const model = await sampleModel(getSample('tasks')!);
  const graph = buildGraph(model);
  return { model, graph, workflow: drawnWorkflow(graph, topChains(model, graph, 1)[0] ?? null) };
};

describe('sourceLabel', () => {
  it('names the kind with its major.minor version, MCP alone', () => {
    expect(sourceLabel('openapi3', '3.1.0')).toBe('OpenAPI 3.1');
    expect(sourceLabel('openapi3', '3.0.3')).toBe('OpenAPI 3.0');
    expect(sourceLabel('swagger2', '2.0')).toBe('Swagger 2.0');
    expect(sourceLabel('swagger2', '2')).toBe('Swagger 2.0');
    expect(sourceLabel('mcp', '2025-06-18')).toBe('MCP');
  });
});

describe('ResultHead', () => {
  it('has the title, the meta line with its counts and tags, Install command (titled with both commands) then Download .zip', async () => {
    const { model, graph } = await tasks();
    const html = renderToStaticMarkup(createElement(ResultHead, { model, sample: true, resources: graph.clusters.length, links: graph.edges.length, ready: false, slug: 'tasks-api', phone: false }));
    expect(html).toContain('<h2 id="result-title" class="ftitle">Tasks API</h2>');
    const meta = /<div class="meta">([\s\S]*?)<\/div>/.exec(html)![1]!.replace(/<[^>]+>/g, '');
    expect(meta).toBe('OpenAPI 3.1, 22 operations, 5 resources, 78 links, Sample');
    expect(html).toContain('<b>22</b> operations');
    const commands = installCommands('tasks-api').join(' &amp;&amp; ');
    expect(commands).toBe('mkdir -p .claude/skills &amp;&amp; unzip tasks-api-skill.zip -d .claude/skills/ &amp;&amp; node .claude/skills/tasks-api/scripts/audit.mjs .claude/skills/tasks-api');
    const buttons = [...html.matchAll(/<button [^>]*>.*?<\/button>/g)].map((m) => m[0]);
    expect(buttons.map((b) => b.replace(/<svg[\s\S]*?<\/svg>/, ''))).toEqual([
      `<button type="button" class="btn lg" title="${commands}"><span class="label">Install command</span></button>`,
      '<button type="button" class="btn lg primary" disabled=""><span class="label">Download .zip</span></button>',
    ]);
    expect(html).not.toMatch(/<details|AI-drafted|warning/);
  });

  it('on phones puts Download .zip first; a user source has no Sample tag; warnings open from their tag', async () => {
    const { model, graph } = await tasks();
    const warned = { ...model, warnings: [{ message: 'one' }, { message: 'two' }] } as unknown as typeof model;
    const html = renderToStaticMarkup(createElement(ResultHead, { model: warned, sample: false, resources: graph.clusters.length, links: graph.edges.length, ready: true, slug: 'tasks-api', phone: true }));
    expect(html.indexOf('Download .zip')).toBeLessThan(html.indexOf('Install command'));
    expect(html).not.toContain('Sample');
    expect(html).toMatch(/<button type="button" class="tag tag-btn" aria-expanded="false" aria-controls="([^"]+)">2 warnings<\/button>[\s\S]*<ul class="warnings" id="\1" hidden=""><li>one<\/li><li>two<\/li><\/ul>/);
  });
});

describe('WorkflowCaption', () => {
  it('shows the mappings that fill a required input, arrows as on the card', () => {
    expect(stepLabel('id -> projectId, ownerId -> assigneeId', new Set(['projectId']))).toBe('id → projectId');
    expect(stepLabel('id -> taskId', new Set())).toBe('id → taskId');
  });

  it('draws the Tasks API workflow as V2Home: stops, ids and labels; compact without labels', async () => {
    const { model, workflow } = await tasks();
    const required = (id: string) => new Set(model.operations.find((o) => o.id === id)!.inputs.filter((p) => p.required).map((p) => p.name));
    const html = renderToStaticMarkup(createElement(WorkflowCaption, { chain: workflow!, required }));
    expect(html).toContain('<span class="mono">list<wbr/>Projects</span>'); // ids wrap at word boundaries only
    expect(html.replaceAll('<wbr/>', '').replace(/<[^>]+>/g, '|').split('|').filter(Boolean)).toEqual([
      'Strongest workflow', '1', 'listProjects', ', passing ', 'id → projectId', '2', 'listTasks', ', passing ', 'id → taskId', '3', 'getTask',
    ]);
    const compact = renderToStaticMarkup(createElement(WorkflowCaption, { chain: workflow!, required, compact: true }));
    expect(compact).toContain('<span id="workflow-label" class="visually-hidden">Strongest workflow</span>');
    expect(compact).not.toContain('→');
  });
});

const renderList = async (phone: boolean, selected?: string) => {
  const { model, graph, workflow } = await tasks();
  return renderToStaticMarkup(createElement(ListView, {
    model, graph, match: null, edges: graph.edges, workflow, selected, onSelect: () => {}, onSkillFile: () => {}, announce: () => {}, phone,
  }));
};

describe('ListView', () => {

  it('groups rows by resource in column order, each row a button named as on the map, with method, id, path and stop', async () => {
    const html = await renderList(false);
    expect([...html.matchAll(/<span class="lname">([^<]+)</g)].map((m) => m[1])).toEqual(['Projects', 'Members', 'Labels', 'Tasks', 'Comments']);
    expect(html).not.toContain('hidden=""'); // every group open on desktop
    expect(html).toMatch(/<button type="button" class="lrow" data-op="getTask" data-route="3" aria-haspopup="dialog" aria-expanded="false" aria-label="GET getTask, \/tasks\/\{taskId\}, Get a task, workflow step 3, cluster Tasks, \d+ relationships"><span class="m">GET<\/span> <span class="lid"><span class="id">get<wbr\/>Task<\/span><span class="path">\/tasks\/<wbr\/>\{task<wbr\/>Id\}<\/span><\/span><\/button>/);
    expect(html).toMatch(/data-op="deleteTask"[^>]*><span class="m" data-destructive="true">DELETE<\/span>[\s\S]*?<svg class="warn"/);
    expect(html).toContain('<span class="lname">Tasks</span><span class="lcount"><span class="visually-hidden">, </span>6<span class="visually-hidden"> operations: L list, C create, R read, U update, D delete, A action</span>');
  });

  it('on phones opens the workflow groups first and folds the rest; the pinned row opens its group', async () => {
    const html = await renderList(true);
    const heads = [...html.matchAll(/aria-expanded="(true|false)" aria-controls="lg-[^"]+"><span class="lname">([^<]+)</g)].map((m) => `${m[2]} ${m[1]}`);
    expect(heads).toEqual(['Projects true', 'Tasks true', 'Members false', 'Labels false', 'Comments false']);
    const pinned = await renderList(true, 'addMember');
    expect(pinned).toContain('aria-expanded="true" aria-controls="lg-cluster-members"');
    expect(pinned).toContain('data-testid="op-card"');
  });
});

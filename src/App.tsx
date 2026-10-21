import { type CSSProperties, type FocusEvent, Suspense, startTransition, use, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useAnnounce } from './a11y/Announcer';
import { WASH } from './design/tokens';
import { type AtlasGraph, type EdgeKind, buildGraph } from './graph';
import { AtlasMap } from './map/Map';
import type { Operation, SourceKind } from './model/types';
import { DEFAULT_SAMPLE_ID, SAMPLES, type Sample, getSample, sampleModel } from './samples';
import { Layout } from './shell/Layout';
import { revealInRow } from './shell/reveal';
import { type TabDef, Tabs, useWide } from './shell/Tabs';
import { skillSlug } from './skillgen/slug';
import { SkillPane } from './skillpane/SkillPane';
import { opFile } from './skillpane/tree';
import { type Skill, useSkill } from './skillpane/useSkill';

const KIND_LABEL: Record<SourceKind, string> = { openapi3: 'OpenAPI', swagger2: 'Swagger', mcp: 'MCP' };

/** Keep a chip fully visible inside the horizontally scrolling mobile chip row (scrolls the row, not focus). */
const revealChip = (e: FocusEvent<HTMLButtonElement>) => revealInRow(e.currentTarget.parentElement, e.currentTarget);

function initialSample(): Sample {
  const id = new URLSearchParams(window.location.search).get('sample');
  return getSample(id ?? '') ?? getSample(DEFAULT_SAMPLE_ID)!;
}

/** Text flags, so state never relies on colour. */
function flags(op: Operation): string[] {
  const out: string[] = [];
  if (op.deprecated) out.push('deprecated');
  if (op.kind === 'tool' && op.hints.readOnly) out.push('read-only');
  if (op.kind === 'tool' && op.hints.destructive) out.push('destructive');
  return out;
}

/** Plain-text view of the graph (phase 4): the list view until phase 12, and the map's text alternative. */
function GraphSummary({ graph }: { graph: AtlasGraph }) {
  const count = (kind: EdgeKind) => graph.edges.filter((e) => e.kind === kind).length;
  const inferred = graph.edges.filter((e) => e.confidence === 'inferred').length;
  return (
    <section className="graph" data-testid="graph-summary" aria-labelledby="graph-heading">
      <h2 id="graph-heading">Clusters and relationships</h2>
      <ul className="territories">
        {graph.clusters.map((c, i) => (
          <li key={c.id} style={{ '--wash': `var(--${WASH[i % WASH.length]})` } as CSSProperties}>
            <strong className="territory">{c.name}</strong>
            <span>{c.description}</span>
          </li>
        ))}
      </ul>
      <p>
        {count('feeds')} feeds edges ({inferred} inferred), {count('sub-path')} sub-path edges, {count('shared-schema')}{' '}
        shared-schema edges.
        {graph.hubSchemas.length > 0 &&
          ` Hub schemas (shown as badges, not edges): ${graph.hubSchemas.map((h) => `${h.name} on ${h.usedBy} operations`).join(', ')}.`}
      </p>
    </section>
  );
}

type Tab = 'skill' | 'map' | 'list';
const TABS: TabDef<Tab>[] = [
  { id: 'skill', label: 'Skill', panel: 'panel-skill' },
  { id: 'map', label: 'Map', panel: 'panel-map' },
  { id: 'list', label: 'List', panel: 'panel-map' },
];

interface WorkspaceProps { sample: Sample; tab: Tab; onTab: (tab: Tab) => void; wide: boolean; run: number }

/** The skill pane beside the map (desktop) or behind Skill | Map | List tabs (below 1024 px), D21. */
function Workspace({ sample, tab, onTab, wide, run }: WorkspaceProps) {
  const model = use(sampleModel(sample));
  const graph = useMemo(() => buildGraph(model), [model]);
  const [opts, setOpts] = useState({ hash: '', slug: '', license: 'MIT' });
  const slug = (opts.hash === model.hash && opts.slug) || skillSlug(model);
  const { skill, error } = useSkill(model, graph, slug, opts.license, run);
  const [file, setFile] = useState('SKILL.md');
  const panes = useRef<HTMLDivElement>(null);
  const title = `${model.source.title} (sample)`;
  const noun = model.source.kind === 'mcp' ? 'tools' : 'operations';
  const summary = `${model.operations.length} ${noun} in ${graph.clusters.length} clusters, ${graph.edges.length} relationships`;
  const view = tab === 'list' ? 'list' : 'map';

  // Each new skill is announced with its audit (A2), after the sample's summary when the sample changed;
  // not on first load, where the page itself is the news.
  const announce = useAnnounce();
  const said = useRef<{ hash: string; skill?: Skill }>({ hash: model.hash });
  useEffect(() => {
    if (!skill || skill.hash !== model.hash || said.current.skill === skill) return;
    const first = !said.current.skill;
    const news = said.current.hash !== model.hash ? `${model.source.title}: ${summary}. ` : '';
    said.current = { hash: model.hash, skill };
    const passed = skill.audit.checks.filter((c) => c.ok).length;
    if (!first || news) announce(`${news}Skill written: ${skill.audit.ok ? 'audit passed' : 'audit failed'}, ${passed} of ${skill.audit.checks.length} checks.`);
  }, [announce, skill, model.hash, model.source.title, summary]);
  // Panes fill the first view from their measured page top (app.css reads --panes-top).
  useLayoutEffect(() => {
    const el = panes.current!;
    const measure = () => el.style.setProperty('--panes-top', `${Math.round(el.getBoundingClientRect().top + window.scrollY)}px`);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- the title above changes with the sample and the tabs with `wide`
  }, [wide, model.hash]);

  /** "In the skill": show that file in the pane (switching to the Skill tab on small screens). */
  const openFile = (path: string) => {
    setFile(path);
    if (!wide) onTab('skill');
    requestAnimationFrame(() => document.getElementById('skill-preview')?.focus());
  };
  const tabs = (
    <Tabs label="View" tabs={wide ? TABS.slice(1) : TABS} value={wide ? view : tab} onChange={onTab} />
  );
  return (
    <>
      <div className="title">
        <p className="kicker">Surveyed from {KIND_LABEL[model.source.kind]} {model.source.specVersion}</p>
        <h1>{title}</h1>
        <p className="lede">
          {summary}. <span className="banner">This is a sample. Paste an OpenAPI or MCP URL above, or try another sample.</span>
        </p>
      </div>
      {!wide && tabs}
      <div className="panes" ref={panes}>
        <SkillPane skill={skill} error={error} ready={skill?.hash === model.hash} empty={model.operations.length === 0}
          options={{ key: model.hash, slug, license: opts.license }} onOptions={(o) => setOpts({ hash: model.hash, ...o })}
          file={file} onFile={setFile} run={run} tabpanel={wide ? undefined : { hidden: tab !== 'skill' }} />
        <div className="map-pane">
          {wide && tabs}
          <div className="sheet" id="panel-map" role="tabpanel" aria-labelledby={`tab-${view}`} hidden={!wide && tab === 'skill'} data-view={view}>
            {view === 'map' && (
              <AtlasMap key={model.hash} model={model} graph={graph} skillFile={skill?.hash === model.hash ? (id) => opFile(skill.tree, id) : undefined} onSkillFile={openFile} />
            )}
            <GraphSummary graph={graph} />
            <ul className="ops" data-testid="sample-list" aria-label={`${noun} in ${title}`}>
              {model.operations.map((op) => (
                <li key={op.id}>
                  <span className="method" data-method={op.method ?? 'tool'}>
                    {op.method?.toUpperCase() ?? 'TOOL'}
                  </span> <code>{op.path ?? op.id}</code>
                  {op.title !== op.id && <span className="summary"> {op.title}</span>}
                  {flags(op).map((flag) => (
                    <span className="flag" key={flag}>
                      {flag}
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}

export function App() {
  const [sample, setSample] = useState(initialSample);
  const [tab, setTab] = useState<Tab>('skill');
  const [run, setRun] = useState(0);
  const wide = useWide();
  const chipRow = useRef<HTMLFieldSetElement>(null);
  useEffect(() => {
    const row = chipRow.current;
    revealInRow(row, row?.querySelector<HTMLElement>(`[data-sample="${sample.id}"]`));
  }, [sample.id]);
  const select = (next: Sample) => {
    const url = new URL(window.location.href);
    url.searchParams.set('sample', next.id);
    window.history.replaceState(null, '', url);
    startTransition(() => setSample(next)); // keep the current list visible while the next one is read
  };
  /** Generate skill: write it again with the pane's options and bring the pane into view. */
  const generate = () => {
    setRun((n) => n + 1);
    if (!wide) setTab('skill');
  };

  const chips = (
    <fieldset className="chips" ref={chipRow}>
      <legend>Built-in samples</legend>
      {SAMPLES.map((s) => (
        <button
          type="button"
          className="chip"
          key={s.id}
          data-sample={s.id}
          aria-pressed={s.id === sample.id}
          onClick={() => select(s)}
          onFocus={revealChip}
        >
          {s.label} <span className="chip-kind">{KIND_LABEL[s.kind]}</span>
        </button>
      ))}
    </fieldset>
  );
  return (
    <Layout samples={chips} onGenerate={generate}>
      <Suspense fallback={<p className="lede">Reading the sample…</p>}>
        <Workspace sample={sample} tab={tab} onTab={setTab} wide={wide} run={run} />
      </Suspense>
    </Layout>
  );
}

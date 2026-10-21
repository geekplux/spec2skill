import { type FocusEvent, Suspense, startTransition, use, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useAnnounce } from './a11y/Announcer';
import { buildGraph } from './graph';
import { ListView } from './list/ListView';
import { AtlasMap } from './map/Map';
import { Search } from './map/Search';
import { ShortcutHelp } from './map/ShortcutHelp';
import type { SourceKind } from './model/types';
import { DEFAULT_SAMPLE_ID, SAMPLES, type Sample, getSample, sampleModel } from './samples';
import { Layout } from './shell/Layout';
import { revealInRow } from './shell/reveal';
import { type TabDef, Tabs, useWide } from './shell/Tabs';
import { skillSlug } from './skillgen/slug';
import { SkillPane } from './skillpane/SkillPane';
import { opFile } from './skillpane/tree';
import { type Skill, useSkill } from './skillpane/useSkill';
import { type Hidden, SHOW_ALL, edgeShown, facets, matches, searchIndex } from './state/filter';
import { type UrlState, type View, canonicalUrl, readUrl, writeUrl } from './state/url';

const KIND_LABEL: Record<SourceKind, string> = { openapi3: 'OpenAPI', swagger2: 'Swagger', mcp: 'MCP' };

/** Keep a chip fully visible inside the horizontally scrolling mobile chip row (scrolls the row, not focus). */
const revealChip = (e: FocusEvent<HTMLButtonElement>) => revealInRow(e.currentTarget.parentElement, e.currentTarget);

type Tab = View;
const TABS: TabDef<Tab>[] = [
  { id: 'skill', label: 'Skill', panel: 'panel-skill' },
  { id: 'map', label: 'Map', panel: 'panel-map' },
  { id: 'list', label: 'List', panel: 'panel-map' },
];

interface WorkspaceProps {
  sample: Sample; tab: Tab; onTab: (tab: Tab) => void; wide: boolean; run: number;
  /** `#op=`: the operation whose details are open. */
  op?: string; onOp: (id: string | undefined, push: boolean) => void;
  q: string; onQ: (q: string) => void; hidden: Hidden; onHidden: (h: Hidden) => void;
}

/** The skill pane beside the map (desktop) or behind Skill | Map | List tabs (below 1024 px), D21. */
function Workspace({ sample, tab, onTab, wide, run, op, onOp, q, onQ, hidden, onHidden }: WorkspaceProps) {
  const model = use(sampleModel(sample));
  const graph = useMemo(() => buildGraph(model), [model]);
  const index = useMemo(() => searchIndex(model, graph), [model, graph]);
  const match = useMemo(() => matches(index, q, hidden), [index, q, hidden]);
  const shown = useMemo(() => graph.edges.filter((e) => edgeShown(e, match, hidden)), [graph, match, hidden]);
  const choices = useMemo(() => facets(model, graph), [model, graph]);
  const selected = model.operations.some((o) => o.id === op) ? op : undefined;
  const search = useRef<HTMLInputElement>(null);
  const [help, setHelp] = useState(false);
  const [opts, setOpts] = useState({ hash: '', slug: '', license: 'MIT' });
  const slug = (opts.hash === model.hash && opts.slug) || skillSlug(model);
  const { skill, error } = useSkill(model, graph, slug, opts.license, run);
  const [file, setFile] = useState('SKILL.md');
  const panes = useRef<HTMLDivElement>(null);
  const title = `${model.source.title} (sample)`;
  const noun = model.source.kind === 'mcp' ? 'tools' : 'operations';
  const summary = `${model.operations.length} ${noun} in ${graph.clusters.length} clusters, ${graph.edges.length} relationships`;
  const view = tab === 'list' ? 'list' : 'map';
  const announce = useAnnounce();

  // Each new skill is announced with its audit (A2), after the sample's summary when the sample changed;
  // not on first load, where the page itself is the news.
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

  // `/` focuses search (from the Skill tab it opens the Map tab first) and `?` opens the shortcut help,
  // from anywhere but a text field or the dialog itself (A1).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented || (e.target as Element).closest?.('input, textarea, select, [contenteditable], dialog')) return;
      if (e.key === '?') setHelp(true);
      else if (e.key !== '/') return;
      else if (!wide && tab === 'skill') {
        onTab('map');
        requestAnimationFrame(() => search.current?.focus());
      } else search.current?.focus();
      e.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [wide, tab, onTab]);

  /** "In the skill": show that file in the pane (switching to the Skill tab on small screens). */
  const openFile = (path: string) => {
    setFile(path);
    if (!wide) onTab('skill');
    requestAnimationFrame(() => document.getElementById('skill-preview')?.focus());
  };
  const skillFile = skill?.hash === model.hash ? (id: string) => opFile(skill.tree, id) : undefined;
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
            <Search q={q} onQ={onQ} hidden={hidden} onHidden={onHidden} facets={choices} count={match && match.size}
              total={model.operations.length} noun={noun} edges={{ shown: shown.length, total: graph.edges.length }} onHelp={() => setHelp(true)} input={search} />
            {view === 'map' ? (
              <AtlasMap key={model.hash} model={model} graph={graph} skillFile={skillFile} onSkillFile={openFile} selected={selected} onSelect={onOp} match={match} edges={shown} />
            ) : (
              <ListView model={model} graph={graph} match={match} edges={shown} selected={selected} onSelect={(id) => onOp(id, true)} skillFile={skillFile} onSkillFile={openFile} announce={announce} />
            )}
          </div>
        </div>
      </div>
      <p className="filter-note">Search and filters apply to the map and list; the skill always covers every {noun === 'tools' ? 'tool' : 'operation'}.</p>
      {help && <ShortcutHelp onClose={() => setHelp(false)} />}
    </>
  );
}

const NO_FILTER = { q: '', hidden: SHOW_ALL };
/** The URL's state; a link to an operation (#op=) opens on the Map tab, otherwise the skill comes first (D21). */
const here = (): UrlState => {
  const u = readUrl(window.location.href);
  return u.op && !u.view ? { ...u, view: 'map' } : u;
};

export function App() {
  // The URL is the source of truth (F13): each change writes history; back/forward re-read it.
  const [url, setUrl] = useState(here);
  const [find, setFind] = useState({ q: url.q, hidden: SHOW_ALL });
  const sample = getSample(url.sample ?? '') ?? getSample(DEFAULT_SAMPLE_ID)!;
  const tab: Tab = url.view ?? 'skill';
  const [run, setRun] = useState(0);
  const wide = useWide();
  const chipRow = useRef<HTMLFieldSetElement>(null);
  useEffect(() => {
    const row = chipRow.current;
    revealInRow(row, row?.querySelector<HTMLElement>(`[data-sample="${sample.id}"]`));
  }, [sample.id]);
  // A link with an unknown sample or view falls back; the address then says what is shown
  // (checked after every render, as back/forward can also land on such a link).
  useEffect(() => {
    const href = canonicalUrl(window.location.href, (id) => !!getSample(id), DEFAULT_SAMPLE_ID);
    if (href !== window.location.href) window.history.replaceState(null, '', href);
  });
  useEffect(() => {
    const onPop = () => {
      const next = here();
      startTransition(() => setUrl(next));
      setFind((f) => (f.q === next.q ? f : { ...f, q: next.q }));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  /** Merge `patch` into the URL: a new history entry when `push`, else replace the current one. */
  const go = (patch: Partial<UrlState>, push = false) => {
    const next = { ...here(), ...patch };
    const href = writeUrl(window.location.href, next);
    if (href !== window.location.href) window.history[push ? 'pushState' : 'replaceState'](null, '', href);
    setUrl(next);
  };
  // The search reaches the URL once typing pauses.
  useEffect(() => {
    const t = setTimeout(() => readUrl(window.location.href).q !== find.q && go({ q: find.q }), 400);
    return () => clearTimeout(t);
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- `go` reads the URL itself; only the query matters
  }, [find.q]);
  const select = (next: Sample) => {
    if (next.id === sample.id) return go({ sample: next.id }); // name it in the URL, no new entry
    setFind(NO_FILTER);
    // keep the current sample visible while the next one is read
    startTransition(() => go({ sample: next.id, q: '', op: undefined }, true));
  };
  /** Generate skill: write it again with the pane's options and bring the pane into view. */
  const generate = () => {
    setRun((n) => n + 1);
    if (!wide) go({ view: 'skill' });
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
        <Workspace sample={sample} tab={tab} onTab={(view) => go({ view })} wide={wide} run={run} op={url.op} onOp={(op, push) => go({ op }, push)}
          q={find.q} onQ={(q) => setFind((f) => ({ ...f, q }))} hidden={find.hidden} onHidden={(hidden) => setFind((f) => ({ ...f, hidden }))} />
      </Suspense>
    </Layout>
  );
}

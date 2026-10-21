// The generated skill, first thing on screen (D21): file tree, plain-text preview (never rendered as
// HTML: spec text is data, S3), the in-browser audit, Download .zip and the install command.
import { useEffect, useRef, useState } from 'react';
import { useAnnounce } from '../a11y/Announcer';
import type { AuditResult } from '../skillgen/audit-core';
import { FileTree } from './FileTree';
import type { Skill } from './useSkill';

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const OUTLINE = ['SKILL.md', 'kit/', 'references/', 'examples/', 'scripts/', 'evals/', 'ci/'];
const SHORT: Record<string, string> = {
  frontmatter: 'Frontmatter', body: 'Body ≤ 200 lines', operations: 'Every operation', links: 'Links resolve',
  references: 'References linked', kit: 'Kit and tests', examples: 'Worked examples', evals: 'Evals', ci: 'CI workflow',
};

const mark = (ok: boolean) => <span className="mark" aria-hidden="true">{ok ? '✓' : '✗'}</span>;

export interface SkillOptionsDraft { slug: string; license: string }

function Options({ value, onChange }: { value: SkillOptionsDraft; onChange: (v: SkillOptionsDraft) => void }) {
  const [draft, setDraft] = useState(value);
  const bad = { slug: !SLUG.test(draft.slug) || draft.slug.length > 64, license: !draft.license.trim() || draft.license.length > 60 };
  const edit = (key: keyof SkillOptionsDraft, text: string) => {
    const next = { ...draft, [key]: text };
    setDraft(next);
    if (SLUG.test(next.slug) && next.slug.length <= 64 && next.license.trim() && next.license.length <= 60) onChange(next);
  };
  return (
    <details className="options">
      <summary>Options</summary>
      <label htmlFor="opt-slug">Skill name</label>
      <input id="opt-slug" className="field" value={draft.slug} spellCheck={false} aria-invalid={bad.slug} aria-describedby="opt-slug-help" onChange={(e) => edit('slug', e.target.value)} />
      <p id="opt-slug-help" className="help">{bad.slug && <strong>Not used: </strong>}lowercase letters, digits and single dashes, up to 64.</p>
      <label htmlFor="opt-license">Licence</label>
      <input id="opt-license" className="field" value={draft.license} aria-invalid={bad.license} aria-describedby="opt-license-help" onChange={(e) => edit('license', e.target.value)} />
      <p id="opt-license-help" className="help">{bad.license && <strong>Not used: </strong>}an SPDX id such as MIT, up to 60 characters.</p>
    </details>
  );
}

function Checklist({ audit }: { audit: AuditResult }) {
  const passed = audit.checks.filter((c) => c.ok).length;
  return (
    <details className="audit" open data-ok={audit.ok}>
      <summary>{mark(audit.ok)} {audit.ok ? 'Audit passed' : 'Audit failed'}: <span className="tally">{passed} of {audit.checks.length} checks</span></summary>
      <ul>
        {audit.checks.map((c) => (
          <li key={c.id} data-ok={c.ok} title={c.label}>{mark(c.ok)} {SHORT[c.id] ?? c.label}: <span className="status">{c.ok ? 'passed' : `failed: ${c.reason}`}</span></li>
        ))}
      </ul>
      <p className="help">Examples run in the CLI audit (<code>scripts/audit.mjs</code>), not in the browser.</p>
    </details>
  );
}

interface SkillPaneProps {
  skill?: Skill;
  error?: string;
  /** False while the skill on screen is not (yet) for the model on screen. */
  ready: boolean;
  empty: boolean;
  options: SkillOptionsDraft & { key: string };
  onOptions: (v: SkillOptionsDraft) => void;
  file: string;
  onFile: (path: string) => void;
  /** "Generate skill" presses: each one brings the pane's heading into view and focus. */
  run: number;
  tabpanel?: { hidden: boolean };
}

export function SkillPane({ skill, error, ready, empty, options, onOptions, file, onFile, run, tabpanel }: SkillPaneProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  const announce = useAnnounce();
  // What the last action did, in words beside the buttons (and announced); only for this skill.
  const [note, setNote] = useState({ slug: '', text: '' });
  const tell = (text: string, said: string) => {
    setNote({ slug: options.slug, text });
    announce(said);
  };
  useEffect(() => {
    if (run) heading.current?.focus();
  }, [run]);
  const slug = options.slug;
  const path = skill && file in skill.tree ? file : 'SKILL.md';
  const text = skill?.tree[path] ?? '';
  const lines = text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
  const install = [`unzip ${slug}-skill.zip -d .claude/skills/`, `node .claude/skills/${slug}/scripts/audit.mjs .claude/skills/${slug}`];
  const download = () => {
    const url = URL.createObjectURL(new Blob([skill!.zip() as BlobPart], { type: 'application/zip' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `${slug}-skill.zip` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    tell('Downloaded', `Downloaded ${slug}-skill.zip.`);
  };
  const copy = () =>
    navigator.clipboard.writeText(install.join(' && ')).then(() => tell('Copied', 'Install command copied.'), () => tell('Copy failed', 'Copy failed: select the command below and copy it.'));

  return (
    <section className="skill-pane" id="panel-skill" role={tabpanel ? 'tabpanel' : undefined} aria-labelledby={tabpanel ? 'tab-skill' : 'skill-title'}
      hidden={tabpanel?.hidden} data-ready={ready} aria-busy={!ready && !empty}>
      <div className="pane-head">
        <p className="kicker">Agent skill · Prose: deterministic</p>
        <h2 id="skill-title" tabIndex={-1} ref={heading}><code>{slug}</code> skill</h2>
        <Options key={options.key} value={options} onChange={onOptions} />
      </div>
      {empty ? <p className="writing" id="skill-empty">No operations, so no skill to write.</p>
        : !skill ? (
          <div className="writing" aria-hidden={!error}>
            <ul className="outline">{OUTLINE.map((p) => <li key={p}>{p}</li>)}</ul>
            <p>{error ?? 'Writing skill…'}</p>
          </div>
        ) : (
          <div className="skill-body" data-stale={!ready || undefined}>
            <FileTree paths={Object.keys(skill.tree)} selected={path} onSelect={onFile} />
            <Checklist audit={skill.audit} />
            <p className="file-head"><code>{path}</code> · {lines} lines</p>
            {/* A Tab stop so keyboard users can scroll it; text only, never HTML. */}
            {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
            <pre id="skill-preview" className="preview" tabIndex={0} aria-label={`${path}, ${lines} lines`}>{text}</pre>
          </div>
        )}
      <div className="actions">
        <button type="button" className="btn primary" onClick={download} disabled={!ready} aria-describedby={empty ? 'skill-empty' : undefined}>
          Download .zip
        </button>
        <button type="button" className="btn" onClick={copy} disabled={empty}>Copy install command</button>
        {note.slug === slug && <span className="copied">{note.text}</span>}
      </div>
      <p className="install">Install: <code>{install[0]}</code></p>
    </section>
  );
}

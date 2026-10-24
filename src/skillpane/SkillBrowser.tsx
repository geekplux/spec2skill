// The skill browser (docs/redesign/DESIGN.md 4.3, redesign R5): under a rule in the result frame, on
// the grid's 202 / 492 / 202 columns. Files (the skill's tree, "Edit name and licence"), the open
// file as plain text with line numbers (never rendered as HTML: spec text is data, S3), and the
// in-browser audit, always open. Between 640 and 1136 px: files and preview over the audit; on phones
// one column of 44 px file rows, each opening a full-width preview, then the audit as one row that
// expands its checks (V2Phone).
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from 'react';
import { useAnnounce } from '../a11y/Announcer';
import { CHEVRON_ICON, COPY_ICON, FAIL_ICON, checkIcon, verdictIcon } from '../design/icons';
import { useFlash } from '../result/useFlash';
import type { AuditCheck, AuditResult } from '../skillgen/audit-core';
import type { FileTree as Files } from '../skillgen/types';
import { FileTree } from './FileTree';
import type { Skill } from './useSkill';

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const OUTLINE = ['SKILL.md', 'kit', 'references', 'examples', 'scripts', 'evals', 'ci'];

/** How many items a JSON array file holds (the evals), or undefined. */
const countJson = (text?: string): number | undefined => {
  try {
    const v = JSON.parse(text ?? '') as unknown;
    const list = Array.isArray(v) ? v : (v as { evals?: unknown })?.evals;
    return Array.isArray(list) ? list.length : undefined;
  } catch {
    return undefined;
  }
};

/** A check as one short sentence (V2Home); the audit script's own wording stays in its CLI output. */
export function checkText(c: AuditCheck, tree: Files): string {
  const examples = new Set(Object.keys(tree).flatMap((p) => /^examples\/([^/]+)\/run\.mjs$/.exec(p)?.[1] ?? [])).size;
  const evals = countJson(tree['evals/evals.json']);
  const text: Record<string, string | undefined> = {
    frontmatter: 'Frontmatter has name, description, license and compatibility',
    operations: 'Every operation appears in SKILL.md or a reference',
    links: 'Every relative link resolves',
    references: 'Every reference is linked from SKILL.md',
    kit: 'Kit code and regression tests are present',
    examples: c.ok ? `${examples} worked examples are present` : 'At least 2 worked examples are present',
    evals: c.ok && evals ? `${evals} evals name known operations` : undefined,
    ci: 'CI runs the tests, the examples and the audit',
  };
  return text[c.id] ?? c.label.charAt(0).toUpperCase() + c.label.slice(1);
}

export interface SkillOptionsDraft { slug: string; license: string }

/** "Use deterministic text": offered once AI names and prose exist; applies to the map's names and the skill's prose. */
export interface PlainText { on: boolean; onChange: (on: boolean) => void }

function Options({ value, onChange, plainText }: { value: SkillOptionsDraft; onChange: (v: SkillOptionsDraft) => void; plainText?: PlainText }) {
  const [draft, setDraft] = useState(value);
  const bad = { slug: !SLUG.test(draft.slug) || draft.slug.length > 64, license: !draft.license.trim() || draft.license.length > 60 };
  const edit = (key: keyof SkillOptionsDraft, text: string) => {
    const next = { ...draft, [key]: text };
    setDraft(next);
    if (SLUG.test(next.slug) && next.slug.length <= 64 && next.license.trim() && next.license.length <= 60) onChange(next);
  };
  return (
    <div className="options" id="skill-options">
      <label htmlFor="opt-slug">Skill name</label>
      <input id="opt-slug" className="field" value={draft.slug} spellCheck={false} aria-invalid={bad.slug} aria-describedby="opt-slug-help" onChange={(e) => edit('slug', e.target.value)} />
      <p id="opt-slug-help" className="help">{bad.slug && <strong>Not used: </strong>}lowercase letters, digits and single dashes, up to 64.</p>
      <label htmlFor="opt-license">Licence</label>
      <input id="opt-license" className="field" value={draft.license} aria-invalid={bad.license} aria-describedby="opt-license-help" onChange={(e) => edit('license', e.target.value)} />
      <p id="opt-license-help" className="help">{bad.license && <strong>Not used: </strong>}an SPDX id such as MIT, up to 60 characters.</p>
      {plainText && (
        <label className="check">
          <input type="checkbox" checked={plainText.on} onChange={(e) => plainText.onChange(e.target.checked)} /> Use deterministic text
        </label>
      )}
    </div>
  );
}

/** The audit, always open on desktop; on phones one row that expands its checks. */
function Audit({ audit, tree, phone }: { audit: AuditResult; tree: Files; phone: boolean }) {
  const [open, setOpen] = useState(false);
  const passed = audit.checks.filter((c) => c.ok).length;
  const verdict = audit.ok ? 'Audit passed' : 'Audit failed';
  const tally = `${passed} of ${audit.checks.length}`;
  const head: ReactNode = <><span className="verdict">{verdictIcon(audit.ok)}{verdict}</span><span className="visually-hidden">, </span><span className="tally">{tally}{phone && CHEVRON_ICON}</span></>;
  return (
    <div className="sb-audit" data-ok={audit.ok} data-open={!phone || open || undefined}>
      <h3 className="sb-head" id="audit-head">
        {phone ? <button type="button" className="audit-row" aria-expanded={open} aria-controls="audit-checks" onClick={() => setOpen((o) => !o)}>{head}</button> : head}
      </h3>
      <ul className="checks" id="audit-checks" hidden={phone && !open} aria-labelledby="audit-head">
        {audit.checks.map((c, i) => (
          <li key={c.id} data-ok={c.ok} style={{ '--i': i } as CSSProperties}>
            {c.ok ? checkIcon() : FAIL_ICON}
            <span>{checkText(c, tree)}{c.ok ? <span className="visually-hidden">: passed</span> : <>: <strong>Failed</strong>, {c.reason}</>}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface SkillBrowserProps {
  skill?: Skill;
  error?: string;
  /** False while the skill on screen is not (yet) for the model on screen. */
  ready: boolean;
  empty: boolean;
  options: SkillOptionsDraft & { key: string };
  onOptions: (v: SkillOptionsDraft) => void;
  /** The file shown, and on phones whether its preview is open. */
  file: string;
  open: boolean;
  onFile: (path: string) => void;
  onClose: () => void;
  /** Generate presses: each one brings the files heading into view and focus. */
  run: number;
  plainText?: PlainText;
  phone: boolean;
}

export function SkillBrowser({ skill, error, ready, empty, options, onOptions, file, open, onFile, onClose, run, plainText, phone }: SkillBrowserProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  const announce = useAnnounce();
  const [editing, setEditing] = useState(false);
  const [copied, flashCopied] = useFlash();
  useEffect(() => {
    if (run) heading.current?.focus();
  }, [run]);
  const slug = options.slug;
  const path = skill && file in skill.tree ? file : 'SKILL.md';
  const text = skill?.tree[path] ?? '';
  const lines = text.split('\n');
  if (text.endsWith('\n')) lines.pop();
  const copy = () => navigator.clipboard.writeText(text).then(() => (flashCopied(), announce(`${path} copied.`)), () => announce(`Copy failed: select the text of ${path} and copy it.`));
  const close = () => {
    onClose();
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`.skill-browser [data-path="${CSS.escape(path)}"]`)?.focus());
  };
  const showPreview = !phone || open;

  return (
    <section className="skill-browser" id="skill" aria-labelledby="skill-title" data-ready={ready} aria-busy={!ready && !empty}>
      <div className="sb-files">
        <h3 className="sb-head mono" id="skill-title" tabIndex={-1} ref={heading}>{slug}/<span className="visually-hidden"> skill</span></h3>
        {empty ? <p className="sb-note" id="skill-empty">No operations, so no skill to write.</p>
          : !skill ? (
            <div className="writing" aria-hidden={!error}>
              <ul className="outline">{OUTLINE.map((p) => <li key={p}>{p}</li>)}</ul>
              <p className="sb-note">{error ?? 'Writing skill…'}</p>
            </div>
          ) : <FileTree paths={Object.keys(skill.tree)} selected={path} onSelect={onFile} phone={phone} />}
        {!empty && (
          <button type="button" className="edit" aria-expanded={editing} aria-controls="skill-options" onClick={() => setEditing((e) => !e)}>Edit name and licence</button>
        )}
        {editing && !empty && <Options key={options.key} value={options} onChange={onOptions} plainText={plainText} />}
      </div>
      {skill && showPreview && (
        <div className="sb-preview" data-stale={!ready || undefined}>
          <div className="sb-head">
            <h3 id="file-head"><span className="fname">{path}</span><span className="visually-hidden">, </span><span className="lines">{lines.length} {lines.length === 1 ? 'line' : 'lines'}</span>{!ready && <><span className="visually-hidden">, </span><span className="lines">Updating…</span></>}</h3>
            <span className="sb-tools">
              <button type="button" className="icon-btn" aria-label={copied ? `${path} copied` : `Copy ${path}`} onClick={copy}>{copied ? checkIcon(16) : COPY_ICON}</button>
              {phone && <button type="button" className="sb-close" onClick={close}>Close<span className="visually-hidden"> {path}</span></button>}
            </span>
          </div>
          {/* A Tab stop so keyboard users can scroll it; text only, never HTML. Line numbers are CSS
              generated content (data-n), so they are not part of the text read or copied. */}
          {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex, jsx-a11y/prefer-tag-over-role -- a labelled scroller, named by the file heading */}
          <div id="skill-preview" className="code" tabIndex={0} role="region" aria-labelledby="file-head">
            {lines.map((l, i) => <div className="l" key={i} data-n={i + 1}>{l}</div>)}
          </div>
        </div>
      )}
      {skill && <Audit audit={skill.audit} tree={skill.tree} phone={phone} />}
    </section>
  );
}

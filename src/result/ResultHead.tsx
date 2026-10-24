// The result frame's head (docs/redesign/DESIGN.md 4.3): the API title, the meta line (source kind and
// version, counts, tags) and, right, Install command (copies both commands) and Download .zip (the
// audited zip). "N warnings" opens the parser's warnings under the head.
import { useId, useState } from 'react';
import { useAnnounce } from '../a11y/Announcer';
import { COPY_ICON, DOWNLOAD_ICON, checkIcon } from '../design/icons';
import type { ApiModel, SourceKind } from '../model/types';
import type { Skill } from '../skillpane/useSkill';
import { useFlash } from './useFlash';

const KIND: Record<SourceKind, string> = { openapi3: 'OpenAPI', swagger2: 'Swagger', mcp: 'MCP' };

/** "OpenAPI 3.1", "Swagger 2.0", "MCP": the kind and its major.minor version (MCP has none worth showing). */
export function sourceLabel(kind: SourceKind, version: string): string {
  if (kind === 'mcp') return KIND.mcp;
  const v = /^\d+(\.\d+)?/.exec(version)?.[0];
  return v ? `${KIND[kind]} ${v.includes('.') ? v : `${v}.0`}` : KIND[kind];
}

/** The two commands that install and audit the downloaded skill. */
export const installCommands = (slug: string): string[] => [
  `unzip ${slug}-skill.zip -d .claude/skills/`,
  `node .claude/skills/${slug}/scripts/audit.mjs .claude/skills/${slug}`,
];

interface ResultHeadProps {
  model: ApiModel;
  sample: boolean;
  /** Resources and links on the map. */
  resources: number;
  links: number;
  /** The skill on screen, when it is for this model (Download is disabled until then). */
  skill?: Skill;
  ready: boolean;
  slug: string;
  /** Phones: Download .zip first, full width (V2Phone). */
  phone: boolean;
}

export function ResultHead({ model, sample, resources, links, skill, ready, slug, phone }: ResultHeadProps) {
  const announce = useAnnounce();
  const uid = useId();
  const [warningsOpen, setWarningsOpen] = useState(false);
  const [copied, flashCopied] = useFlash();
  const [downloaded, flashDownloaded] = useFlash();
  const [failed, setFailed] = useState('');
  const ops = model.operations.length;
  const empty = ops === 0;
  const noun = (model.source.kind === 'mcp' ? 'tool' : 'operation') + (ops === 1 ? '' : 's');
  const commands = installCommands(slug).join(' && ');
  const warnings = model.warnings.length;

  const download = () => {
    const url = URL.createObjectURL(new Blob([skill!.zip() as BlobPart], { type: 'application/zip' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `${slug}-skill.zip` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    flashDownloaded();
    announce(`Downloaded ${slug}-skill.zip.`);
  };
  const copy = () => navigator.clipboard.writeText(commands).then(() => {
    setFailed('');
    flashCopied();
    announce(`Install command copied: ${commands}`);
  }, () => {
    // Without the clipboard the commands are shown to select by hand.
    setFailed(commands);
    announce('Copy failed: select the install command under the title and copy it.');
  });

  const downloadBtn = (
    <button key="download" type="button" className="btn lg primary" onClick={download} disabled={!ready || empty} aria-describedby={empty ? 'skill-empty' : undefined}>
      {downloaded ? checkIcon(16) : DOWNLOAD_ICON}{downloaded ? 'Downloaded' : 'Download .zip'}
    </button>
  );
  // The commands are its title (and announced on copy); nothing to install without operations.
  const installBtn = !empty && (
    <button key="install" type="button" className="btn lg" onClick={copy} title={commands}>
      {copied ? checkIcon(16) : COPY_ICON}{copied ? 'Copied' : 'Install command'}
    </button>
  );
  return (
    <div className="fhead-wrap">
      <div className="fhead">
        <div className="fhead-l">
          <h2 id="result-title" className="ftitle">{model.source.title}</h2>
          {/* Spacing separates the parts on screen; hidden commas separate them for screen readers and copy. */}
          <div className="meta">
            <span>{sourceLabel(model.source.kind, model.source.specVersion)}</span>
            <span><span className="visually-hidden">, </span><b>{ops}</b> {noun}</span>
            <span><span className="visually-hidden">, </span><b>{resources}</b> {resources === 1 ? 'resource' : 'resources'}</span>
            <span><span className="visually-hidden">, </span><b>{links}</b> {links === 1 ? 'link' : 'links'}</span>
            {sample && <span className="tag"><span className="visually-hidden">, </span>Sample</span>}
            {skill?.prose === 'ai' && <span className="tag" data-testid="prose-ai"><span className="visually-hidden">, </span>AI-drafted prose</span>}
            {/* The comma sits outside the button (out of flow, so no extra gap): the button's name stays "N warnings". */}
            {warnings > 0 && <span className="visually-hidden">, </span>}
            {warnings > 0 && (
              <button type="button" className="tag tag-btn" aria-expanded={warningsOpen} aria-controls={`${uid}w`} onClick={() => setWarningsOpen((o) => !o)}>
                {warnings} {warnings === 1 ? 'warning' : 'warnings'}
              </button>
            )}
          </div>
        </div>
        <div className="fhead-actions">{phone ? [downloadBtn, installBtn] : [installBtn, downloadBtn]}</div>
      </div>
      {warnings > 0 && (
        <ul className="warnings" id={`${uid}w`} hidden={!warningsOpen}>
          {model.warnings.slice(0, 100).map((w, i) => <li key={i}>{w.message}</li>)}
        </ul>
      )}
      {failed && <pre className="install-cmds"><code>{failed}</code></pre>}
    </div>
  );
}

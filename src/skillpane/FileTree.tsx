// The skill's files as a WAI-ARIA tree (rows of icon, name and count, V2Home): one Tab stop, arrows move, Right/Left open and close
// folders, Home/End jump, Enter or a click shows a file. Pure logic lives in tree.ts.
import { type CSSProperties, type KeyboardEvent, useRef, useState } from 'react';
import { CHEVRON_ICON, FILE_ICON, FOLDER_ICON } from '../design/icons';
import { ancestors, treeKey, treeRows } from './tree';
import { Breakable } from '../design/breaks';

/** `phone`: 44 px rows, a file's row ends in a chevron (it opens the preview). */
interface FileTreeProps { paths: string[]; selected: string; onSelect: (path: string) => void; phone?: boolean }

export function FileTree({ paths, selected, onSelect, phone = false }: FileTreeProps) {
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(ancestors(selected)));
  const [focus, setFocus] = useState(selected);
  const [shown, setShown] = useState(selected);
  const box = useRef<HTMLDivElement>(null);
  // A file chosen from elsewhere ("In the skill") opens its folders and becomes the Tab stop.
  if (shown !== selected) {
    setShown(selected);
    setFocus(selected);
    setOpen((o) => new Set([...o, ...ancestors(selected)]));
  }
  const rows = treeRows(paths, open);
  const at = Math.max(0, rows.findIndex((r) => r.path === focus));
  const toggle = (path: string, on: boolean) =>
    setOpen((o) => new Set(on ? [...o, path] : [...o].filter((p) => p !== path)));

  const onKeyDown = (e: KeyboardEvent) => {
    const a = treeKey(rows, at, e.key);
    if (!a) return;
    e.preventDefault();
    if (a.open || a.close) toggle((a.open ?? a.close)!, !!a.open);
    if (a.select) onSelect(a.select);
    if (a.focus === undefined) return;
    setFocus(rows[a.focus]!.path);
    box.current?.querySelector<HTMLElement>(`[data-path="${CSS.escape(rows[a.focus]!.path)}"]`)?.focus();
  };
  return (
    // oxlint-disable-next-line jsx-a11y/interactive-supports-focus -- roving tabindex: the items are the Tab stop
    <div role="tree" aria-label="Skill files" className="tree" ref={box} onKeyDown={onKeyDown}>
      {rows.map((r, i) => (
        // oxlint-disable-next-line jsx-a11y/click-events-have-key-events -- keys are handled on the tree
        <div role="treeitem" key={r.path} data-path={r.path} aria-level={r.level} aria-posinset={r.pos} aria-setsize={r.size}
          aria-expanded={r.folder ? r.open : undefined} aria-selected={r.folder ? undefined : r.path === selected}
          tabIndex={i === at ? 0 : -1} style={{ '--level': r.level } as CSSProperties}
          onFocus={() => setFocus(r.path)} onClick={() => (r.folder ? toggle(r.path, !r.open) : onSelect(r.path))}>
          {r.folder ? FOLDER_ICON : FILE_ICON}
          <span className="n"><Breakable text={r.folder ? r.name.slice(0, -1) : r.name} /></span>
          {r.folder ? <span className="count"><span className="visually-hidden">, </span>{r.files}<span className="visually-hidden"> {r.files === 1 ? 'file' : 'files'}</span></span> : phone && CHEVRON_ICON}
        </div>
      ))}
    </div>
  );
}

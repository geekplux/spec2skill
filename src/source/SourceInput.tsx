// The hero's source field (docs/redesign/DESIGN.md 4.2): paste a URL or spec text, open or drop a file,
// and Generate. The kind of source is detected (src/source/fetchSource.ts); there is no selector.
// Enter submits, Shift+Enter adds a line. Generate with an empty field writes the current skill again.
import { type DragEvent, type FormEvent, type KeyboardEvent, type RefObject, useRef, useState } from 'react';
import { sourceFieldLoads } from '../map/keyboard';
import { type Input, isUrlInput } from './fetchSource';

export const ACCEPT = '.json,.yaml,.yml,application/json,application/yaml';

interface SourceInputProps {
  /** The field's text; the app clears it once pasted text is loaded and shows a loaded URL. */
  value: string;
  onValue: (value: string) => void;
  onLoad: (input: Input) => void;
  /** Generate with an empty field: write the current skill again. */
  onGenerate: () => void;
  field: RefObject<HTMLTextAreaElement | null>;
}

/** The file a drag carries, if any (the first one). */
const dropped = (e: DragEvent) => e.dataTransfer.files?.[0];
const carriesFile = (e: DragEvent) => [...e.dataTransfer.types].includes('Files');

export function SourceInput({ value, onValue, onLoad, onGenerate, field }: SourceInputProps) {
  const picker = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const submit = (e: FormEvent | KeyboardEvent) => {
    e.preventDefault();
    const text = value.trim();
    if (!text) onGenerate();
    else onLoad(isUrlInput(text) ? { url: text } : { text });
  };
  const onDrag = (e: DragEvent) => {
    if (!carriesFile(e)) return;
    e.preventDefault();
    setOver(e.type !== 'dragleave');
  };
  return (
    <form className="source" onSubmit={submit}>
      {/* Drag and drop a spec file anywhere on the field; the Open file button is the keyboard way. */}
      <div className="source-field" data-drop={over || undefined} onDragEnter={onDrag} onDragOver={onDrag} onDragLeave={onDrag}
        onDrop={(e) => {
          const file = dropped(e);
          if (!file) return;
          e.preventDefault();
          setOver(false);
          onLoad({ file });
        }}>
        <label htmlFor="source-field" className="visually-hidden">OpenAPI or MCP URL, or the spec text</label>
        <span id="source-hint" className="visually-hidden">Enter loads. Shift+Enter adds a new line. You can also drop a spec file here.</span>
        <textarea id="source-field" ref={field} className="input" rows={1} value={value} spellCheck={false} autoComplete="off"
          aria-describedby="source-hint" placeholder="OpenAPI or MCP URL, or paste the spec" onChange={(e) => onValue(e.target.value)}
          onKeyDown={(e) => sourceFieldLoads(e.key, e.shiftKey) && !e.nativeEvent.isComposing && submit(e)} />
        <button type="button" className="icon-btn open-file" aria-label="Open a spec file" title="Open a spec file" onClick={() => picker.current?.click()}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" aria-hidden="true">
            <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h2.8l1.4 1.5h4.8A1.5 1.5 0 0 1 14 6v5.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5z" />
          </svg>
        </button>
        <input ref={picker} type="file" className="visually-hidden" accept={ACCEPT} tabIndex={-1} aria-hidden="true"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) onLoad({ file });
          }} />
        <button type="submit" className="generate">Generate</button>
      </div>
    </form>
  );
}

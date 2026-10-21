/** Floating camera controls (top-left of the map, before it in Tab order). Keys on the map: + and - zoom, 0 fits, ? lists all keys. */
export function Toolbar({ onZoom, onFit, onHelp }: { onZoom: (factor: number) => void; onFit: () => void; onHelp: () => void }) {
  return (
    <fieldset className="toolbar">
      <legend className="visually-hidden">Map view</legend>
      <button type="button" className="btn" aria-label="Zoom out" aria-keyshortcuts="-" onClick={() => onZoom(0.8)}>
        <span aria-hidden="true">−</span>
      </button>
      <button type="button" className="btn" aria-label="Zoom in" aria-keyshortcuts="+" onClick={() => onZoom(1.25)}>
        <span aria-hidden="true">+</span>
      </button>
      <button type="button" className="btn" aria-label="Fit to screen" aria-keyshortcuts="0" onClick={onFit}>
        Fit
      </button>
      <button type="button" className="btn" aria-label="Keyboard shortcuts" aria-keyshortcuts="?" onClick={onHelp}>
        <span aria-hidden="true">?</span>
      </button>
    </fieldset>
  );
}

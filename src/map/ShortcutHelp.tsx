import { Fragment, useEffect, useRef } from 'react';

const SHORTCUTS: [string, string][] = [
  ['Tab', 'Enter the map (one stop), then on to the details'],
  ['Arrow keys', 'Nearest operation in that direction'],
  ['Shift + arrow keys', 'Pan the map'],
  ['Page Up / Page Down', 'Previous / next cluster'],
  ['Home / End', 'First / last operation in the cluster'],
  ['E', "Cycle the focused operation's edges"],
  ['Enter', 'Follow the highlighted edge, or open details'],
  ['Space', 'Open details'],
  ['Esc', 'Clear the edge highlight, then close details'],
  ['+ / -', 'Zoom in / out'],
  ['0', 'Fit the whole atlas'],
  ['?', 'This list'],
];

/** The `?` dialog: a native modal <dialog> traps focus, closes on Esc and returns focus where it was. */
export function ShortcutHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="help" aria-labelledby="help-title" onClose={onClose}>
      <h2 id="help-title">Keyboard shortcuts</h2>
      <dl>
        {SHORTCUTS.map(([key, what]) => (
          <Fragment key={key}><dt><kbd>{key}</kbd></dt><dd>{what}</dd></Fragment>
        ))}
      </dl>
      <form method="dialog"><button className="btn">Close</button></form>
    </dialog>
  );
}

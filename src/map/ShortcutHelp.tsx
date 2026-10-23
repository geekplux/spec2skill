// The `?` dialog: every shortcut, rendered from the same table keyboard.ts documents (so it cannot
// drift). A native modal <dialog>: the page behind is inert, Esc closes, focus returns where it was.
import { Fragment, useEffect, useRef } from 'react';
import { SHORTCUTS, keyLabel } from './keyboard';

export function ShortcutHelp({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const back = useRef(document.activeElement as HTMLElement | null); // read on first render, before the dialog takes focus
  useEffect(() => {
    const [d, to] = [dialog.current!, back.current];
    if (!d.open) d.showModal();
    return () => to?.focus();
  }, []);
  const groups = [...new Set(SHORTCUTS.map((s) => s.where))];
  return (
    <dialog ref={dialog} className="help-dialog" aria-labelledby="help-title" onClose={onClose}>
      <div className="help-head">
        <h2 id="help-title">Keyboard shortcuts</h2>
        <form method="dialog"><button type="submit" className="btn">Close</button></form>
      </div>
      {groups.map((where) => (
        <table key={where}>
          <caption>{where}</caption>
          <tbody>
            {SHORTCUTS.filter((s) => s.where === where).map((s) => (
              <tr key={s.what}>
                <th scope="row">{s.keys.map((k, i) => <Fragment key={k}>{i > 0 && ' '}<kbd>{keyLabel(k)}</kbd></Fragment>)}</th>
                <td>{s.what}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
    </dialog>
  );
}

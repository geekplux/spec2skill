// The map's key, in the tools row (docs/DESIGN.md 4): the three line styles drawn at rest.
// Line style tells them apart, never colour alone: solid, dashed, and the thicker workflow line.
/** `workflow`: the map draws a strongest workflow (no entry for a line that is not there). */
export function Legend({ workflow }: { workflow: boolean }) {
  return (
    <ul className="legend" aria-label="Legend">
      <li><svg width="24" height="8" aria-hidden="true"><path className="lg-feed" d="M0 4h24" /></svg>Output feeds input</li>
      <li><svg width="24" height="8" aria-hidden="true"><path className="lg-feed" data-inferred="true" d="M0 4h24" /></svg>Inferred</li>
      {workflow && <li><svg width="24" height="8" aria-hidden="true"><path className="lg-route" d="M1 4h22" /></svg>Strongest workflow</li>}
    </ul>
  );
}

// "Samples" and a segmented control under the source field (docs/redesign/DESIGN.md 4.2): native radio
// buttons, so arrow keys move and select and Tab enters the group once. While the user's own source is
// shown, no sample is selected (Tab then reaches the first one).
import { SAMPLES, type Sample } from '../samples';

interface SamplesProps {
  /** The sample shown, or undefined while a user-loaded source is shown. */
  value?: string;
  onSelect: (sample: Sample) => void;
}

export function Samples({ value, onSelect }: SamplesProps) {
  return (
    <div className="samples">
      <span id="samples-label" className="samples-label">Samples</span>
      <div className="seg" role="radiogroup" aria-labelledby="samples-label">
        {SAMPLES.map((s) => (
          <label key={s.id} className="seg-item" data-sample={s.id}>
            <input type="radio" name="sample" className="visually-hidden" value={s.id} checked={s.id === value}
              onChange={() => onSelect(s)} />
            {s.label}
          </label>
        ))}
      </div>
    </div>
  );
}

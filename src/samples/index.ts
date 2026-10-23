// Built-in samples (docs/PLAN.md 5.6), bundled statically so they render offline with no key.
import filesystem from '../../samples/mcp-filesystem.tools-list.json';
import petstore from '../../samples/petstore-swagger2.json';
import tasksText from '../../samples/tasks-openapi31.yaml?raw';
import type { McpOptions } from '../model/mcp';
import { normalise } from '../model/normalise';
import type { ApiModel, SourceKind } from '../model/types';
import { parseText } from '../parse/text';

export interface Sample {
  id: string;
  /** Short name for the sample picker. */
  label: string;
  kind: SourceKind;
  /** The raw document. */
  load: () => unknown;
  /** What the recording's `initialize` reported (MCP only). */
  options?: McpOptions;
}

export const SAMPLES: readonly Sample[] = [
  { id: 'tasks', label: 'Tasks API', kind: 'openapi3', load: () => parseText(tasksText).value },
  { id: 'petstore', label: 'Petstore', kind: 'swagger2', load: () => petstore },
  {
    id: 'filesystem',
    label: 'Filesystem', // the chip appends the kind tag, so it reads "Filesystem MCP"
    kind: 'mcp',
    load: () => filesystem,
    options: { serverInfo: { name: 'secure-filesystem-server', version: '2.0.0' }, protocolVersion: '2025-06-18' },
  },
];

export const DEFAULT_SAMPLE_ID = 'tasks';

export function getSample(id: string): Sample | undefined {
  return SAMPLES.find((sample) => sample.id === id);
}

const models = new Map<string, Promise<ApiModel>>();

/** The sample's normalised model; one stable promise per sample (React `use` needs that). */
export function sampleModel(sample: Sample): Promise<ApiModel> {
  let model = models.get(sample.id);
  if (!model) {
    model = normalise(sample.load(), sample.options);
    models.set(sample.id, model);
  }
  return model;
}

import petstore from '../../samples/petstore-swagger2.json';

export type SampleKind = 'openapi3' | 'swagger2' | 'mcp';

export interface Sample {
  id: string;
  kind: SampleKind;
  /** The raw document, bundled statically so samples work offline. */
  load: () => unknown;
}

export const SAMPLES: readonly Sample[] = [
  { id: 'petstore', kind: 'swagger2', load: () => petstore },
];

export const DEFAULT_SAMPLE_ID = 'petstore';

export function getSample(id: string): Sample | undefined {
  return SAMPLES.find((sample) => sample.id === id);
}

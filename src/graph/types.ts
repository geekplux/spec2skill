// The relationship graph inferred from an ApiModel (docs/PLAN.md 5.3/5.4): plain JSON,
// deterministic for a given model, snapshot-tested.
import type { Crud } from '../model/types';

export type EdgeKind = 'feeds' | 'sub-path' | 'shared-schema';
export type Confidence = 'exact' | 'inferred';

export interface Edge {
  /** `${kind}:${from}->${to}`: one edge per kind and operation pair. */
  id: string;
  kind: EdgeKind;
  /** Operation ids; `shared-schema` is undirected and `from` is the earlier operation. */
  from: string;
  to: string;
  /** Short text on the edge: `assigneeId -> memberId`, `/tasks`, `Task`. */
  label: string;
  evidence: string;
  confidence: Confidence;
  /** The bundle this feeds edge is drawn as on the map (it stays a full edge everywhere else). */
  bundledInto?: string;
}

/** Repeated feeds from one source into one other cluster through the same input (rule 6), drawn
 *  on the map as one edge to that cluster: `projectId -> 4 ops in Members`. */
export interface Bundle { id: string; from: string; cluster: string; param: string; label: string; edges: string[] }

export interface Cluster {
  id: string;
  name: string;
  description: string;
  nameSource: 'deterministic' | 'ai';
  /** Ordered list, create, read, update, delete, action; ties keep model order. */
  operationIds: string[];
}

export interface AtlasGraph {
  clusters: Cluster[];
  /** Ordered sub-path, shared-schema, feeds; then by source and target model order. */
  edges: Edge[];
  crud: Record<string, Crud>;
  /** Schemas used by more than HUB_THRESHOLD operations: badges, not edges. */
  hubSchemas: { name: string; usedBy: number }[];
  bundles: Bundle[];
}

export const HUB_THRESHOLD = 8;
export const MAX_INCOMING_FEEDS = 6;
/** A source feeding the same input into more than this many operations of one cluster is bundled. */
export const BUNDLE_OVER = 3;

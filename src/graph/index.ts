// buildGraph: the deterministic AtlasGraph of an ApiModel (PLAN 5.4).
import type { ApiModel } from '../model/types';
import { buildClusters, clusterKeys } from './cluster';
import { classifyCrud } from './crud';
import { feedsEdges, sharedSchemaEdges, subPathEdges } from './infer';
import type { AtlasGraph, EdgeKind } from './types';

export type { AtlasGraph, Cluster, Edge, EdgeKind } from './types';
export { CRUD_LETTER, CRUD_ORDER } from './crud';

const KIND_ORDER: EdgeKind[] = ['sub-path', 'shared-schema', 'feeds'];

export function buildGraph(model: ApiModel): AtlasGraph {
  const crud = classifyCrud(model);
  const keys = clusterKeys(model.operations);
  const shared = sharedSchemaEdges(model);
  const index = new Map(model.operations.map((op, i) => [op.id, i]));
  const edges = [...subPathEdges(model.operations), ...shared.edges, ...feedsEdges(model, crud, keys)].toSorted(
    (a, b) =>
      KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
      index.get(a.from)! - index.get(b.from)! ||
      index.get(a.to)! - index.get(b.to)!,
  );
  return { clusters: buildClusters(model, crud, keys), edges, crud, hubSchemas: shared.hubSchemas };
}

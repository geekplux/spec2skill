// buildGraph: the deterministic AtlasGraph of an ApiModel (PLAN 5.4).
import type { ApiModel } from '../model/types';
import { buildClusters, clusterKeys } from './cluster';
import { classifyCrud } from './crud';
import { bundleFeeds, feedsEdges, sharedSchemaEdges, subPathEdges } from './infer';
import type { AtlasGraph, EdgeKind } from './types';

export type { AtlasGraph, Bundle, Cluster, Edge, EdgeKind } from './types';
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
  const clusters = buildClusters(model, crud, keys);
  return { clusters, ...bundleFeeds(edges, clusters), crud, hubSchemas: shared.hubSchemas };
}

const graphs = new WeakMap<ApiModel, AtlasGraph>();
/** `buildGraph`, once per model object (the loader and the views share it). */
export function graphOf(model: ApiModel): AtlasGraph {
  let graph = graphs.get(model);
  if (!graph) graphs.set(model, (graph = buildGraph(model)));
  return graph;
}

// Asks for AI names and prose once the deterministic skill and map are on screen (`enabled`); the
// answer, if any, arrives later and is swapped in by the caller. One client (and cache) per page.
import { useEffect, useState } from 'react';
import type { AtlasGraph } from '../graph/types';
import type { ApiModel } from '../model/types';
import { type AiResult, aiClient } from './client';

let client: ReturnType<typeof aiClient> | undefined;
const storage = () => {
  try {
    return window.localStorage;
  } catch {
    return undefined; // blocked storage: no browser cache, the Worker's KV still applies
  }
};

export function useAi(model: ApiModel, graph: AtlasGraph, enabled: boolean): AiResult | undefined {
  const [got, setGot] = useState<{ hash: string; result?: AiResult }>();
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    client ??= aiClient({ fetch: (input, init) => fetch(input, init), store: storage() });
    void client.describe(model, graph).then((result) => live && setGot({ hash: model.hash, result }));
    return () => {
      live = false;
    };
  }, [enabled, model, graph]);
  return got?.hash === model.hash ? got.result : undefined;
}

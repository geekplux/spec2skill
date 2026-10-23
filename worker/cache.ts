// The AI result cache: KV namespace SPEC_CACHE (optional: no binding = no cache). Keys come from
// cacheKey(), computed here from the received summary, never from the client. KV errors only cost a miss.

export interface KvLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export const TTL_SECONDS = 30 * 24 * 60 * 60;

export async function cacheGet(kv: KvLike | undefined, key: string): Promise<string | undefined> {
  try {
    return (await kv?.get(key)) ?? undefined;
  } catch {
    return undefined;
  }
}

export async function cachePut(kv: KvLike | undefined, key: string, value: unknown): Promise<void> {
  try {
    await kv?.put(key, JSON.stringify(value), { expirationTtl: TTL_SECONDS });
  } catch {
    // a full or rate-limited KV only means the next identical summary asks the model again
  }
}

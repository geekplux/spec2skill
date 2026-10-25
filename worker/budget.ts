// Site-wide daily cap on Workers AI calls (/api/ai/describe). AI_RATE_LIMITER is per IP and the cache key comes
// from the summary a client sends, so without this many IPs or varied summaries could call the model without end.
// KV counters are not atomic, so the cap is soft (a burst can overshoot by a few calls). Every attempt counts,
// failed or not (a failed call is billed too); cache hits never reach it.
import type { KvLike } from './cache';

export const DEFAULT_DAILY_AI_CAP = 300;
const BUDGET_TTL_SECONDS = 2 * 24 * 60 * 60;

/** `budget:ai:<YYYY-MM-DD>` for the UTC day of `now`. */
export const budgetKey = (now: Date): string => `budget:ai:${now.toISOString().slice(0, 10)}`;

/** `DAILY_AI_CAP` as a whole number; anything else falls back to the default. "0" switches AI off. */
export function dailyCap(raw: string | undefined): number {
  return raw !== undefined && /^\d+$/.test(raw.trim()) ? Number(raw) : DEFAULT_DAILY_AI_CAP;
}

/**
 * Takes one unit of today's budget: true if the model may be called. False when it is used up, or when there is
 * no KV to count in (branch previews fail closed, so a public preview URL cannot spend without limit).
 */
export async function takeBudget(kv: KvLike | undefined, cap: number, now = new Date()): Promise<boolean> {
  if (!kv || cap <= 0) return false;
  const key = budgetKey(now);
  let used = 0;
  try {
    used = Number.parseInt((await kv.get(key)) ?? '0', 10) || 0;
  } catch {
    // an unreadable counter counts as zero: the per-IP limiter still applies
  }
  if (used >= cap) return false;
  try {
    await kv.put(key, String(used + 1), { expirationTtl: BUDGET_TTL_SECONDS });
  } catch {
    // a failed write only loses one count
  }
  return true;
}

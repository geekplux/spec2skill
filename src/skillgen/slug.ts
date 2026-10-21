// The skill's slug and the environment-variable prefix derived from it (shared with the detail
// panel's curl example, so both name the same variables). Pure.
import type { ApiModel } from '../model/types';
import { kebab, plain } from './sanitize';

/** Words that say nothing about the API ("secure-filesystem-server" -> "filesystem"). */
const NOISE = new Set(['api', 'mcp', 'server', 'swagger', 'openapi', 'secure']);

/** `tasks-api`, `petstore-api`, `filesystem-mcp`: kebab, at most 64 characters. */
export function skillSlug(model: ApiModel): string {
  const suffix = model.source.kind === 'mcp' ? 'mcp' : 'api';
  const words = kebab(plain(model.source.serverInfo?.name ?? model.source.title, 200), 200).split('-').filter((w) => w && !NOISE.has(w));
  return `${kebab(words.join('-'), 60) || 'service'}-${suffix}`;
}

/** `TASKS_API` from `tasks-api`: the prefix of the variables holding the base URL and credentials. */
export const envPrefix = (slug: string): string => slug.toUpperCase().replaceAll('-', '_');

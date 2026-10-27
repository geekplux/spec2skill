// Tiny word helpers for names: split identifiers, singularise with a small rule table.

/** `list_directory_with_sizes`, `getPetById`, `project-id` -> lower-case words. */
export function words(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function singular(word: string): string {
  if (word.length < 4) return word;
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (/(ss|sh|ch|x|z|us)es$/.test(word)) return word.slice(0, -2);
  if (/(ss|us|is)$/.test(word) || !word.endsWith('s')) return word;
  return word.slice(0, -1);
}

export const capitalise = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** MCP verb prefixes (relationship rule 2). */
const VERB_TABLE = { list: 'list search find', create: 'create add write', read: 'get read fetch describe', update: 'update edit move rename set', delete: 'delete remove' } as const;
export const VERBS = new Map(
  Object.entries(VERB_TABLE).flatMap(([crud, verbs]) => verbs.split(' ').map((verb) => [verb, crud as keyof typeof VERB_TABLE] as const)),
);

/** A count with its noun in agreement: `counted(1, 'relationship')` -> `1 relationship`, `counted(3, 'cluster')` -> `3 clusters`. */
export const counted = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

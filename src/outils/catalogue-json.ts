/** Stable JSON comparison: object order is irrelevant and JSON numbers normalize -0 to 0. */
export function jsonCanonique(donnees: Record<string, unknown>): string {
  return JSON.stringify(donnees, (_key, value: unknown) => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
    const fields = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(fields).sort().map((k) => [k, fields[k]]));
  });
}

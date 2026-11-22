// The closed list of the capacities a fitting may give (H-4), in the order the result shows them. A code of this list is the only
// value the catalogue import accepts for `capacite`; the calculation reads the column and names its own computation per code.
// Adding a capacity is a code change with its test, never a data change. Pure: no database.

export const CODES_CAPACITE = [
  'fret_cache', 'equipage_max_pct', 'provisions', 'hydroponie', 'sommeil_froid', 'soute_exode', 'canots', 'cabines_luxe', 'colonie',
] as const
export type CodeCapacite = (typeof CODES_CAPACITE)[number]
export const estCapacite = (v: unknown): v is CodeCapacite => typeof v === 'string' && (CODES_CAPACITE as readonly string[]).includes(v)

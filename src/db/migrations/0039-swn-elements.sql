-- kanevas-carte-spatiale-elements-service (AD-elements-1; number provisional until the merge of the slice, AD-51).
-- The non-celestial elements of a defined system (ships, cities, stations, bases), as `docs/donnees.md` writes them.
-- Only src/services/swn/ecriture-elements.ts writes them and `elementLisible` (lisibilite.ts) is the one reader of `secret` (AD-2).
-- An element on a body stores neither orbit nor hour: its place is the body's, derived at each read, so it follows the body.
CREATE TABLE swn_elements (
  id INTEGER PRIMARY KEY,
  systeme_id INTEGER NOT NULL REFERENCES swn_systemes(id) ON DELETE CASCADE,
  cle TEXT NOT NULL CHECK (length(cle) BETWEEN 1 AND 200),
  genre TEXT NOT NULL CHECK (genre IN ('vaisseau', 'ville', 'station', 'base', 'autre')),
  nom TEXT NOT NULL CHECK (length(nom) BETWEEN 1 AND 80),
  description TEXT CHECK (description IS NULL OR length(description) <= 2000),
  astre_id INTEGER REFERENCES swn_astres(id) ON DELETE CASCADE,
  orbite REAL,
  heure REAL,
  aspect TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(aspect) AND json_type(aspect) = 'object' AND length(aspect) <= 4000),
  fiche_id INTEGER REFERENCES fiches(id) ON DELETE SET NULL,
  secret INTEGER NOT NULL DEFAULT 0 CHECK (secret IN (0, 1)),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  version_importee INTEGER,
  UNIQUE (systeme_id, cle),
  CHECK ((astre_id IS NOT NULL) = (orbite IS NULL AND heure IS NULL)),
  CHECK ((orbite IS NULL) = (heure IS NULL)),
  CHECK (orbite IS NULL OR (orbite >= 0 AND heure >= 0 AND heure < 12))
);
CREATE INDEX idx_swn_elements_systeme ON swn_elements (systeme_id);
CREATE INDEX idx_swn_elements_astre ON swn_elements (astre_id);
CREATE INDEX idx_swn_elements_fiche ON swn_elements (fiche_id);

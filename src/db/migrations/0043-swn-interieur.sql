-- kanevas-carte-spatiale-systeme-lecture (AD-systeme-4; number provisional until the merge of the slice, AD-51).
-- The interior of a defined system: its bodies and its zones, as `docs/donnees.md` writes them. Only src/services/swn/* reads or writes them (AD-2).
-- A body has no secret of its own: the secret of the system is the only one that hides it. The existing systems stay as they are.
CREATE TABLE swn_astres (
  id INTEGER PRIMARY KEY,
  systeme_id INTEGER NOT NULL REFERENCES swn_systemes(id) ON DELETE CASCADE,
  cle TEXT NOT NULL CHECK (length(cle) BETWEEN 1 AND 200),
  genre TEXT NOT NULL CHECK (genre IN ('etoile', 'planete', 'lune', 'comete')),
  parent_id INTEGER REFERENCES swn_astres(id) ON DELETE CASCADE,
  etoile_rang INTEGER NOT NULL DEFAULT 0 CHECK (etoile_rang >= 0),
  type TEXT NOT NULL CHECK (length(type) BETWEEN 1 AND 40),
  nom TEXT CHECK (nom IS NULL OR length(nom) BETWEEN 1 AND 80),
  description TEXT CHECK (description IS NULL OR length(description) <= 2000),
  -- A moon turns round its planet: the core gives it an hour and no orbit, hence the nullable column.
  orbite REAL CHECK (orbite IS NULL OR orbite >= 0),
  heure REAL NOT NULL CHECK (heure >= 0 AND heure < 12),
  taille REAL NOT NULL CHECK (taille > 0),
  aspect TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(aspect) AND json_type(aspect) = 'object' AND length(aspect) <= 4000),
  fiche_id INTEGER REFERENCES fiches(id) ON DELETE SET NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  version_importee INTEGER,
  UNIQUE (systeme_id, cle),
  CHECK ((genre = 'lune') = (parent_id IS NOT NULL))
);
CREATE INDEX idx_swn_astres_parent ON swn_astres (parent_id);

CREATE TABLE swn_formations (
  id INTEGER PRIMARY KEY,
  systeme_id INTEGER NOT NULL REFERENCES swn_systemes(id) ON DELETE CASCADE,
  cle TEXT NOT NULL CHECK (length(cle) BETWEEN 1 AND 200),
  forme TEXT NOT NULL CHECK (forme IN ('anneau', 'nuage')),
  etoile_rang INTEGER NOT NULL DEFAULT 0 CHECK (etoile_rang >= 0),
  nom TEXT CHECK (nom IS NULL OR length(nom) BETWEEN 1 AND 80),
  description TEXT CHECK (description IS NULL OR length(description) <= 2000),
  parametres TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(parametres) AND json_type(parametres) = 'object' AND length(parametres) <= 8000),
  fiche_id INTEGER REFERENCES fiches(id) ON DELETE SET NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  version_importee INTEGER,
  UNIQUE (systeme_id, cle)
);

-- Radius of the transition zone; null: the core's default for the system.
ALTER TABLE swn_systemes ADD COLUMN transition REAL CHECK (transition IS NULL OR transition >= 0);

-- Module swn, galaxy map (AD-122, AD-123, AD-132): the four tables, complete, so the write slice adds none.
-- Number provisional until merge (AD-51). Only src/services/swn/* reads or writes them (AD-2).
CREATE TABLE swn_galaxies (
  id INTEGER PRIMARY KEY,
  univers_id INTEGER NOT NULL REFERENCES univers(id) ON DELETE CASCADE,
  titre TEXT NOT NULL CHECK (length(titre) BETWEEN 1 AND 200),
  visible INTEGER NOT NULL DEFAULT 0 CHECK (visible IN (0, 1)),
  graine TEXT NOT NULL CHECK (length(graine) BETWEEN 1 AND 200),
  densite_defaut REAL NOT NULL DEFAULT 0.2 CHECK (densite_defaut BETWEEN 0 AND 1),
  fiche_id INTEGER REFERENCES fiches(id) ON DELETE SET NULL,
  section_id INTEGER REFERENCES sections(id) ON DELETE SET NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1)
);
-- No CHECK tying fiche_id to section_id: deleting a sheet removes its sections first, and the SET NULL of
-- section_id would then break it. The pair is kept consistent by the services that write it.
CREATE INDEX idx_swn_galaxies_univers ON swn_galaxies (univers_id);

CREATE TABLE swn_systemes (
  id INTEGER PRIMARY KEY,
  galaxie_id INTEGER NOT NULL REFERENCES swn_galaxies(id) ON DELETE CASCADE,
  univers_id INTEGER NOT NULL REFERENCES univers(id) ON DELETE CASCADE,
  cle TEXT NOT NULL CHECK (length(cle) BETWEEN 1 AND 200),
  nom TEXT NOT NULL CHECK (length(nom) BETWEEN 1 AND 80),
  q INTEGER NOT NULL,
  r INTEGER NOT NULL,
  taille INTEGER NOT NULL DEFAULT 2 CHECK (taille BETWEEN 1 AND 5),
  couleur TEXT NOT NULL DEFAULT 'neutre',
  notes TEXT NOT NULL DEFAULT '',
  secret INTEGER NOT NULL DEFAULT 0 CHECK (secret IN (0, 1)),
  promu INTEGER NOT NULL DEFAULT 1 CHECK (promu IN (0, 1)),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  UNIQUE (galaxie_id, q, r),
  UNIQUE (galaxie_id, cle),
  CHECK (abs(q) <= 100000 AND abs(r) <= 100000)
);
CREATE INDEX idx_swn_systemes_bloc ON swn_systemes (univers_id, q, r);

CREATE TABLE swn_routes (
  id INTEGER PRIMARY KEY,
  galaxie_id INTEGER NOT NULL REFERENCES swn_galaxies(id) ON DELETE CASCADE,
  univers_id INTEGER NOT NULL REFERENCES univers(id) ON DELETE CASCADE,
  depuis_id INTEGER NOT NULL REFERENCES swn_systemes(id) ON DELETE CASCADE,
  vers_id INTEGER NOT NULL REFERENCES swn_systemes(id) ON DELETE CASCADE,
  publique INTEGER NOT NULL DEFAULT 1 CHECK (publique IN (0, 1)),
  longueur INTEGER NOT NULL CHECK (longueur >= 1),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  UNIQUE (depuis_id, vers_id),
  CHECK (depuis_id <> vers_id)
);
CREATE INDEX idx_swn_routes_depuis ON swn_routes (depuis_id);
CREATE INDEX idx_swn_routes_vers ON swn_routes (vers_id);

CREATE TABLE swn_zones (
  id INTEGER PRIMARY KEY,
  galaxie_id INTEGER NOT NULL REFERENCES swn_galaxies(id) ON DELETE CASCADE,
  univers_id INTEGER NOT NULL REFERENCES univers(id) ON DELETE CASCADE,
  cle TEXT NOT NULL CHECK (length(cle) BETWEEN 1 AND 200),
  nom TEXT NOT NULL CHECK (length(nom) BETWEEN 1 AND 80),
  contour TEXT NOT NULL CHECK (json_valid(contour) AND json_type(contour) = 'array'),
  couleur TEXT NOT NULL DEFAULT 'neutre',
  densite REAL CHECK (densite IS NULL OR densite BETWEEN 0 AND 1),
  secret INTEGER NOT NULL DEFAULT 0 CHECK (secret IN (0, 1)),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  UNIQUE (galaxie_id, cle)
);

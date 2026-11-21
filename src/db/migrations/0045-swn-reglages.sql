-- kanevas-carte-spatiale-reglages-service (AD-reglages-1, AD-reglages-2; numbered 0040 after the merge of the elements slice (0039), AD-51).
-- The generator settings and the catalogue of aspects of a galaxy, as `docs/donnees.md` writes them. Only
-- src/services/swn/reglages.ts reads or writes them. No row is inserted: absent = the core's defaults and generator
-- version 1, so every galaxy existing now keeps drawing exactly what it drew.
CREATE TABLE swn_reglages (
  galaxie_id INTEGER PRIMARY KEY REFERENCES swn_galaxies(id) ON DELETE CASCADE,
  version_generateur INTEGER NOT NULL DEFAULT 1 CHECK (version_generateur >= 1),
  valeurs TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(valeurs) AND json_type(valeurs) = 'object' AND length(valeurs) <= 8192),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1)
);

CREATE TABLE swn_aspects (
  id INTEGER PRIMARY KEY,
  galaxie_id INTEGER NOT NULL REFERENCES swn_galaxies(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (length(type) BETWEEN 1 AND 40),
  parametres TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(parametres) AND json_type(parametres) = 'object' AND length(parametres) <= 4096),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  UNIQUE (galaxie_id, type)
);

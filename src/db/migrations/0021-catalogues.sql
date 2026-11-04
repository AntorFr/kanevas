-- Catalogue slice (AD-123, AD-130); number provisional until merge (AD-51).
CREATE TABLE jetons_outils (
  jeton_id INTEGER NOT NULL REFERENCES jetons_api(id) ON DELETE CASCADE,
  outil TEXT NOT NULL,
  PRIMARY KEY (jeton_id, outil)
);
ALTER TABLE lots_import ADD COLUMN outil TEXT;

CREATE TABLE essai_catalogue_elements (
  niveau TEXT NOT NULL CHECK (niveau IN ('systeme', 'univers')),
  systeme_id INTEGER REFERENCES systemes_jeu(id) ON DELETE CASCADE,
  univers_id INTEGER REFERENCES univers(id) ON DELETE CASCADE,
  nature TEXT NOT NULL CHECK (nature IN ('coques', 'armes')),
  cle TEXT NOT NULL CHECK (length(cle) BETWEEN 1 AND 64),
  nom TEXT NOT NULL,
  masse REAL NOT NULL CHECK (masse >= 0),
  cout INTEGER NOT NULL CHECK (cout >= 0 AND typeof(cout) = 'integer'),
  portee TEXT CHECK (portee IN ('courte', 'longue')),
  masque INTEGER NOT NULL DEFAULT 0 CHECK (masque IN (0, 1)),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  version_catalogue TEXT NOT NULL,
  CHECK ((niveau = 'systeme' AND systeme_id IS NOT NULL AND univers_id IS NULL)
      OR (niveau = 'univers' AND univers_id IS NOT NULL AND systeme_id IS NULL)),
  CHECK (niveau = 'univers' OR masque = 0),
  CHECK ((nature = 'coques' AND portee IS NULL) OR (nature = 'armes' AND portee IS NOT NULL))
);
-- Separate partial indexes enforce uniqueness despite the nullable opposite owner.
-- They also serve the adapter's single-level and key lookups.
CREATE UNIQUE INDEX essai_catalogue_systeme ON essai_catalogue_elements(systeme_id, nature, cle)
  WHERE niveau = 'systeme';
CREATE UNIQUE INDEX essai_catalogue_univers ON essai_catalogue_elements(univers_id, nature, cle)
  WHERE niveau = 'univers';
CREATE TABLE essai_catalogue_retraits (
  univers_id INTEGER NOT NULL REFERENCES univers(id) ON DELETE CASCADE,
  nature TEXT NOT NULL CHECK (nature IN ('coques', 'armes')),
  cle TEXT NOT NULL,
  PRIMARY KEY (univers_id, nature, cle)
);

-- Tools core (AD-121 module declaration, AD-125, AD-126).
-- Existing systems deliberately keep no stored owner. Number provisional until merge (AD-51).
ALTER TABLE systemes_jeu ADD COLUMN responsable_id INTEGER REFERENCES comptes(id) ON DELETE SET NULL;

CREATE TABLE outils_systeme (
  systeme_id INTEGER NOT NULL REFERENCES systemes_jeu(id) ON DELETE CASCADE,
  outil TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0, 1)),
  visibilite_mj INTEGER NOT NULL DEFAULT 1 CHECK (visibilite_mj IN (0, 1)),
  visibilite_joueur INTEGER NOT NULL DEFAULT 1 CHECK (visibilite_joueur IN (0, 1)),
  reglages TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(reglages) AND json_type(reglages) = 'object'),
  version_reglages INTEGER NOT NULL DEFAULT 0 CHECK (version_reglages >= 0),
  version_catalogue TEXT,
  PRIMARY KEY (systeme_id, outil)
);
CREATE TABLE outils_univers (
  univers_id INTEGER NOT NULL REFERENCES univers(id) ON DELETE CASCADE,
  outil TEXT NOT NULL,
  active INTEGER CHECK (active IN (0, 1)),
  visibilite_mj INTEGER CHECK (visibilite_mj IN (0, 1)),
  visibilite_joueur INTEGER CHECK (visibilite_joueur IN (0, 1)),
  reglages TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(reglages) AND json_type(reglages) = 'object'),
  version_reglages INTEGER NOT NULL DEFAULT 0 CHECK (version_reglages >= 0),
  version_catalogue TEXT,
  PRIMARY KEY (univers_id, outil)
);

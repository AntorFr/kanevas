-- kanevas-battlemap-assets: asset library and art direction of the battle map (AD-150 to AD-152, AD-163; number taken at merge, AD-51).
-- Expand only: three new tables. `bm_assets.fichier_id` is RESTRICT (a library file backing an asset cannot be deleted, like
-- `elements_carte`); the module's `effacer` removes the `bm_*` rows before any file goes. A reference vanishes with its file.
CREATE TABLE bm_assets (
  id INTEGER PRIMARY KEY,
  univers_id INTEGER NOT NULL REFERENCES univers(id) ON DELETE CASCADE,
  fichier_id INTEGER NOT NULL UNIQUE REFERENCES fichiers(id) ON DELETE RESTRICT,
  nom TEXT NOT NULL CHECK (length(nom) BETWEEN 1 AND 80),
  categorie TEXT NOT NULL CHECK (categorie IN ('objet', 'vaisseau', 'decor', 'sol', 'mur')),
  largeur INTEGER CHECK (largeur IS NULL OR (typeof(largeur) = 'integer' AND largeur BETWEEN 1 AND 20)),
  hauteur INTEGER CHECK (hauteur IS NULL OR (typeof(hauteur) = 'integer' AND hauteur BETWEEN 1 AND 20)),
  vue_dessus INTEGER NOT NULL DEFAULT 1 CHECK (vue_dessus IN (0, 1)),
  tags TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags) AND json_type(tags) = 'array' AND json_array_length(tags) <= 10),
  etat TEXT NOT NULL DEFAULT 'valide' CHECK (etat IN ('valide', 'brouillon')),
  cree_le TEXT NOT NULL,
  CHECK ((categorie IN ('sol', 'mur') AND largeur IS NULL AND hauteur IS NULL)
      OR (categorie NOT IN ('sol', 'mur') AND largeur IS NOT NULL AND hauteur IS NOT NULL))
);
CREATE INDEX idx_bm_assets_univers ON bm_assets (univers_id, categorie);

CREATE TABLE bm_direction (
  univers_id INTEGER PRIMARY KEY REFERENCES univers(id) ON DELETE CASCADE,
  texte TEXT NOT NULL DEFAULT '' CHECK (length(texte) <= 5000),
  texte_precedent TEXT CHECK (texte_precedent IS NULL OR length(texte_precedent) <= 5000),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  modifie_le TEXT NOT NULL
);

CREATE TABLE bm_direction_images (
  univers_id INTEGER NOT NULL REFERENCES univers(id) ON DELETE CASCADE,
  fichier_id INTEGER NOT NULL REFERENCES fichiers(id) ON DELETE CASCADE,
  legende TEXT NOT NULL DEFAULT '' CHECK (length(legende) <= 200),
  rang INTEGER NOT NULL CHECK (rang >= 1),
  PRIMARY KEY (univers_id, fichier_id)
);

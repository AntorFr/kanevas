-- kanevas-battlemap-editeur: the composed maps of the battle map (AD-154, AD-battlemap-editeur-1; number taken at merge, AD-51).
-- Expand only: one new table. `document` is the versioned JSON of the core (≤ 2 MB, validated by the core before each write);
-- `largeur` / `hauteur` repeat the document's size so that the list reads no JSON. `bm_tables` and `bm_pions_proprietaires`
-- belong to the table slice.
CREATE TABLE bm_cartes (
  id INTEGER PRIMARY KEY,
  univers_id INTEGER NOT NULL REFERENCES univers(id) ON DELETE CASCADE,
  titre TEXT NOT NULL CHECK (length(titre) BETWEEN 1 AND 80),
  visible INTEGER NOT NULL DEFAULT 0 CHECK (visible IN (0, 1)),
  largeur INTEGER NOT NULL CHECK (typeof(largeur) = 'integer' AND largeur BETWEEN 1 AND 200),
  hauteur INTEGER NOT NULL CHECK (typeof(hauteur) = 'integer' AND hauteur BETWEEN 1 AND 200),
  taille_case INTEGER NOT NULL DEFAULT 70 CHECK (typeof(taille_case) = 'integer' AND taille_case BETWEEN 20 AND 300),
  document TEXT NOT NULL CHECK (json_valid(document)),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  cree_le TEXT NOT NULL,
  modifie_le TEXT NOT NULL
);
CREATE INDEX idx_bm_cartes_univers ON bm_cartes (univers_id, titre COLLATE NOCASE);

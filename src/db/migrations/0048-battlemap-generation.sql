-- kanevas-battlemap-generation: the generation batches of the battle map (AD-157, AD-battlemap-generation-1; number taken at merge, AD-51).
-- Expand only: two new tables. A batch holds up to 20 lines; one batch not `termine` per universe at most (the partial unique
-- index is the guard of `lot_en_cours`). `asset_id` is SET NULL: removing an accepted asset from the library leaves the line
-- `accepte`. The module's `effacer` removes lines then batches before the assets' rows.
CREATE TABLE bm_lots (
  id INTEGER PRIMARY KEY,
  univers_id INTEGER NOT NULL REFERENCES univers(id) ON DELETE CASCADE,
  etat TEXT NOT NULL DEFAULT 'prepare' CHECK (etat IN ('prepare', 'en_cours', 'termine')),
  cree_par INTEGER NOT NULL REFERENCES comptes(id),
  cree_le TEXT NOT NULL,
  modifie_le TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_bm_lots_ouvert ON bm_lots (univers_id) WHERE etat <> 'termine';

CREATE TABLE bm_lots_lignes (
  id INTEGER PRIMARY KEY,
  lot_id INTEGER NOT NULL REFERENCES bm_lots(id) ON DELETE CASCADE,
  rang INTEGER NOT NULL CHECK (rang >= 1),
  nom TEXT NOT NULL CHECK (length(nom) BETWEEN 1 AND 80),
  categorie TEXT NOT NULL CHECK (categorie IN ('objet', 'vaisseau', 'decor', 'sol', 'mur')),
  largeur INTEGER CHECK (largeur IS NULL OR (typeof(largeur) = 'integer' AND largeur BETWEEN 1 AND 20)),
  hauteur INTEGER CHECK (hauteur IS NULL OR (typeof(hauteur) = 'integer' AND hauteur BETWEEN 1 AND 20)),
  indice TEXT NOT NULL DEFAULT '' CHECK (length(indice) <= 200),
  remarque TEXT NOT NULL DEFAULT '' CHECK (length(remarque) <= 500),
  etat TEXT NOT NULL DEFAULT 'attente'
    CHECK (etat IN ('attente', 'en_cours', 'brouillon', 'echec', 'accepte', 'ecarte', 'interrompu')),
  code_echec TEXT CHECK (code_echec IS NULL OR code_echec IN ('moteur', 'delai', 'image_invalide', 'bibliotheque_pleine', 'moteur_absent')),
  asset_id INTEGER REFERENCES bm_assets(id) ON DELETE SET NULL,
  UNIQUE (lot_id, rang)
);
CREATE INDEX idx_bm_lots_lignes_asset ON bm_lots_lignes (asset_id);

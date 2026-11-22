-- kanevas-battlemap-table: the game tables of the battle map (AD-battlemap-table-1, AD-battlemap-table-2; number taken at merge, AD-51).
-- Expand only: two new tables, no existing row touched. `etat` is the core's table state (tokens, revealed bitmap, shared view,
-- hidden layers), validated by the core before each write; it never carries an owner. A table has its own `version`, apart from
-- the map's. Owners are a separate table so that no read of the state can leak them. Both go with the map (`ON DELETE CASCADE`);
-- the module's `effacer` removes owners, then tables, before `bm_cartes`.
CREATE TABLE bm_tables (
  carte_id INTEGER PRIMARY KEY REFERENCES bm_cartes(id) ON DELETE CASCADE,
  etat TEXT NOT NULL CHECK (json_valid(etat)),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  cree_le TEXT NOT NULL,
  modifie_le TEXT NOT NULL
);

CREATE TABLE bm_pions_proprietaires (
  carte_id INTEGER NOT NULL REFERENCES bm_tables(carte_id) ON DELETE CASCADE,
  pion_id TEXT NOT NULL CHECK (length(pion_id) BETWEEN 1 AND 20),
  compte_id INTEGER NOT NULL REFERENCES comptes(id) ON DELETE CASCADE,
  PRIMARY KEY (carte_id, pion_id)
);
CREATE INDEX idx_bm_pions_proprietaires_compte ON bm_pions_proprietaires (compte_id);

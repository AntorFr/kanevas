-- migrate: sans-cles-etrangeres
-- Migration 0053 (kanevas-systemes-jeu-surcharge-socle, number taken at merge, AD-51, AD-153, AD-158, AD-147): a sheet of a
-- universe may be the customised copy of an element of the system's space. `surcharge_de` is the id of the original;
-- at most one copy per (universe, element). The foreign key has no `ON DELETE` action: whoever deletes an original
-- detaches its copies first (services/surcharge.ts), so a forgotten path fails loudly. What SQL cannot check (the
-- original lives in the space of the system attached to the copy's universe, same type, no chain) is checked there.
-- `historique.action` gains `detachee` (« devenue fiche ordinaire »): SQLite cannot widen a CHECK, so the table is
-- recreated (ids and lines kept). The sheet trigger below writes that line when `surcharge_de` goes from a value to
-- NULL, in the universe of the copy, and does not date the sheet (its content did not change).

ALTER TABLE fiches ADD COLUMN surcharge_de INTEGER REFERENCES fiches (id);
CREATE UNIQUE INDEX fiches_surcharge ON fiches (univers_id, surcharge_de) WHERE surcharge_de IS NOT NULL;

PRAGMA legacy_alter_table = ON;

CREATE TABLE historique_nouvelle (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  univers_id      INTEGER NOT NULL,
  fiche_id        INTEGER,
  fiche_cle       TEXT NOT NULL,
  fiche_titre     TEXT NOT NULL,
  objet           TEXT NOT NULL CHECK (objet IN ('entete', 'section', 'relation', 'fiche')),
  objet_cle       TEXT,
  action          TEXT NOT NULL CHECK (action IN ('creee', 'modifiee', 'supprimee', 'detachee')),
  empreinte_apres TEXT,
  compte_id       INTEGER REFERENCES comptes (id),
  jeton_id        INTEGER REFERENCES jetons_api (id),
  origine         TEXT NOT NULL CHECK (origine IN ('ecran', 'assistant', 'import', 'mcp', 'outil', 'inconnu')),
  lot_id          INTEGER,
  cree_le         TEXT NOT NULL,
  valeur_avant    TEXT CHECK (valeur_avant IS NULL OR json_valid(valeur_avant))
);

INSERT INTO historique_nouvelle (id, univers_id, fiche_id, fiche_cle, fiche_titre, objet, objet_cle, action, empreinte_apres, compte_id, jeton_id, origine, lot_id, cree_le, valeur_avant)
SELECT id, univers_id, fiche_id, fiche_cle, fiche_titre, objet, objet_cle, action, empreinte_apres, compte_id, jeton_id, origine, lot_id, cree_le, valeur_avant FROM historique;

DROP TABLE historique;
ALTER TABLE historique_nouvelle RENAME TO historique;

PRAGMA legacy_alter_table = OFF;

CREATE INDEX historique_univers ON historique (univers_id, id DESC);
CREATE INDEX historique_fiche ON historique (fiche_id, id DESC);
CREATE INDEX historique_cree_le ON historique (cree_le);

CREATE TRIGGER historique_fiches_detachee AFTER UPDATE OF surcharge_de ON fiches
  WHEN COALESCE((SELECT origine FROM contexte_ecriture WHERE id = 1), 'inconnu') <> 'systeme' AND OLD.surcharge_de IS NOT NULL AND NEW.surcharge_de IS NULL
  BEGIN
    INSERT INTO historique (univers_id, fiche_id, fiche_cle, fiche_titre, objet, objet_cle, action, compte_id, jeton_id, origine, lot_id, cree_le, valeur_avant)
    SELECT f.univers_id, f.id, f.cle, f.titre, 'fiche', NULL, 'detachee', c.compte_id, c.jeton_id, COALESCE(c.origine, 'inconnu'), c.lot_id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), json_object('surcharge_de', OLD.surcharge_de)
      FROM fiches f LEFT JOIN contexte_ecriture c ON c.id = 1
     WHERE f.id = NEW.id;
  END;

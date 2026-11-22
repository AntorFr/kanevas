-- migrate: sans-cles-etrangeres
-- Migration 0041 (kanevas-synchro-cartes-noyau, number taken at merge, AD-51, AD-142, AD-143): a map
-- gains an origin key, an attached sheet, a text (with its public copy) and a version; the instance
-- gains its settings. `fiche_id` is a foreign key `ON DELETE SET NULL`, which SQLite cannot add in
-- place: `cartes` is recreated (ids kept, `elements_carte` still points at the same rows) and the
-- file is played with foreign keys off, `foreign_key_check` running before the commit (db.ts).
-- Rules the base cannot express (the sheet belongs to the map's universe, the text is at most 5 000
-- characters) are enforced by services/cartes.ts. No `[[…]]` link of a map's text is stored (AD-142).

PRAGMA legacy_alter_table = ON;

CREATE TABLE cartes_nouvelle (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  univers_id   INTEGER NOT NULL REFERENCES univers (id),
  titre        TEXT NOT NULL CHECK (length(trim(titre)) BETWEEN 1 AND 80),
  forme        TEXT NOT NULL CHECK (forme IN ('illustree', 'graphe')),
  visible      INTEGER NOT NULL DEFAULT 0 CHECK (visible IN (0, 1)),
  fond         TEXT UNIQUE,
  fond_type    TEXT,
  cree_le      TEXT NOT NULL,
  cle_origine  TEXT CHECK (cle_origine IS NULL OR length(cle_origine) BETWEEN 1 AND 200),
  fiche_id     INTEGER REFERENCES fiches (id) ON DELETE SET NULL,
  texte        TEXT NOT NULL DEFAULT '',
  texte_public TEXT NOT NULL DEFAULT '',
  version      INTEGER NOT NULL DEFAULT 0,
  CHECK ((fond IS NULL) = (fond_type IS NULL)),
  CHECK (fond IS NULL OR forme = 'illustree')
);

INSERT INTO cartes_nouvelle (id, univers_id, titre, forme, visible, fond, fond_type, cree_le)
SELECT id, univers_id, titre, forme, visible, fond, fond_type, cree_le FROM cartes;

DROP TABLE cartes;
ALTER TABLE cartes_nouvelle RENAME TO cartes;

CREATE INDEX cartes_par_univers ON cartes (univers_id);
CREATE INDEX cartes_par_fiche ON cartes (fiche_id) WHERE fiche_id IS NOT NULL;
CREATE UNIQUE INDEX cartes_cle_origine ON cartes (univers_id, cle_origine) WHERE cle_origine IS NOT NULL;

-- The form is fixed at creation.
CREATE TRIGGER cartes_forme_figee BEFORE UPDATE OF forme ON cartes
WHEN NEW.forme <> OLD.forme
BEGIN
  SELECT RAISE(ABORT, 'la forme d''une carte ne change pas');
END;

PRAGMA legacy_alter_table = OFF;

CREATE TABLE reglages_instance (
  cle         TEXT PRIMARY KEY,
  valeur      TEXT NOT NULL,
  modifie_le  TEXT NOT NULL,
  modifie_par INTEGER REFERENCES comptes (id) ON DELETE SET NULL
);

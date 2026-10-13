-- migrate: sans-cles-etrangeres
-- Migration 0011 (kanevas-import-types, number taken at merge, AD-51): the types of a sheet leave the
-- database (AD-102, AD-120). `fiches` is recreated without the CHECK on `type` (SQLite cannot drop a
-- CHECK in place), with `parent_id` and `sous_type`; every other column is copied by name.
-- The runner plays this file with foreign keys off, outside the transaction pragma, and runs
-- `foreign_key_check` before committing (db.ts). Rights and validity of the type: services/fiches.ts.
-- No `legacy_alter_table` needed: only `fiches_nouvelle` is renamed, and nothing refers to it.

CREATE TABLE fiches_nouvelle (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  univers_id          INTEGER NOT NULL REFERENCES univers (id),
  type                TEXT NOT NULL,
  titre               TEXT NOT NULL CHECK (length(trim(titre)) BETWEEN 1 AND 120),
  charge              TEXT NOT NULL CHECK (json_valid(charge)),
  cree_le             TEXT NOT NULL,
  modifie_le          TEXT NOT NULL,
  illustration_fichier TEXT,
  illustration_type   TEXT
    CHECK (illustration_type IN ('image/png', 'image/jpeg', 'image/gif', 'image/webp')),
  illustration_taille INTEGER
    CHECK (illustration_taille > 0
      AND (illustration_fichier IS NULL) = (illustration_type IS NULL)
      AND (illustration_type IS NULL) = (illustration_taille IS NULL)),
  cle_origine         TEXT
    CHECK (cle_origine IS NULL OR length(cle_origine) BETWEEN 1 AND 200),
  dernier_import      TEXT
    CHECK (dernier_import IS NULL OR json_valid(dernier_import)),
  parent_id           INTEGER REFERENCES fiches (id) ON DELETE SET NULL,
  sous_type           TEXT
    CHECK (sous_type IS NULL OR length(trim(sous_type)) BETWEEN 1 AND 60),
  CHECK (parent_id IS NULL OR parent_id <> id)
);

INSERT INTO fiches_nouvelle (
  id, univers_id, type, titre, charge, cree_le, modifie_le,
  illustration_fichier, illustration_type, illustration_taille, cle_origine, dernier_import
)
SELECT
  id, univers_id, type, titre, charge, cree_le, modifie_le,
  illustration_fichier, illustration_type, illustration_taille, cle_origine, dernier_import
FROM fiches;

DROP TABLE fiches;
ALTER TABLE fiches_nouvelle RENAME TO fiches;

CREATE INDEX fiches_par_univers ON fiches (univers_id, type);
CREATE UNIQUE INDEX fiches_illustration_fichier ON fiches (illustration_fichier);
CREATE UNIQUE INDEX fiches_cle_origine ON fiches (univers_id, cle_origine);
CREATE INDEX fiches_par_parent ON fiches (parent_id);
CREATE INDEX fiches_par_sous_type ON fiches (univers_id, type, sous_type);

-- DROP TABLE took the search triggers with it (0005); same bodies.
CREATE TRIGGER fiches_recherche_ai AFTER INSERT ON fiches BEGIN
  INSERT INTO recherche_fiches (rowid, titre) VALUES (new.id, new.titre);
END;

CREATE TRIGGER fiches_recherche_au AFTER UPDATE OF titre ON fiches BEGIN
  DELETE FROM recherche_fiches WHERE rowid = old.id;
  INSERT INTO recherche_fiches (rowid, titre) VALUES (new.id, new.titre);
END;

CREATE TRIGGER fiches_recherche_ad AFTER DELETE ON fiches BEGIN
  DELETE FROM recherche_fiches WHERE rowid = old.id;
END;

-- Type switches (AD-102): a missing row means the default (system: on; universe: follows its system).
CREATE TABLE types_systeme (
  systeme_id INTEGER NOT NULL REFERENCES systemes_jeu (id),
  type       TEXT NOT NULL,
  active     INTEGER NOT NULL CHECK (active IN (0, 1)),
  PRIMARY KEY (systeme_id, type)
);

CREATE TABLE types_univers (
  univers_id INTEGER NOT NULL REFERENCES univers (id),
  type       TEXT NOT NULL,
  active     INTEGER NOT NULL CHECK (active IN (0, 1)),
  PRIMARY KEY (univers_id, type)
);

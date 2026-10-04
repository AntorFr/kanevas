-- Migration 0002 (kanevas-systemes, provisional number, AD-51): game systems,
-- their templates ("gabarits"), and the optional link from a universe to a
-- system. The catalogue starts empty; existing universes stay detached (NULL).
-- Nothing here deletes: no service removes a system or a template.

CREATE TABLE systemes_jeu (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  nom     TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(trim(nom)) BETWEEN 1 AND 80),
  cree_le TEXT NOT NULL
);

CREATE TABLE gabarits (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  systeme_id INTEGER NOT NULL REFERENCES systemes_jeu (id),
  type       TEXT NOT NULL CHECK (type IN ('regle', 'creature', 'objet')),
  nom        TEXT NOT NULL COLLATE NOCASE CHECK (length(trim(nom)) BETWEEN 1 AND 120),
  contenu    TEXT NOT NULL DEFAULT '' CHECK (length(contenu) <= 20000),
  version    INTEGER NOT NULL DEFAULT 1,
  cree_le    TEXT NOT NULL,
  modifie_le TEXT NOT NULL,
  UNIQUE (systeme_id, type, nom)
);

ALTER TABLE univers ADD COLUMN systeme_id INTEGER REFERENCES systemes_jeu (id);

CREATE INDEX univers_par_systeme ON univers (systeme_id);

-- Migration 0014 (kanevas-recherche-donnees, number taken at merge, AD-51, AD-118 (8)): aliases and
-- labels of a sheet, and `recherche_fiches` recreated as (titre, alias, sous_type).
-- Rules the base cannot express (same universe, at most 20 per sheet) live in services/etiquettes.ts.

CREATE TABLE fiche_alias (
  fiche_id INTEGER NOT NULL REFERENCES fiches (id) ON DELETE CASCADE,
  alias    TEXT NOT NULL CHECK (length(alias) BETWEEN 1 AND 120),
  UNIQUE (fiche_id, alias COLLATE NOCASE)
);

CREATE TABLE etiquettes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  univers_id INTEGER NOT NULL REFERENCES univers (id),
  nom        TEXT NOT NULL CHECK (length(nom) BETWEEN 1 AND 40),
  cree_le    TEXT NOT NULL,
  UNIQUE (univers_id, nom COLLATE NOCASE)
);

CREATE TABLE fiche_etiquettes (
  fiche_id     INTEGER NOT NULL REFERENCES fiches (id) ON DELETE CASCADE,
  etiquette_id INTEGER NOT NULL REFERENCES etiquettes (id) ON DELETE CASCADE,
  PRIMARY KEY (fiche_id, etiquette_id)
);

CREATE INDEX fiche_etiquettes_par_etiquette ON fiche_etiquettes (etiquette_id);

-- A virtual table cannot be altered: drop and recreate (its triggers go first).
DROP TRIGGER fiches_recherche_ai;
DROP TRIGGER fiches_recherche_au;
DROP TRIGGER fiches_recherche_ad;
DROP TABLE recherche_fiches;

CREATE VIRTUAL TABLE recherche_fiches USING fts5 (
  titre,
  alias,
  sous_type,
  tokenize = 'unicode61 remove_diacritics 2'
);

-- Backfill: an ordinary FTS5 table keeps its own content, so 'rebuild' has nothing to read from.
INSERT INTO recherche_fiches (rowid, titre, alias, sous_type)
SELECT f.id, f.titre,
  coalesce((SELECT group_concat(alias, ' ') FROM
    (SELECT alias FROM fiche_alias WHERE fiche_id = f.id ORDER BY alias COLLATE NOCASE)), ''),
  coalesce(f.sous_type, '')
FROM fiches f;

-- One row per sheet, recomputed whole (aliases joined in a stable order) by every trigger (AD-21).
CREATE TRIGGER fiches_recherche_ai AFTER INSERT ON fiches BEGIN
  INSERT INTO recherche_fiches (rowid, titre, alias, sous_type) VALUES (new.id, new.titre, '', coalesce(new.sous_type, ''));
END;

CREATE TRIGGER fiches_recherche_au AFTER UPDATE OF titre, sous_type ON fiches BEGIN
  DELETE FROM recherche_fiches WHERE rowid = old.id;
  INSERT INTO recherche_fiches (rowid, titre, alias, sous_type)
  SELECT new.id, new.titre,
    coalesce((SELECT group_concat(alias, ' ') FROM
      (SELECT alias FROM fiche_alias WHERE fiche_id = new.id ORDER BY alias COLLATE NOCASE)), ''),
    coalesce(new.sous_type, '');
END;

CREATE TRIGGER fiches_recherche_ad AFTER DELETE ON fiches BEGIN
  DELETE FROM recherche_fiches WHERE rowid = old.id;
END;

CREATE TRIGGER alias_recherche_ai AFTER INSERT ON fiche_alias BEGIN
  DELETE FROM recherche_fiches WHERE rowid = new.fiche_id;
  INSERT INTO recherche_fiches (rowid, titre, alias, sous_type)
  SELECT f.id, f.titre,
    coalesce((SELECT group_concat(alias, ' ') FROM
      (SELECT alias FROM fiche_alias WHERE fiche_id = f.id ORDER BY alias COLLATE NOCASE)), ''),
    coalesce(f.sous_type, '')
  FROM fiches f WHERE f.id = new.fiche_id;
END;

CREATE TRIGGER alias_recherche_au AFTER UPDATE ON fiche_alias BEGIN
  DELETE FROM recherche_fiches WHERE rowid IN (old.fiche_id, new.fiche_id);
  INSERT INTO recherche_fiches (rowid, titre, alias, sous_type)
  SELECT f.id, f.titre,
    coalesce((SELECT group_concat(alias, ' ') FROM
      (SELECT alias FROM fiche_alias WHERE fiche_id = f.id ORDER BY alias COLLATE NOCASE)), ''),
    coalesce(f.sous_type, '')
  FROM fiches f WHERE f.id IN (old.fiche_id, new.fiche_id);
END;

CREATE TRIGGER alias_recherche_ad AFTER DELETE ON fiche_alias BEGIN
  DELETE FROM recherche_fiches WHERE rowid = old.fiche_id;
  INSERT INTO recherche_fiches (rowid, titre, alias, sous_type)
  SELECT f.id, f.titre,
    coalesce((SELECT group_concat(alias, ' ') FROM
      (SELECT alias FROM fiche_alias WHERE fiche_id = f.id ORDER BY alias COLLATE NOCASE)), ''),
    coalesce(f.sous_type, '')
  FROM fiches f WHERE f.id = old.fiche_id;
END;

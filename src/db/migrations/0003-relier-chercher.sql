-- Migration 0003 (kanevas-relier-chercher, number taken at merge, AD-51): the
-- relations carried by a section and the two FTS5 search indexes.
-- Rules the base cannot express (same universe, not the sheet itself, at most
-- 100 per section, GM only) are enforced by services/relations.ts.

CREATE TABLE relations (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  section_id     INTEGER NOT NULL REFERENCES sections (id) ON DELETE CASCADE,
  cible_fiche_id INTEGER NOT NULL REFERENCES fiches (id) ON DELETE RESTRICT,
  type           TEXT NOT NULL CHECK (length(trim(type)) BETWEEN 1 AND 80),
  cree_le        TEXT NOT NULL,
  UNIQUE (section_id, cible_fiche_id, type)
);

CREATE INDEX relations_par_section ON relations (section_id);

-- Indexes only deliver candidate ids (AD-63); rights are applied by the service.
CREATE VIRTUAL TABLE recherche_fiches USING fts5 (
  titre,
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE VIRTUAL TABLE recherche_sections USING fts5 (
  titre,
  contenu,
  tokenize = 'unicode61 remove_diacritics 2'
);

-- Backfill from the rows already present.
INSERT INTO recherche_fiches (rowid, titre) SELECT id, titre FROM fiches;
INSERT INTO recherche_sections (rowid, titre, contenu) SELECT id, titre, contenu FROM sections;

-- Triggers keep the indexes in step (AD-21), cascades included.
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

CREATE TRIGGER sections_recherche_ai AFTER INSERT ON sections BEGIN
  INSERT INTO recherche_sections (rowid, titre, contenu) VALUES (new.id, new.titre, new.contenu);
END;

CREATE TRIGGER sections_recherche_au AFTER UPDATE OF titre, contenu ON sections BEGIN
  DELETE FROM recherche_sections WHERE rowid = old.id;
  INSERT INTO recherche_sections (rowid, titre, contenu) VALUES (new.id, new.titre, new.contenu);
END;

CREATE TRIGGER sections_recherche_ad AFTER DELETE ON sections BEGIN
  DELETE FROM recherche_sections WHERE rowid = old.id;
END;

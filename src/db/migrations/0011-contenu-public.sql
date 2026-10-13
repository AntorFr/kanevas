-- Migration 0011 (kanevas-secrets-public, AD-114, AD-51): the public text of a section.
-- `contenu_public` is `contenu` without its GM blocks, written with `contenu` at each write
-- (sections.ts). Existing sections have no block yet: public text = text.
-- The FTS5 index is rebuilt with the new column (AD-21): triggers stay the only writers.

ALTER TABLE sections ADD COLUMN contenu_public TEXT NOT NULL DEFAULT '';
UPDATE sections SET contenu_public = contenu;

DROP TRIGGER sections_recherche_ai;
DROP TRIGGER sections_recherche_au;
DROP TRIGGER sections_recherche_ad;
DROP TABLE recherche_sections;

CREATE VIRTUAL TABLE recherche_sections USING fts5 (
  titre,
  contenu_public,
  contenu,
  tokenize = 'unicode61 remove_diacritics 2'
);

INSERT INTO recherche_sections (rowid, titre, contenu_public, contenu)
  SELECT id, titre, contenu_public, contenu FROM sections;

CREATE TRIGGER sections_recherche_ai AFTER INSERT ON sections BEGIN
  INSERT INTO recherche_sections (rowid, titre, contenu_public, contenu)
    VALUES (new.id, new.titre, new.contenu_public, new.contenu);
END;

CREATE TRIGGER sections_recherche_au AFTER UPDATE OF titre, contenu, contenu_public ON sections BEGIN
  DELETE FROM recherche_sections WHERE rowid = old.id;
  INSERT INTO recherche_sections (rowid, titre, contenu_public, contenu)
    VALUES (new.id, new.titre, new.contenu_public, new.contenu);
END;

CREATE TRIGGER sections_recherche_ad AFTER DELETE ON sections BEGIN
  DELETE FROM recherche_sections WHERE rowid = old.id;
END;

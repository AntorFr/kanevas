-- migrate: sans-cles-etrangeres
-- Migration 0037 (kanevas-synchro-cles-noyau, number taken at merge, AD-51, AD-146): every universe, sheet
-- and section carries a key. `fiches.cle_origine` becomes `fiches.cle` and `sections.cle_origine`
-- `sections.cle`, both NOT NULL; `univers.cle` is new. The three tables are recreated (SQLite cannot
-- add NOT NULL in place), so the file is played with foreign keys off and `foreign_key_check` runs before
-- the commit (db.ts). Keys are drawn by SQL functions `openDb` registers (cle_*): collisions are
-- suffixed `-2`, `-3`… in id order, the keys that already exist being reserved first.
-- A key that already exists is kept; one without a letter becomes `cle-<digits>` (its former form is
-- not kept in `cles_anciennes`: it would read as an id).

-- Triggers of other tables (fiche_alias…) name `fiches`, which is absent between the DROP and the RENAME: the
-- rename must not re-validate them.
PRAGMA legacy_alter_table = ON;

SELECT cle_debut();

-- ---- universes: key drawn from the name, unique on the instance ----

CREATE TABLE univers_nouvelle (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  nom         TEXT NOT NULL CHECK (length(trim(nom)) BETWEEN 1 AND 80),
  description TEXT NOT NULL DEFAULT '',
  cree_le     TEXT NOT NULL,
  systeme_id  INTEGER REFERENCES systemes_jeu (id),
  cle         TEXT NOT NULL
    CHECK (length(cle) BETWEEN 2 AND 40 AND cle NOT GLOB '*[^a-z0-9-]*' AND cle GLOB '*[a-z]*')
);

INSERT INTO univers_nouvelle (id, nom, description, cree_le, systeme_id, cle)
SELECT id, nom, description, cree_le, systeme_id, cle_tirer('u', cle_base_univers(nom, id), 40)
FROM univers ORDER BY id;

DROP TABLE univers;
ALTER TABLE univers_nouvelle RENAME TO univers;
CREATE INDEX univers_par_systeme ON univers (systeme_id);
CREATE UNIQUE INDEX univers_cle ON univers (cle);

CREATE TABLE univers_cles_anciennes (
  cle        TEXT PRIMARY KEY,
  univers_id INTEGER NOT NULL REFERENCES univers (id) ON DELETE CASCADE
);
CREATE INDEX univers_cles_anciennes_par_univers ON univers_cles_anciennes (univers_id);

-- ---- sheets ----
SELECT cle_debut();
SELECT count(cle_reserver('f' || univers_id, cle_origine)) FROM fiches WHERE cle_origine GLOB '*[A-Za-z]*';

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
  cle                 TEXT NOT NULL CHECK (length(cle) BETWEEN 1 AND 200),
  dernier_import      TEXT
    CHECK (dernier_import IS NULL OR json_valid(dernier_import)),
  parent_id           INTEGER REFERENCES fiches (id) ON DELETE SET NULL,
  sous_type           TEXT
    CHECK (sous_type IS NULL OR length(trim(sous_type)) BETWEEN 1 AND 60),
  illustration_fichier_id INTEGER REFERENCES fichiers (id) ON DELETE SET NULL,
  creee_via           TEXT NOT NULL CHECK (creee_via IN ('ecran', 'assistant', 'import', 'mcp')),
  CHECK (parent_id IS NULL OR parent_id <> id)
);

INSERT INTO fiches_nouvelle (
  id, univers_id, type, titre, charge, cree_le, modifie_le,
  illustration_fichier, illustration_type, illustration_taille, cle, dernier_import,
  parent_id, sous_type, illustration_fichier_id, creee_via
)
SELECT
  id, univers_id, type, titre, charge, cree_le, modifie_le,
  illustration_fichier, illustration_type, illustration_taille,
  CASE
    WHEN cle_origine GLOB '*[A-Za-z]*' THEN cle_origine
    WHEN cle_origine IS NOT NULL THEN cle_tirer('f' || univers_id, 'cle-' || cle_slug(cle_origine), 200)
    ELSE cle_tirer('f' || univers_id, cle_base_fiche(type, titre, id), 200)
  END,
  dernier_import, parent_id, sous_type, illustration_fichier_id,
  CASE WHEN cle_origine IS NOT NULL THEN 'import' ELSE 'ecran' END
FROM fiches ORDER BY id;

DROP TABLE fiches;
ALTER TABLE fiches_nouvelle RENAME TO fiches;

CREATE INDEX fiches_par_univers ON fiches (univers_id, type);
CREATE UNIQUE INDEX fiches_illustration_fichier ON fiches (illustration_fichier);
CREATE UNIQUE INDEX fiches_cle ON fiches (univers_id, cle);
CREATE INDEX fiches_par_parent ON fiches (parent_id);
CREATE INDEX fiches_par_sous_type ON fiches (univers_id, type, sous_type);
CREATE INDEX fiches_par_illustration ON fiches (illustration_fichier_id);

-- DROP TABLE took the search triggers with it (0014); same bodies.
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

CREATE TABLE cles_anciennes (
  univers_id INTEGER NOT NULL REFERENCES univers (id) ON DELETE CASCADE,
  cle        TEXT NOT NULL CHECK (length(cle) BETWEEN 1 AND 200),
  fiche_id   INTEGER NOT NULL REFERENCES fiches (id) ON DELETE CASCADE,
  PRIMARY KEY (univers_id, cle)
);
CREATE INDEX cles_anciennes_par_fiche ON cles_anciennes (fiche_id);

-- ---- sections: key unique per sheet, drawn from the title for those without one ----
SELECT cle_debut();
SELECT count(cle_reserver('s' || fiche_id, cle_origine)) FROM sections WHERE cle_origine IS NOT NULL;

CREATE TABLE sections_nouvelle (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  fiche_id         INTEGER NOT NULL REFERENCES fiches (id),
  titre            TEXT NOT NULL CHECK (length(trim(titre)) BETWEEN 1 AND 80),
  ordre            INTEGER NOT NULL,
  contenu          TEXT NOT NULL DEFAULT '',
  version          INTEGER NOT NULL DEFAULT 1,
  modifie_le       TEXT NOT NULL,
  joueurs_lisent   INTEGER NOT NULL DEFAULT 0 CHECK (joueurs_lisent IN (0, 1)),
  joueurs_ecrivent INTEGER NOT NULL DEFAULT 0 CHECK (joueurs_ecrivent IN (0, 1)),
  auteur_id        INTEGER REFERENCES comptes (id),
  auteur_lit       INTEGER NOT NULL DEFAULT 0 CHECK (auteur_lit IN (0, 1)),
  auteur_ecrit     INTEGER NOT NULL DEFAULT 0 CHECK (auteur_ecrit IN (0, 1)),
  cle              TEXT NOT NULL CHECK (length(cle) BETWEEN 1 AND 200),
  version_importee INTEGER,
  dernier_import   TEXT CHECK (dernier_import IS NULL OR json_valid(dernier_import)),
  contenu_public   TEXT NOT NULL DEFAULT '',
  gere_par         TEXT
    CHECK (gere_par IS NULL OR (gere_par LIKE '_%/_%/_%' AND gere_par NOT LIKE '%/%/%/%')),
  source_version   TEXT,
  UNIQUE (fiche_id, ordre)
);

INSERT INTO sections_nouvelle (
  id, fiche_id, titre, ordre, contenu, version, modifie_le, joueurs_lisent, joueurs_ecrivent,
  auteur_id, auteur_lit, auteur_ecrit, cle, version_importee, dernier_import, contenu_public,
  gere_par, source_version
)
SELECT
  id, fiche_id, titre, ordre, contenu, version, modifie_le, joueurs_lisent, joueurs_ecrivent,
  auteur_id, auteur_lit, auteur_ecrit,
  coalesce(cle_origine, cle_tirer('s' || fiche_id, coalesce(nullif(cle_slug(titre), ''), 'section-' || id), 200)),
  version_importee, dernier_import, contenu_public, gere_par, source_version
FROM sections ORDER BY id;

DROP TABLE sections;
ALTER TABLE sections_nouvelle RENAME TO sections;
CREATE UNIQUE INDEX sections_cle ON sections (fiche_id, cle);

-- DROP TABLE took the search triggers with it (0011); same bodies.
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

PRAGMA legacy_alter_table = OFF;

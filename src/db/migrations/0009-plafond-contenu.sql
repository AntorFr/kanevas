-- Migration 0009 (kanevas-markdown-serveur, AD-51, AD-106): the text ceiling goes from
-- 20 000 to 100 000 characters (MAX_CONTENU_SECTION). SQLite cannot alter a CHECK, so the
-- three tables carrying one are rebuilt (copy, drop, rename). No table references them.

CREATE TABLE gabarits_new (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  systeme_id INTEGER NOT NULL REFERENCES systemes_jeu (id),
  type       TEXT NOT NULL CHECK (type IN ('regle', 'creature', 'objet')),
  nom        TEXT NOT NULL COLLATE NOCASE CHECK (length(trim(nom)) BETWEEN 1 AND 120),
  contenu    TEXT NOT NULL DEFAULT '' CHECK (length(contenu) <= 100000),
  version    INTEGER NOT NULL DEFAULT 1,
  cree_le    TEXT NOT NULL,
  modifie_le TEXT NOT NULL,
  UNIQUE (systeme_id, type, nom)
);
INSERT INTO gabarits_new SELECT id, systeme_id, type, nom, contenu, version, cree_le, modifie_le FROM gabarits;
DROP TABLE gabarits;
ALTER TABLE gabarits_new RENAME TO gabarits;

CREATE TABLE scenarios_new (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  campagne_id INTEGER NOT NULL REFERENCES campagnes (id),
  titre       TEXT NOT NULL CHECK (length(trim(titre)) BETWEEN 1 AND 120),
  contenu     TEXT NOT NULL DEFAULT '' CHECK (length(contenu) <= 100000),
  version     INTEGER NOT NULL DEFAULT 1,
  cree_le     TEXT NOT NULL,
  modifie_le  TEXT NOT NULL
);
INSERT INTO scenarios_new SELECT id, campagne_id, titre, contenu, version, cree_le, modifie_le FROM scenarios;
DROP TABLE scenarios;
ALTER TABLE scenarios_new RENAME TO scenarios;
CREATE INDEX scenarios_par_campagne ON scenarios (campagne_id);

CREATE TABLE propositions_new (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  univers_id      INTEGER NOT NULL REFERENCES univers (id),
  demandeur_id    INTEGER NOT NULL REFERENCES comptes (id),
  section_id      INTEGER NOT NULL REFERENCES sections (id) ON DELETE CASCADE,
  cr_id           INTEGER NOT NULL REFERENCES fiches (id) ON DELETE CASCADE,
  contenu_propose TEXT NOT NULL CHECK (length(trim(contenu_propose)) >= 1 AND length(contenu_propose) <= 100000),
  version_origine INTEGER NOT NULL,
  creee_le        TEXT NOT NULL,
  appliquee_le    TEXT
);
INSERT INTO propositions_new SELECT id, univers_id, demandeur_id, section_id, cr_id, contenu_propose, version_origine, creee_le, appliquee_le FROM propositions;
DROP TABLE propositions;
ALTER TABLE propositions_new RENAME TO propositions;
CREATE UNIQUE INDEX propositions_une_en_attente
  ON propositions (demandeur_id, section_id) WHERE appliquee_le IS NULL;
CREATE INDEX propositions_par_section ON propositions (section_id);

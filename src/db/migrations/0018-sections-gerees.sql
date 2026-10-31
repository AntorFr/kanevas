-- migrate: sans-cles-etrangeres
-- Migration 0018 (kanevas-outils-sections-gerees, number taken at merge, AD-51; AD-127, AD-128).
-- `sections` gains `gere_par` (`module/outil/type`, null: free section) and `source_version`; that both are null
-- together or set together is held by the service (SQLite cannot add a table CHECK in place).
-- `propositions` is rebuilt (procedure of 0009; the runner plays this file with foreign keys off and checks
-- them before commit): `cr_id` becomes nullable and `source_version` is added, a proposal coming either from
-- a session report or from the recalculation of a managed section.

ALTER TABLE sections ADD COLUMN gere_par TEXT
  CHECK (gere_par IS NULL OR (gere_par LIKE '_%/_%/_%' AND gere_par NOT LIKE '%/%/%/%'));
ALTER TABLE sections ADD COLUMN source_version TEXT;

CREATE TABLE propositions_new (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  univers_id      INTEGER NOT NULL REFERENCES univers (id),
  demandeur_id    INTEGER NOT NULL REFERENCES comptes (id),
  section_id      INTEGER NOT NULL REFERENCES sections (id) ON DELETE CASCADE,
  cr_id           INTEGER REFERENCES fiches (id) ON DELETE CASCADE,
  contenu_propose TEXT NOT NULL CHECK (length(trim(contenu_propose)) >= 1 AND length(contenu_propose) <= 100000),
  version_origine INTEGER NOT NULL,
  creee_le        TEXT NOT NULL,
  appliquee_le    TEXT,
  source_version  TEXT,
  CHECK ((cr_id IS NULL) = (source_version IS NOT NULL))
);
INSERT INTO propositions_new (id, univers_id, demandeur_id, section_id, cr_id, contenu_propose, version_origine, creee_le, appliquee_le)
  SELECT id, univers_id, demandeur_id, section_id, cr_id, contenu_propose, version_origine, creee_le, appliquee_le FROM propositions;
DROP TABLE propositions;
ALTER TABLE propositions_new RENAME TO propositions;
CREATE UNIQUE INDEX propositions_une_en_attente
  ON propositions (demandeur_id, section_id) WHERE appliquee_le IS NULL;
CREATE INDEX propositions_par_section ON propositions (section_id);

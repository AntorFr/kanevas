-- Migration 0007 (kanevas-monde, number provisional until merge, AD-51):
-- update proposals (AD-79). A proposal is one row, read, applied and dropped by its
-- requester only; "stale" is never stored (current section version <> version_origine).

CREATE TABLE propositions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  univers_id      INTEGER NOT NULL REFERENCES univers (id),
  demandeur_id    INTEGER NOT NULL REFERENCES comptes (id),
  section_id      INTEGER NOT NULL REFERENCES sections (id) ON DELETE CASCADE,
  cr_id           INTEGER NOT NULL REFERENCES fiches (id) ON DELETE CASCADE,
  contenu_propose TEXT NOT NULL CHECK (length(trim(contenu_propose)) >= 1 AND length(contenu_propose) <= 20000),
  version_origine INTEGER NOT NULL,
  creee_le        TEXT NOT NULL,
  appliquee_le    TEXT
);

-- One pending proposal per (requester, section); applied ones are kept and do not count.
CREATE UNIQUE INDEX propositions_une_en_attente
  ON propositions (demandeur_id, section_id) WHERE appliquee_le IS NULL;
CREATE INDEX propositions_par_section ON propositions (section_id);

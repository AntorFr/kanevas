-- migrate: sans-cles-etrangeres
-- Migration 0017 (kanevas-fiches-liees-natures, number taken at merge, AD-51): a relation carries a
-- nature (key of services/natures.ts, '' = free) and a qualifier. `type` becomes `qualificatif`
-- (empty allowed with a nature, the service requires one without), ids kept. `relations` is
-- recreated in the style of 0013 (foreign keys off, foreign_key_check before commit, db.ts).

CREATE TABLE relations_nouvelle (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  section_id     INTEGER NOT NULL REFERENCES sections (id) ON DELETE CASCADE,
  cible_fiche_id INTEGER NOT NULL REFERENCES fiches (id) ON DELETE RESTRICT,
  nature         TEXT NOT NULL DEFAULT '',
  qualificatif   TEXT NOT NULL CHECK (length(trim(qualificatif)) <= 80),
  cree_le        TEXT NOT NULL,
  UNIQUE (section_id, cible_fiche_id, nature, qualificatif)
);

INSERT INTO relations_nouvelle (id, section_id, cible_fiche_id, nature, qualificatif, cree_le)
SELECT id, section_id, cible_fiche_id, '', type, cree_le FROM relations;

DROP TABLE relations;
ALTER TABLE relations_nouvelle RENAME TO relations;

CREATE INDEX relations_par_section ON relations (section_id);
CREATE INDEX relations_par_cible ON relations (cible_fiche_id);
CREATE INDEX relations_par_cible_nature ON relations (cible_fiche_id, nature);

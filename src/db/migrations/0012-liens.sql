-- Migration 0012 (kanevas-liens-ecriture, AD-116, AD-51): the `[[…]]` links of a section.
-- Rows are replaced as a whole at each write of the content (services/liens.ts, the only writer);
-- a link whose target is gone has both columns null (broken), one waiting for an origin key has
-- `cible_cle` (pending). Texts written before this migration are not replayed.

CREATE TABLE liens (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  section_id     INTEGER NOT NULL REFERENCES sections (id) ON DELETE CASCADE,
  cible_fiche_id INTEGER REFERENCES fiches (id) ON DELETE SET NULL,
  cible_cle      TEXT,
  texte          TEXT NOT NULL,
  dans_bloc_mj   INTEGER NOT NULL DEFAULT 0 CHECK (dans_bloc_mj IN (0, 1)),
  CHECK (cible_fiche_id IS NULL OR cible_cle IS NULL)
);

CREATE INDEX liens_par_section ON liens (section_id);
CREATE INDEX liens_par_cible ON liens (cible_fiche_id);
CREATE INDEX liens_par_cle ON liens (cible_cle);

-- « Mentionnée dans » and the deletion of a sheet look relations up by target.
CREATE INDEX relations_par_cible ON relations (cible_fiche_id);

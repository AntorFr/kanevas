-- The rule and example sheets of the ship designer (B-77, R-5): which sheet and section hold each generated text, and the
-- source version it was written at. Written only by the section hook (services/swn/fiches-regles.ts).
-- Number provisional until merge (AD-51).
CREATE TABLE swn_fiches_generees (
  id INTEGER PRIMARY KEY,
  univers_id INTEGER NOT NULL REFERENCES univers(id) ON DELETE CASCADE,
  cle TEXT NOT NULL CHECK (length(cle) BETWEEN 1 AND 64),
  fiche_id INTEGER NOT NULL REFERENCES fiches(id) ON DELETE CASCADE,
  section_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  source_version TEXT NOT NULL,
  UNIQUE (univers_id, cle),
  UNIQUE (section_id)
);
CREATE INDEX idx_swn_fiches_generees_fiche ON swn_fiches_generees (fiche_id);

-- migrate: sans-cles-etrangeres
-- kanevas-carte-rendu-galaxie-systemes (AD-rendu-2, B-117, B-118; number taken at merge, AD-51).
-- `swn_systemes` is rebuilt: `taille` becomes a real in [0, 1], `couleur` a nullable `#rrggbb`, and two nullable columns are
-- added (`classe`, `voile`). Conversion table of `docs/donnees.md`: sizes 1..5 -> 0.15, 0.45, 0.75, 0.9, 1; colours
-- accent/table/ambre/danger/clair -> `#8b9bf0`/`#3fc79a`/`#f2a33c`/`#ec7b6f`/`#ebecf0`, `neutre` -> NULL. `classe` stays NULL
-- (drawn from the key and the size). Ids are kept, so every child row (routes, bodies, formations, elements) keeps its parent;
-- foreign keys are off while the file plays and `foreign_key_check` runs before the commit (db.ts).
-- The only things that referred to the table: index `idx_swn_systemes_bloc` and the REFERENCES of other tables (no trigger, no view).
CREATE TABLE swn_systemes_nouveau (
  id INTEGER PRIMARY KEY,
  galaxie_id INTEGER NOT NULL REFERENCES swn_galaxies(id) ON DELETE CASCADE,
  univers_id INTEGER NOT NULL REFERENCES univers(id) ON DELETE CASCADE,
  cle TEXT NOT NULL CHECK (length(cle) BETWEEN 1 AND 200),
  nom TEXT NOT NULL CHECK (length(nom) BETWEEN 1 AND 80),
  q INTEGER NOT NULL,
  r INTEGER NOT NULL,
  taille REAL NOT NULL DEFAULT 0.45 CHECK (taille BETWEEN 0 AND 1),
  couleur TEXT CHECK (couleur IS NULL OR (length(couleur) = 7 AND couleur GLOB '#[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]')),
  classe TEXT CHECK (classe IS NULL OR length(classe) = 1),
  voile TEXT CHECK (voile IS NULL OR (length(voile) = 7 AND voile GLOB '#[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]')),
  notes TEXT NOT NULL DEFAULT '',
  secret INTEGER NOT NULL DEFAULT 0 CHECK (secret IN (0, 1)),
  promu INTEGER NOT NULL DEFAULT 1 CHECK (promu IN (0, 1)),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  version_importee INTEGER,
  transition REAL CHECK (transition IS NULL OR transition >= 0),
  UNIQUE (galaxie_id, q, r),
  UNIQUE (galaxie_id, cle),
  CHECK (abs(q) <= 100000 AND abs(r) <= 100000)
);
INSERT INTO swn_systemes_nouveau
  (id, galaxie_id, univers_id, cle, nom, q, r, taille, couleur, classe, voile, notes, secret, promu, version, version_importee, transition)
SELECT id, galaxie_id, univers_id, cle, nom, q, r,
  CASE taille WHEN 1 THEN 0.15 WHEN 2 THEN 0.45 WHEN 3 THEN 0.75 WHEN 4 THEN 0.9 ELSE 1.0 END,
  CASE couleur WHEN 'accent' THEN '#8b9bf0' WHEN 'table' THEN '#3fc79a' WHEN 'ambre' THEN '#f2a33c'
    WHEN 'danger' THEN '#ec7b6f' WHEN 'clair' THEN '#ebecf0' ELSE NULL END,
  NULL, NULL, notes, secret, promu, version, version_importee, transition
FROM swn_systemes;
DROP INDEX idx_swn_systemes_bloc;
DROP TABLE swn_systemes;
ALTER TABLE swn_systemes_nouveau RENAME TO swn_systemes;
CREATE INDEX idx_swn_systemes_bloc ON swn_systemes (univers_id, q, r);

ALTER TABLE swn_zones ADD COLUMN affichage_defaut INTEGER NOT NULL DEFAULT 1 CHECK (affichage_defaut IN (0, 1));

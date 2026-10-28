-- migrate: sans-cles-etrangeres
-- Migration 0017 (kanevas-scenarios, number taken at merge, AD-51; AD-127): campaigns and scenarios
-- become sheets of type `aventure`, preparation tasks hang on the sheet, the CR charges point to
-- the sheet, then `campagnes` and `scenarios` are dropped. SQL only: no TypeScript writes `sections`
-- here (the rows are inserted by hand because the services cannot run inside a migration).
-- Played with foreign keys off (the task table is rebuilt and its parents dropped); the runner checks
-- `foreign_key_check` before committing (db.ts).

-- Old id -> new sheet id. Explicit ids: the sheets follow the highest existing one.
CREATE TEMP TABLE migr_base AS SELECT COALESCE(MAX(id), 0) AS base FROM fiches;

CREATE TEMP TABLE migr_campagne AS
  SELECT c.id AS ancien,
         (SELECT base FROM migr_base) + ROW_NUMBER() OVER (ORDER BY c.id) AS nouveau
  FROM campagnes c;

CREATE TEMP TABLE migr_scenario AS
  SELECT s.id AS ancien,
         (SELECT base FROM migr_base) + (SELECT COUNT(*) FROM campagnes)
           + ROW_NUMBER() OVER (ORDER BY s.id) AS nouveau
  FROM scenarios s;

-- 1. Campaigns. `active` -> `en_cours`. A key already used by a sheet of the universe takes `campagne:`.
INSERT INTO fiches (id, univers_id, type, titre, charge, cree_le, modifie_le, cle_origine, dernier_import, sous_type)
SELECT m.nouveau, c.univers_id, 'aventure', c.nom,
       json_object('v', 1, 'statut',
         CASE c.statut WHEN 'active' THEN 'en_cours' ELSE c.statut END),
       c.cree_le, c.cree_le,
       CASE
         WHEN c.cle_origine IS NULL THEN NULL
         WHEN EXISTS (SELECT 1 FROM fiches f WHERE f.univers_id = c.univers_id AND f.cle_origine = c.cle_origine)
           THEN substr('campagne:' || c.cle_origine, 1, 200)
         ELSE c.cle_origine
       END,
       c.dernier_import, 'Campagne'
FROM campagnes c JOIN migr_campagne m ON m.ancien = c.id;

-- « Présentation »: open to the players when they already saw the campaign (active or finished).
INSERT INTO sections (fiche_id, titre, ordre, contenu, contenu_public, version, modifie_le, joueurs_lisent)
SELECT m.nouveau, 'Présentation', 1, '', '', 1, c.cree_le,
       CASE c.statut WHEN 'en_preparation' THEN 0 ELSE 1 END
FROM campagnes c JOIN migr_campagne m ON m.ancien = c.id;

-- 2. Scenarios, under the sheet of their campaign. A taken key takes `scenario:` (the keys of a
-- scenario were only unique within its campaign: an older scenario of the universe counts as taken).
INSERT INTO fiches (id, univers_id, type, titre, charge, cree_le, modifie_le, cle_origine, dernier_import, parent_id, sous_type)
SELECT m.nouveau, c.univers_id, 'aventure', s.titre,
       json_object('v', 1, 'statut', 'en_preparation'),
       s.cree_le, s.modifie_le,
       CASE
         WHEN s.cle_origine IS NULL THEN NULL
         WHEN EXISTS (SELECT 1 FROM fiches f WHERE f.univers_id = c.univers_id AND f.cle_origine = s.cle_origine)
           OR EXISTS (SELECT 1 FROM scenarios s2 JOIN campagnes c2 ON c2.id = s2.campagne_id
                      WHERE c2.univers_id = c.univers_id AND s2.cle_origine = s.cle_origine AND s2.id < s.id)
           THEN
             CASE WHEN EXISTS (SELECT 1 FROM fiches f WHERE f.univers_id = c.univers_id
                                 AND f.cle_origine = substr('scenario:' || s.cle_origine, 1, 200))
                  THEN substr('scenario:' || s.id || ':' || s.cle_origine, 1, 200)
                  ELSE substr('scenario:' || s.cle_origine, 1, 200) END
         ELSE s.cle_origine
       END,
       s.dernier_import,
       (SELECT mc.nouveau FROM migr_campagne mc WHERE mc.ancien = s.campagne_id),
       'Scénario'
FROM scenarios s
JOIN campagnes c ON c.id = s.campagne_id
JOIN migr_scenario m ON m.ancien = s.id;

-- « Scénario »: closed to the players. SQL cannot parse the `:::mj` container, so the public text
-- is the text when it holds no `:::` and nothing otherwise (never a leak) until the next write
-- through `poserContenu`, which recomputes it and the `liens` rows.
INSERT INTO sections (fiche_id, titre, ordre, contenu, contenu_public, version, modifie_le, joueurs_lisent, version_importee)
SELECT m.nouveau, 'Scénario', 1, s.contenu,
       CASE WHEN instr(s.contenu, ':::') = 0 THEN s.contenu ELSE '' END,
       s.version, s.modifie_le, 0, s.version_importee
FROM scenarios s JOIN migr_scenario m ON m.ancien = s.id;

-- 3. Tasks: `campagne_id` -> `fiche_id` (table rebuilt); CR charges point to the sheet.
CREATE TABLE taches_preparation_nouvelle (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  fiche_id    INTEGER NOT NULL REFERENCES fiches (id) ON DELETE CASCADE,
  categorie   TEXT NOT NULL
              CHECK (categorie IN ('monstres', 'pnj', 'cartes', 'deroulements', 'autre')),
  libelle     TEXT NOT NULL CHECK (length(trim(libelle)) BETWEEN 1 AND 200),
  faite       INTEGER NOT NULL DEFAULT 0 CHECK (faite IN (0, 1)),
  faite_le    TEXT,
  cree_le     TEXT NOT NULL,
  CHECK ((faite = 1) = (faite_le IS NOT NULL))
);

INSERT INTO taches_preparation_nouvelle (id, fiche_id, categorie, libelle, faite, faite_le, cree_le)
SELECT t.id, m.nouveau, t.categorie, t.libelle, t.faite, t.faite_le, t.cree_le
FROM taches_preparation t JOIN migr_campagne m ON m.ancien = t.campagne_id;

DROP TABLE taches_preparation;
ALTER TABLE taches_preparation_nouvelle RENAME TO taches_preparation;
CREATE INDEX taches_par_fiche ON taches_preparation (fiche_id, faite);

UPDATE fiches
SET charge = json_set(charge, '$.campagne_id',
      (SELECT m.nouveau FROM migr_campagne m WHERE m.ancien = json_extract(fiches.charge, '$.campagne_id')))
WHERE type = 'compte_rendu'
  AND EXISTS (SELECT 1 FROM migr_campagne m WHERE m.ancien = json_extract(fiches.charge, '$.campagne_id'));

-- 4. The tables go.
DROP TABLE scenarios;
DROP TABLE campagnes;

-- 5. Checks: a violated CHECK cancels the whole migration.
CREATE TEMP TABLE migr_verif (
  adventures_ok INTEGER CHECK (adventures_ok = 1),
  taches_ok     INTEGER CHECK (taches_ok = 1)
);
INSERT INTO migr_verif VALUES (
  (SELECT COUNT(*) FROM fiches WHERE type = 'aventure' AND id > (SELECT base FROM migr_base))
    = (SELECT COUNT(*) FROM migr_campagne) + (SELECT COUNT(*) FROM migr_scenario),
  NOT EXISTS (SELECT 1 FROM taches_preparation t WHERE NOT EXISTS (SELECT 1 FROM fiches f WHERE f.id = t.fiche_id))
);
DROP TABLE migr_verif;
DROP TABLE migr_scenario;
DROP TABLE migr_campagne;
DROP TABLE migr_base;

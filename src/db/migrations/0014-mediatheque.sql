-- Migration 0014 (kanevas-import-mediatheque, number taken at merge, AD-51): the media library of a
-- universe (AD-111, AD-117 §4). Expand only: every attachment and every illustration becomes a row of
-- `fichiers` (same file on the disk, no byte copied); `pieces_jointes` is emptied, not dropped, and the
-- three illustration columns of AD-93 stay in `fiches`, unused (their removal is a later tightening).
-- `empreinte` stays NULL for these files: SQL does not read the disk, the first import `PUT` sets it.

CREATE TABLE fichiers (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  univers_id     INTEGER NOT NULL REFERENCES univers (id),
  nom            TEXT NOT NULL CHECK (length(nom) BETWEEN 1 AND 200),
  type           TEXT NOT NULL,
  taille         INTEGER NOT NULL CHECK (taille > 0),
  disque         TEXT NOT NULL UNIQUE,
  empreinte      TEXT,
  visibilite     TEXT NOT NULL DEFAULT 'joueurs' CHECK (visibilite IN ('joueurs', 'mj')),
  cle_origine    TEXT CHECK (cle_origine IS NULL OR length(cle_origine) BETWEEN 1 AND 200),
  ajoute_par     INTEGER NOT NULL REFERENCES comptes (id),
  ajoute_le      TEXT NOT NULL,
  dernier_import TEXT CHECK (dernier_import IS NULL OR json_valid(dernier_import))
);

CREATE UNIQUE INDEX fichiers_cle_origine ON fichiers (univers_id, cle_origine);
CREATE INDEX fichiers_par_date ON fichiers (univers_id, ajoute_le);

CREATE TABLE fichiers_sections (
  fichier_id   INTEGER NOT NULL REFERENCES fichiers (id) ON DELETE CASCADE,
  section_id   INTEGER NOT NULL REFERENCES sections (id) ON DELETE CASCADE,
  joint        INTEGER NOT NULL DEFAULT 0 CHECK (joint IN (0, 1)),
  dans_texte   INTEGER NOT NULL DEFAULT 0 CHECK (dans_texte IN (0, 1)),
  dans_bloc_mj INTEGER NOT NULL DEFAULT 0 CHECK (dans_bloc_mj IN (0, 1)),
  PRIMARY KEY (fichier_id, section_id),
  CHECK (joint = 1 OR dans_texte = 1)
);

CREATE INDEX fichiers_sections_par_section ON fichiers_sections (section_id);

CREATE TABLE fichiers_attente (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  univers_id INTEGER NOT NULL REFERENCES univers (id),
  cle        TEXT NOT NULL,
  section_id INTEGER REFERENCES sections (id) ON DELETE CASCADE,
  fiche_id   INTEGER REFERENCES fiches (id) ON DELETE CASCADE,
  maniere    TEXT NOT NULL CHECK (maniere IN ('texte', 'joint', 'illustration')),
  CHECK ((section_id IS NULL) = (maniere = 'illustration')),
  CHECK ((fiche_id IS NULL) <> (maniere = 'illustration')),
  UNIQUE (univers_id, cle, section_id, fiche_id, maniere)
);

CREATE INDEX fichiers_attente_par_cle ON fichiers_attente (univers_id, cle);

-- Added after the recreation of `fiches` (0013), which does not copy it.
ALTER TABLE fiches ADD COLUMN illustration_fichier_id INTEGER REFERENCES fichiers (id) ON DELETE SET NULL;
CREATE INDEX fiches_par_illustration ON fiches (illustration_fichier_id);

-- The account that "added" a file of before: the GM of the smallest account id of the universe,
-- else the member of the smallest account id; without a member the row is not migrated.
-- Attachments: secret, or in a section the players do not read → `mj`, else `joueurs`; joined to their section.
INSERT INTO fichiers (univers_id, nom, type, taille, disque, visibilite, ajoute_par, ajoute_le)
SELECT univers_id, nom, type, taille, fichier, visibilite, par, cree_le
  FROM (
    SELECT f.univers_id AS univers_id, p.nom AS nom, p.type AS type, p.taille AS taille,
           p.fichier AS fichier,
           CASE WHEN p.secrete = 1 OR s.joueurs_lisent = 0 THEN 'mj' ELSE 'joueurs' END AS visibilite,
           COALESCE(
             (SELECT m.compte_id FROM membres m WHERE m.univers_id = f.univers_id AND m.role = 'mj'
               ORDER BY m.compte_id LIMIT 1),
             (SELECT m.compte_id FROM membres m WHERE m.univers_id = f.univers_id
               ORDER BY m.compte_id LIMIT 1)
           ) AS par,
           p.cree_le AS cree_le, p.id AS pid
      FROM pieces_jointes p
      JOIN sections s ON s.id = p.section_id
      JOIN fiches f ON f.id = s.fiche_id
  )
 WHERE par IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM fichiers x WHERE x.disque = fichier)
 ORDER BY pid;

INSERT INTO fichiers_sections (fichier_id, section_id, joint)
SELECT x.id, p.section_id, 1
  FROM pieces_jointes p
  JOIN fichiers x ON x.disque = p.fichier;

-- Illustrations: a file named after the sheet, set back on the sheet; `mj` when the sheet has no section
-- read by the players (the file must not open what its sheet keeps closed), else `joueurs`.
INSERT INTO fichiers (univers_id, nom, type, taille, disque, visibilite, ajoute_par, ajoute_le)
SELECT univers_id, nom, type, taille, chemin, visibilite, par, ajoute_le
  FROM (
    SELECT f.univers_id AS univers_id, substr(trim(f.titre), 1, 200) AS nom,
           f.illustration_type AS type, f.illustration_taille AS taille,
           f.illustration_fichier AS chemin,
           CASE WHEN EXISTS (SELECT 1 FROM sections s WHERE s.fiche_id = f.id AND s.joueurs_lisent = 1)
                THEN 'joueurs' ELSE 'mj' END AS visibilite,
           COALESCE(
             (SELECT m.compte_id FROM membres m WHERE m.univers_id = f.univers_id AND m.role = 'mj'
               ORDER BY m.compte_id LIMIT 1),
             (SELECT m.compte_id FROM membres m WHERE m.univers_id = f.univers_id
               ORDER BY m.compte_id LIMIT 1)
           ) AS par,
           f.modifie_le AS ajoute_le, f.id AS fid
      FROM fiches f
     WHERE f.illustration_fichier IS NOT NULL
  )
 WHERE par IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM fichiers x WHERE x.disque = chemin)
 ORDER BY fid;

UPDATE fiches
   SET illustration_fichier_id = (SELECT x.id FROM fichiers x WHERE x.disque = fiches.illustration_fichier)
 WHERE illustration_fichier IS NOT NULL;

DELETE FROM pieces_jointes;

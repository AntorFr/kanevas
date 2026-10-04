-- Migration 0003 (kanevas-suivi, number provisional until merge, AD-51):
-- campaigns, scenarios and preparation tasks. Session reports have no table:
-- they are `fiches` of type `compte_rendu` (0001). Nothing here deletes: no
-- service removes a campaign, a scenario or a task.

CREATE TABLE campagnes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  univers_id INTEGER NOT NULL REFERENCES univers (id),
  nom        TEXT NOT NULL CHECK (length(trim(nom)) BETWEEN 1 AND 80),
  statut     TEXT NOT NULL DEFAULT 'en_preparation'
             CHECK (statut IN ('en_preparation', 'active', 'terminee')),
  cree_le    TEXT NOT NULL
);

CREATE INDEX campagnes_par_univers ON campagnes (univers_id);

CREATE TABLE scenarios (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  campagne_id INTEGER NOT NULL REFERENCES campagnes (id),
  titre       TEXT NOT NULL CHECK (length(trim(titre)) BETWEEN 1 AND 120),
  contenu     TEXT NOT NULL DEFAULT '' CHECK (length(contenu) <= 20000),
  version     INTEGER NOT NULL DEFAULT 1,
  cree_le     TEXT NOT NULL,
  modifie_le  TEXT NOT NULL
);

CREATE INDEX scenarios_par_campagne ON scenarios (campagne_id);

CREATE TABLE taches_preparation (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  campagne_id INTEGER NOT NULL REFERENCES campagnes (id),
  categorie   TEXT NOT NULL
              CHECK (categorie IN ('monstres', 'pnj', 'cartes', 'deroulements', 'autre')),
  libelle     TEXT NOT NULL CHECK (length(trim(libelle)) BETWEEN 1 AND 200),
  faite       INTEGER NOT NULL DEFAULT 0 CHECK (faite IN (0, 1)),
  faite_le    TEXT,
  cree_le     TEXT NOT NULL,
  CHECK ((faite = 1) = (faite_le IS NOT NULL))
);

CREATE INDEX taches_par_campagne ON taches_preparation (campagne_id);

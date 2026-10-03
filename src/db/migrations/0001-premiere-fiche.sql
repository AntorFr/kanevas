-- Migration 0001 (kanevas-premiere-fiche): accounts, universes, members,
-- sheets ("fiches") and sections. No search index (a later migration adds it).
-- Business rules the base cannot express (at least one GM per universe, the
-- author being a player member) are enforced by the services, not here.

CREATE TABLE comptes (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE CHECK (length(username) > 0),
  cree_le  TEXT NOT NULL
);

CREATE TABLE univers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  nom         TEXT NOT NULL CHECK (length(trim(nom)) BETWEEN 1 AND 80),
  description TEXT NOT NULL DEFAULT '',
  cree_le     TEXT NOT NULL
);

CREATE TABLE membres (
  univers_id INTEGER NOT NULL REFERENCES univers (id),
  compte_id  INTEGER NOT NULL REFERENCES comptes (id),
  role       TEXT NOT NULL CHECK (role IN ('mj', 'joueur')),
  PRIMARY KEY (univers_id, compte_id)
);

CREATE INDEX membres_par_compte ON membres (compte_id);

CREATE TABLE fiches (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  univers_id INTEGER NOT NULL REFERENCES univers (id),
  type       TEXT NOT NULL CHECK (type IN (
    'personnage', 'lieu', 'faction', 'objet', 'evenement', 'quete', 'compte_rendu'
  )),
  titre      TEXT NOT NULL CHECK (length(trim(titre)) BETWEEN 1 AND 120),
  charge     TEXT NOT NULL CHECK (json_valid(charge)),
  cree_le    TEXT NOT NULL,
  modifie_le TEXT NOT NULL
);

CREATE INDEX fiches_par_univers ON fiches (univers_id, type);

CREATE TABLE sections (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  fiche_id         INTEGER NOT NULL REFERENCES fiches (id),
  titre            TEXT NOT NULL CHECK (length(trim(titre)) BETWEEN 1 AND 80),
  ordre            INTEGER NOT NULL,
  contenu          TEXT NOT NULL DEFAULT '',
  version          INTEGER NOT NULL DEFAULT 1,
  modifie_le       TEXT NOT NULL,
  joueurs_lisent   INTEGER NOT NULL DEFAULT 0 CHECK (joueurs_lisent IN (0, 1)),
  joueurs_ecrivent INTEGER NOT NULL DEFAULT 0 CHECK (joueurs_ecrivent IN (0, 1)),
  auteur_id        INTEGER REFERENCES comptes (id),
  auteur_lit       INTEGER NOT NULL DEFAULT 0 CHECK (auteur_lit IN (0, 1)),
  auteur_ecrit     INTEGER NOT NULL DEFAULT 0 CHECK (auteur_ecrit IN (0, 1)),
  UNIQUE (fiche_id, ordre)
);

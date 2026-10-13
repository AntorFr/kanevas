-- Migration 0010 (kanevas-fil-contrat, number provisional until merge, AD-51):
-- API tokens and import batches (AD-103, AD-104), and the origin keys that make an import replayable.
-- `ADD COLUMN` only: the recreation of `fiches` belongs to the types slice, which copies these columns.

CREATE TABLE jetons_api (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  univers_id       INTEGER NOT NULL REFERENCES univers (id),
  compte_id        INTEGER NOT NULL REFERENCES comptes (id),
  nom              TEXT NOT NULL CHECK (length(trim(nom)) BETWEEN 1 AND 80),
  empreinte        TEXT NOT NULL UNIQUE,
  cree_le          TEXT NOT NULL,
  expire_le        TEXT NOT NULL,
  revoque_le       TEXT,
  dernier_usage_le TEXT,
  CHECK (expire_le > cree_le)
);

CREATE INDEX jetons_api_par_univers ON jetons_api (univers_id, cree_le);

CREATE TABLE lots_import (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  univers_id       INTEGER NOT NULL REFERENCES univers (id),
  jeton_id         INTEGER NOT NULL REFERENCES jetons_api (id),
  ouvert_le        TEXT NOT NULL,
  clos_le          TEXT,
  dernier_ecrit_le TEXT,
  compteurs        TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(compteurs)),
  avertissements   INTEGER NOT NULL DEFAULT 0 CHECK (avertissements >= 0),
  en_attente       INTEGER NOT NULL DEFAULT 0 CHECK (en_attente >= 0),
  rapport          TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(rapport))
);

CREATE INDEX lots_import_par_univers ON lots_import (univers_id, ouvert_le);

ALTER TABLE fiches ADD COLUMN cle_origine TEXT
  CHECK (cle_origine IS NULL OR length(cle_origine) BETWEEN 1 AND 200);
ALTER TABLE fiches ADD COLUMN dernier_import TEXT
  CHECK (dernier_import IS NULL OR json_valid(dernier_import));
CREATE UNIQUE INDEX fiches_cle_origine ON fiches (univers_id, cle_origine);

ALTER TABLE sections ADD COLUMN cle_origine TEXT
  CHECK (cle_origine IS NULL OR length(cle_origine) BETWEEN 1 AND 200);
ALTER TABLE sections ADD COLUMN version_importee INTEGER;
ALTER TABLE sections ADD COLUMN dernier_import TEXT
  CHECK (dernier_import IS NULL OR json_valid(dernier_import));
CREATE UNIQUE INDEX sections_cle_origine ON sections (fiche_id, cle_origine);

-- migrate: sans-cles-etrangeres
-- Migration 0038 (kanevas-synchro-jetons, number taken at merge, AD-51, AD-144): a token belongs to an
-- account and reaches universes at a level. `jetons_api` is rebuilt (ids kept, so `lots_import.jeton_id`
-- and `jetons_outils.jeton_id` still point at the same rows) without `univers_id`; `jetons_univers`
-- carries the reached universes. Existing tokens: `tous` = 0, one `ecriture` row for the former universe,
-- `revoque_par` = the owner when revoked (a revocation by another GM was not recorded).
-- Played with foreign keys off, `foreign_key_check` before the commit (db.ts).

CREATE TABLE jetons_api_nouvelle (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  compte_id             INTEGER NOT NULL REFERENCES comptes (id),
  nom                   TEXT NOT NULL CHECK (length(trim(nom)) BETWEEN 1 AND 80),
  empreinte             TEXT NOT NULL UNIQUE,
  cree_le               TEXT NOT NULL,
  expire_le             TEXT NOT NULL,
  revoque_le            TEXT,
  revoque_par           INTEGER REFERENCES comptes (id),
  dernier_usage_le      TEXT,
  tous                  INTEGER NOT NULL DEFAULT 0 CHECK (tous IN (0, 1)),
  niveau_tous           TEXT CHECK (niveau_tous IN ('lecture', 'ecriture')),
  modifie_par_admin_par INTEGER REFERENCES comptes (id),
  modifie_par_admin_le  TEXT,
  CHECK (expire_le > cree_le),
  CHECK ((tous = 1) = (niveau_tous IS NOT NULL)),
  CHECK ((modifie_par_admin_par IS NULL) = (modifie_par_admin_le IS NULL))
);

INSERT INTO jetons_api_nouvelle (id, compte_id, nom, empreinte, cree_le, expire_le, revoque_le, revoque_par,
                                 dernier_usage_le, tous, niveau_tous)
SELECT id, compte_id, nom, empreinte, cree_le, expire_le, revoque_le,
       CASE WHEN revoque_le IS NOT NULL THEN compte_id END, dernier_usage_le, 0, NULL
  FROM jetons_api;

CREATE TABLE jetons_univers (
  jeton_id   INTEGER NOT NULL REFERENCES jetons_api (id) ON DELETE CASCADE,
  univers_id INTEGER NOT NULL REFERENCES univers (id),
  niveau     TEXT NOT NULL CHECK (niveau IN ('lecture', 'ecriture', 'aucun')),
  PRIMARY KEY (jeton_id, univers_id)
);

INSERT INTO jetons_univers (jeton_id, univers_id, niveau)
SELECT id, univers_id, 'ecriture' FROM jetons_api;

UPDATE sqlite_sequence SET seq = (SELECT seq FROM sqlite_sequence WHERE name = 'jetons_api')
 WHERE name = 'jetons_api_nouvelle'
   AND EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = 'jetons_api');

DROP TABLE jetons_api;
ALTER TABLE jetons_api_nouvelle RENAME TO jetons_api;

CREATE INDEX jetons_api_par_compte ON jetons_api (compte_id, cree_le);
CREATE INDEX jetons_univers_par_univers ON jetons_univers (univers_id);

-- Migration 0006 (kanevas-cartes-graphes, number provisional until merge, AD-51):
-- maps (illustrated or graph) and the sheets placed on them. The bytes of a
-- background are a file under <data>/attachments/<fond> (AD-7, AD-69).
-- Rules the base cannot express (same universe as the sheet, position present
-- on an illustrated map and absent on a graph, 100 elements per map, GM only)
-- are enforced by services/cartes.ts. A graph's links are not stored (AD-41).

CREATE TABLE cartes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  univers_id INTEGER NOT NULL REFERENCES univers (id),
  titre      TEXT NOT NULL CHECK (length(trim(titre)) BETWEEN 1 AND 80),
  forme      TEXT NOT NULL CHECK (forme IN ('illustree', 'graphe')),
  visible    INTEGER NOT NULL DEFAULT 0 CHECK (visible IN (0, 1)),
  fond       TEXT UNIQUE,
  fond_type  TEXT,
  cree_le    TEXT NOT NULL,
  -- a background comes with its type, and never on a graph
  CHECK ((fond IS NULL) = (fond_type IS NULL)),
  CHECK (fond IS NULL OR forme = 'illustree')
);

CREATE INDEX cartes_par_univers ON cartes (univers_id);

-- The form is fixed at creation.
CREATE TRIGGER cartes_forme_figee BEFORE UPDATE OF forme ON cartes
WHEN NEW.forme <> OLD.forme
BEGIN
  SELECT RAISE(ABORT, 'la forme d''une carte ne change pas');
END;

CREATE TABLE elements_carte (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  carte_id INTEGER NOT NULL REFERENCES cartes (id),
  fiche_id INTEGER NOT NULL REFERENCES fiches (id) ON DELETE RESTRICT,
  x        REAL,
  y        REAL,
  cree_le  TEXT NOT NULL,
  UNIQUE (carte_id, fiche_id),
  CHECK ((x IS NULL) = (y IS NULL)),
  CHECK (x IS NULL OR (x BETWEEN 0 AND 100 AND y BETWEEN 0 AND 100))
);

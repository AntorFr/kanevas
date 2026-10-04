-- Migration 0003 (kanevas-fichiers, number provisional until merge, AD-51):
-- attachments of a section. Only metadata lives here; the bytes are files under
-- <data>/attachments/<fichier> (AD-7). Removing a section cascades to its rows,
-- not to the disk: the service deletes the files.

CREATE TABLE pieces_jointes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  section_id INTEGER NOT NULL REFERENCES sections (id) ON DELETE CASCADE,
  nom        TEXT NOT NULL CHECK (length(nom) BETWEEN 1 AND 200),
  type       TEXT NOT NULL,
  taille     INTEGER NOT NULL CHECK (taille > 0),
  fichier    TEXT NOT NULL UNIQUE,
  secrete    INTEGER NOT NULL DEFAULT 0 CHECK (secrete IN (0, 1)),
  cree_le    TEXT NOT NULL
);

CREATE INDEX pieces_jointes_par_section ON pieces_jointes (section_id);

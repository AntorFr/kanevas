-- Migration 0006 (kanevas-illustrations, number provisional until merge, AD-51):
-- the optional illustration of a sheet (AD-93). Three nullable columns, all or none;
-- the bytes are a file under <data>/attachments/<illustration_fichier> (AD-7).
-- ADD COLUMN cannot carry UNIQUE, hence the separate unique index (several NULL allowed).

ALTER TABLE fiches ADD COLUMN illustration_fichier TEXT;
ALTER TABLE fiches ADD COLUMN illustration_type TEXT
  CHECK (illustration_type IN ('image/png', 'image/jpeg', 'image/gif', 'image/webp'));
ALTER TABLE fiches ADD COLUMN illustration_taille INTEGER
  CHECK (illustration_taille > 0
    AND (illustration_fichier IS NULL) = (illustration_type IS NULL)
    AND (illustration_type IS NULL) = (illustration_taille IS NULL));

CREATE UNIQUE INDEX fiches_illustration_fichier ON fiches (illustration_fichier);

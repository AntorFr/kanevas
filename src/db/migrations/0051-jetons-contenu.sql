-- A token carries the content permission or not (AD-jeton-unique-1, docs/donnees.md rule 10).
-- Until now a token with a `jetons_outils` row was a tool token and the others content tokens: keep that reading.
ALTER TABLE jetons_api ADD COLUMN contenu INTEGER NOT NULL DEFAULT 1 CHECK (contenu IN (0, 1));
UPDATE jetons_api SET contenu = 0 WHERE id IN (SELECT jeton_id FROM jetons_outils);

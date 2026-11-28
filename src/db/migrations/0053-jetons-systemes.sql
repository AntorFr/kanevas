-- kanevas-systemes-jeu-api-socle (AD-155, AD-systemes-api-3 and 4; number taken at merge, AD-51).
-- The level a token has on a game system: one row per system reached, none for a system left out.
-- No data to move: after the migration no token reaches any system.
CREATE TABLE jetons_systemes (
  jeton_id   INTEGER NOT NULL REFERENCES jetons_api (id) ON DELETE CASCADE,
  systeme_id INTEGER NOT NULL REFERENCES systemes_jeu (id) ON DELETE CASCADE,
  niveau     TEXT NOT NULL CHECK (niveau IN ('lecture', 'ecriture')),
  PRIMARY KEY (jeton_id, systeme_id)
);
CREATE INDEX jetons_systemes_systeme ON jetons_systemes (systeme_id);

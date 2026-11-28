-- kanevas-systemes-jeu-elements-socle (AD-151, AD-152, AD-156; number taken at merge, AD-51).
-- Every game system owns a hidden space: a technical `univers` row (`espace_systeme_id`) that holds its element
-- sheets. Its `membres` rows (role `mj`) are the GMs of the system, written by the instance admin only; an existing
-- system gets its space and no GM. The space is never listed and cannot be entered as a universe.
-- `gabarits` is dropped, no data kept (AD-156).

ALTER TABLE univers ADD COLUMN espace_systeme_id INTEGER REFERENCES systemes_jeu (id);
CREATE UNIQUE INDEX univers_espace_systeme ON univers (espace_systeme_id) WHERE espace_systeme_id IS NOT NULL;

INSERT INTO univers (nom, description, cree_le, cle, espace_systeme_id)
SELECT s.nom, '', s.cree_le, 'espace-systeme-' || s.id || '-x', s.id
FROM systemes_jeu s ORDER BY s.id;

DROP TABLE gabarits;

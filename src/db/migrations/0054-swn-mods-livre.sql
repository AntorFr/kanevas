-- B-93, B-94, H-9, H-mods-1 (kanevas-concepteur-vaisseaux-mods-livre-donnees; number 0054 taken at merge, AD-51).
-- Pretech components of a modification (`composants` 0..99, `composants_par_classe` 0/1) and the engineer's Int + Con modifier of a design
-- (`mod_int_con`, -10..10), all by ALTER TABLE … ADD COLUMN with a default: no row is rewritten, no catalogue version moves, the effect
-- CHECK of `swn_catalogue_modifications` is not touched. `integre` is a key of the JSON lines of a design: no column.
ALTER TABLE swn_catalogue_modifications ADD COLUMN composants INTEGER NOT NULL DEFAULT 0
  CHECK (typeof(composants) = 'integer' AND composants BETWEEN 0 AND 99);
ALTER TABLE swn_catalogue_modifications ADD COLUMN composants_par_classe INTEGER NOT NULL DEFAULT 0
  CHECK (typeof(composants_par_classe) = 'integer' AND composants_par_classe IN (0, 1));
ALTER TABLE swn_conceptions ADD COLUMN mod_int_con INTEGER NOT NULL DEFAULT 0
  CHECK (typeof(mod_int_con) = 'integer' AND mod_int_con BETWEEN -10 AND 10);

-- B-83, X-1 (kanevas-outils-format-vaisseaux-effets): optional percentage cost, game effect and cargo of the ship catalogue.
-- Every column is nullable (NULL = not stated) with the CHECK it can carry alone; the rules between columns (a parameter is
-- required with its effect) are the import's. ALTER TABLE … ADD COLUMN only: no row is rewritten.
ALTER TABLE swn_catalogue_modifications ADD COLUMN cout_pct INTEGER CHECK (cout_pct IS NULL OR (typeof(cout_pct) = 'integer' AND cout_pct BETWEEN 1 AND 1000));
ALTER TABLE swn_catalogue_modifications ADD COLUMN effet TEXT CHECK (effet IS NULL OR effet IN ('vitesse', 'armure', 'echange', 'soutes_doublees', 'magasins_doubles', 'reparation_min'));
ALTER TABLE swn_catalogue_modifications ADD COLUMN valeur INTEGER CHECK (valeur IS NULL OR (typeof(valeur) = 'integer' AND valeur BETWEEN -9 AND 20));
ALTER TABLE swn_catalogue_modifications ADD COLUMN points_max INTEGER CHECK (points_max IS NULL OR (typeof(points_max) = 'integer' AND points_max BETWEEN 1 AND 99));
ALTER TABLE swn_catalogue_modifications ADD COLUMN sens TEXT CHECK (sens IS NULL OR sens IN ('puissance_vers_masse', 'masse_vers_puissance'));
ALTER TABLE swn_catalogue_modifications ADD COLUMN echange_puissance INTEGER CHECK (echange_puissance IS NULL OR (typeof(echange_puissance) = 'integer' AND echange_puissance BETWEEN 1 AND 99));
ALTER TABLE swn_catalogue_modifications ADD COLUMN echange_masse REAL CHECK (echange_masse IS NULL OR (typeof(echange_masse) IN ('integer', 'real') AND echange_masse >= 0.5 AND echange_masse <= 99));

ALTER TABLE swn_catalogue_amenagements ADD COLUMN effet TEXT CHECK (effet IS NULL OR effet = 'moteur_systeme');
ALTER TABLE swn_catalogue_amenagements ADD COLUMN rend_puissance TEXT CHECK (rend_puissance IS NULL OR (typeof(rend_puissance) = 'text' AND json_valid(rend_puissance) AND json_array_length(rend_puissance) = 4));
ALTER TABLE swn_catalogue_amenagements ADD COLUMN rend_masse TEXT CHECK (rend_masse IS NULL OR (typeof(rend_masse) = 'text' AND json_valid(rend_masse) AND json_array_length(rend_masse) = 4));
ALTER TABLE swn_catalogue_amenagements ADD COLUMN soute INTEGER CHECK (soute IS NULL OR (typeof(soute) = 'integer' AND soute BETWEEN 0 AND 1000000));

-- B-82, F-1 (kanevas-outils-format-vaisseaux-fiches): optional rule fields of the ship catalogue. Every column is nullable
-- (NULL = not stated); a CHECK on the range when it is not (`typeof(NULL)` is not 'integer', hence the explicit IS NULL). ALTER TABLE … ADD COLUMN only: no row is rewritten.
ALTER TABLE swn_catalogue_coques ADD COLUMN vitesse INTEGER CHECK (vitesse IS NULL OR (typeof(vitesse) = 'integer' AND vitesse BETWEEN 0 AND 99));
ALTER TABLE swn_catalogue_coques ADD COLUMN armure INTEGER CHECK (armure IS NULL OR (typeof(armure) = 'integer' AND armure BETWEEN 0 AND 99));
ALTER TABLE swn_catalogue_coques ADD COLUMN equipage_min INTEGER CHECK (equipage_min IS NULL OR (typeof(equipage_min) = 'integer' AND equipage_min BETWEEN 0 AND 100000));
ALTER TABLE swn_catalogue_coques ADD COLUMN equipage_max INTEGER CHECK (equipage_max IS NULL OR (typeof(equipage_max) = 'integer' AND equipage_max BETWEEN 0 AND 100000));

ALTER TABLE swn_catalogue_moteurs ADD COLUMN classe_min INTEGER CHECK (classe_min IS NULL OR (typeof(classe_min) = 'integer' AND classe_min BETWEEN 1 AND 4));
ALTER TABLE swn_catalogue_moteurs ADD COLUMN classe_max INTEGER CHECK (classe_max IS NULL OR (typeof(classe_max) = 'integer' AND classe_max BETWEEN 1 AND 4));
ALTER TABLE swn_catalogue_moteurs ADD COLUMN condition TEXT CHECK (condition IS NULL OR (typeof(condition) = 'text' AND length(condition) BETWEEN 1 AND 200));

ALTER TABLE swn_catalogue_amenagements ADD COLUMN classe_min INTEGER CHECK (classe_min IS NULL OR (typeof(classe_min) = 'integer' AND classe_min BETWEEN 1 AND 4));
ALTER TABLE swn_catalogue_amenagements ADD COLUMN classe_max INTEGER CHECK (classe_max IS NULL OR (typeof(classe_max) = 'integer' AND classe_max BETWEEN 1 AND 4));
ALTER TABLE swn_catalogue_amenagements ADD COLUMN condition TEXT CHECK (condition IS NULL OR (typeof(condition) = 'text' AND length(condition) BETWEEN 1 AND 200));

ALTER TABLE swn_catalogue_defenses ADD COLUMN classe_min INTEGER CHECK (classe_min IS NULL OR (typeof(classe_min) = 'integer' AND classe_min BETWEEN 1 AND 4));
ALTER TABLE swn_catalogue_defenses ADD COLUMN classe_max INTEGER CHECK (classe_max IS NULL OR (typeof(classe_max) = 'integer' AND classe_max BETWEEN 1 AND 4));
ALTER TABLE swn_catalogue_defenses ADD COLUMN condition TEXT CHECK (condition IS NULL OR (typeof(condition) = 'text' AND length(condition) BETWEEN 1 AND 200));
ALTER TABLE swn_catalogue_defenses ADD COLUMN bonus_vitesse INTEGER CHECK (bonus_vitesse IS NULL OR (typeof(bonus_vitesse) = 'integer' AND bonus_vitesse BETWEEN 0 AND 9));

ALTER TABLE swn_catalogue_armes ADD COLUMN degats TEXT CHECK (degats IS NULL OR (typeof(degats) = 'text' AND length(degats) BETWEEN 1 AND 40));
ALTER TABLE swn_catalogue_armes ADD COLUMN perforation INTEGER CHECK (perforation IS NULL OR (typeof(perforation) = 'integer' AND perforation BETWEEN 0 AND 99));
ALTER TABLE swn_catalogue_armes ADD COLUMN qualites TEXT CHECK (qualites IS NULL OR (typeof(qualites) = 'text' AND length(qualites) BETWEEN 1 AND 120));
ALTER TABLE swn_catalogue_armes ADD COLUMN niveau_tech INTEGER CHECK (niveau_tech IS NULL OR (typeof(niveau_tech) = 'integer' AND niveau_tech BETWEEN 0 AND 9));

ALTER TABLE swn_catalogue_exemples ADD COLUMN equipage INTEGER CHECK (equipage IS NULL OR (typeof(equipage) = 'integer' AND equipage BETWEEN 0 AND 100000));

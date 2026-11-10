-- B-82, F-2 (kanevas-outils-format-vaisseaux-fiches): the crew chosen for a design, nullable (NULL = no stated crew).
-- ALTER TABLE … ADD COLUMN only: no row is rewritten.
ALTER TABLE swn_conceptions ADD COLUMN equipage INTEGER CHECK (equipage IS NULL OR (typeof(equipage) = 'integer' AND equipage BETWEEN 0 AND 100000));

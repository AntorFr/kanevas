-- B-83, X-4 (kanevas-outils-format-vaisseaux-effets): the repair skill chosen for a design, 0 to 20, saved with it.
-- ALTER TABLE … ADD COLUMN only: existing rows read 0.
ALTER TABLE swn_conceptions ADD COLUMN reparation INTEGER NOT NULL DEFAULT 0 CHECK (typeof(reparation) = 'integer' AND reparation BETWEEN 0 AND 20);

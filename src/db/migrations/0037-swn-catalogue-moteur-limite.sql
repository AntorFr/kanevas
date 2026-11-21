-- B-94, H-2, H-3 (kanevas-concepteur-vaisseaux-regles-calcul; number taken at merge, AD-51).
-- `coques.moteur_spike` (0/1, default 1: a hull from before has a Spike drive) and `amenagements.limite_par` (NULL or 'armes').
-- ALTER TABLE … ADD COLUMN only: no row is rewritten and no catalogue version moves.
ALTER TABLE swn_catalogue_coques ADD COLUMN moteur_spike INTEGER NOT NULL DEFAULT 1 CHECK (moteur_spike IN (0, 1));
ALTER TABLE swn_catalogue_amenagements ADD COLUMN limite_par TEXT CHECK (limite_par IS NULL OR limite_par = 'armes');

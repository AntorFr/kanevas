-- E-2 (kanevas-outils-vaisseaux-calcul): the smallest hull class a weapon is made for; munitions double per class above it.
ALTER TABLE swn_catalogue_armes ADD COLUMN classe_min INTEGER NOT NULL DEFAULT 1 CHECK (typeof(classe_min) = 'integer' AND classe_min BETWEEN 1 AND 4);

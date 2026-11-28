-- migrate: sans-cles-etrangeres
-- B-88, B-91, B-92, B-94, H-4, H-5 (kanevas-concepteur-vaisseaux-capacites-equipage; number 0053 taken (0047 before the catch-ups of main) at merge, AD-51).
-- `swn_catalogue_amenagements` is rebuilt (procedure of 0036): the CHECK of `effet` (only 'moteur_systeme' since 0032) takes
-- 'support_automatisation', and SQLite does not widen a CHECK by ALTER. The new column `capacite` (NULL or a code of the closed
-- list of H-4, kept in code and checked by the import) comes with the copy.
-- `effet_jeu` (NULL, 1 to 200 characters) is added to every catalogue table but `exemples`, `pj` and `robots` (default 0) to
-- `swn_conceptions`, by ALTER TABLE … ADD COLUMN. No row changes value and no catalogue version moves.

CREATE TABLE swn_catalogue_amenagements_new (
  proprietaire TEXT NOT NULL CHECK (proprietaire IN ('systeme', 'univers')),
  systeme_id INTEGER REFERENCES systemes_jeu(id) ON DELETE CASCADE,
  univers_id INTEGER REFERENCES univers(id) ON DELETE CASCADE,
  cle TEXT NOT NULL CHECK (length(cle) BETWEEN 1 AND 64),
  nom TEXT NOT NULL CHECK (length(nom) BETWEEN 1 AND 200),
  nom_en TEXT,
  description TEXT,
  source TEXT,
  cout INTEGER NOT NULL CHECK (typeof(cout) = 'integer' AND cout >= 0),
  puissance INTEGER NOT NULL CHECK (typeof(puissance) = 'integer' AND puissance >= 0),
  masse REAL NOT NULL CHECK (typeof(masse) IN ('integer','real') AND masse >= 0 AND masse * 2 = CAST(masse * 2 AS INTEGER)),
  pv INTEGER NOT NULL CHECK (typeof(pv) = 'integer' AND pv >= 0),
  ca INTEGER NOT NULL CHECK (typeof(ca) = 'integer' AND ca >= 0),
  limite INTEGER NOT NULL CHECK (typeof(limite) = 'integer' AND limite >= 0),
  x_cout INTEGER NOT NULL CHECK (x_cout IN (0, 1)),
  x_puissance INTEGER NOT NULL CHECK (x_puissance IN (0, 1)),
  x_masse INTEGER NOT NULL CHECK (x_masse IN (0, 1)),
  masque INTEGER NOT NULL DEFAULT 0 CHECK (masque IN (0, 1)),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  version_catalogue TEXT NOT NULL,
  classe_min INTEGER CHECK (classe_min IS NULL OR (typeof(classe_min) = 'integer' AND classe_min BETWEEN 1 AND 4)),
  classe_max INTEGER CHECK (classe_max IS NULL OR (typeof(classe_max) = 'integer' AND classe_max BETWEEN 1 AND 4)),
  condition TEXT CHECK (condition IS NULL OR (typeof(condition) = 'text' AND length(condition) BETWEEN 1 AND 200)),
  effet TEXT CHECK (effet IS NULL OR effet IN ('moteur_systeme', 'support_automatisation')),
  rend_puissance TEXT CHECK (rend_puissance IS NULL OR (typeof(rend_puissance) = 'text' AND json_valid(rend_puissance) AND json_array_length(rend_puissance) = 4)),
  rend_masse TEXT CHECK (rend_masse IS NULL OR (typeof(rend_masse) = 'text' AND json_valid(rend_masse) AND json_array_length(rend_masse) = 4)),
  soute INTEGER CHECK (soute IS NULL OR (typeof(soute) = 'integer' AND soute BETWEEN 0 AND 1000000)),
  soute_par_classe TEXT CHECK (soute_par_classe IS NULL OR (typeof(soute_par_classe) = 'text' AND json_valid(soute_par_classe) AND json_array_length(soute_par_classe) = 4)),
  reduction_cout_pct INTEGER CHECK (reduction_cout_pct IS NULL OR (typeof(reduction_cout_pct) = 'integer' AND reduction_cout_pct BETWEEN 1 AND 100)),
  reduction_base TEXT CHECK (reduction_base IS NULL OR reduction_base IN ('coque', 'amenagement')),
  limite_par TEXT CHECK (limite_par IS NULL OR limite_par = 'armes'),
  capacite TEXT CHECK (capacite IS NULL OR (typeof(capacite) = 'text' AND length(capacite) BETWEEN 1 AND 40)),
  CHECK ((proprietaire = 'systeme' AND systeme_id IS NOT NULL AND univers_id IS NULL)
      OR (proprietaire = 'univers' AND univers_id IS NOT NULL AND systeme_id IS NULL)),
  CHECK (proprietaire = 'univers' OR masque = 0)
);

INSERT INTO swn_catalogue_amenagements_new (proprietaire, systeme_id, univers_id, cle, nom, nom_en, description, source, cout, puissance, masse, pv, ca, limite, x_cout, x_puissance, x_masse, masque, version, version_catalogue, classe_min, classe_max, condition, effet, rend_puissance, rend_masse, soute, soute_par_classe, reduction_cout_pct, reduction_base, limite_par)
SELECT proprietaire, systeme_id, univers_id, cle, nom, nom_en, description, source, cout, puissance, masse, pv, ca, limite, x_cout, x_puissance, x_masse, masque, version, version_catalogue, classe_min, classe_max, condition, effet, rend_puissance, rend_masse, soute, soute_par_classe, reduction_cout_pct, reduction_base, limite_par
FROM swn_catalogue_amenagements;
DROP TABLE swn_catalogue_amenagements;
ALTER TABLE swn_catalogue_amenagements_new RENAME TO swn_catalogue_amenagements;
CREATE UNIQUE INDEX swn_catalogue_amenagements_systeme ON swn_catalogue_amenagements(systeme_id, cle) WHERE proprietaire = 'systeme';
CREATE UNIQUE INDEX swn_catalogue_amenagements_univers ON swn_catalogue_amenagements(univers_id, cle) WHERE proprietaire = 'univers';

ALTER TABLE swn_catalogue_amenagements ADD COLUMN effet_jeu TEXT CHECK (effet_jeu IS NULL OR (typeof(effet_jeu) = 'text' AND length(effet_jeu) BETWEEN 1 AND 200));
ALTER TABLE swn_catalogue_coques ADD COLUMN effet_jeu TEXT CHECK (effet_jeu IS NULL OR (typeof(effet_jeu) = 'text' AND length(effet_jeu) BETWEEN 1 AND 200));
ALTER TABLE swn_catalogue_moteurs ADD COLUMN effet_jeu TEXT CHECK (effet_jeu IS NULL OR (typeof(effet_jeu) = 'text' AND length(effet_jeu) BETWEEN 1 AND 200));
ALTER TABLE swn_catalogue_defenses ADD COLUMN effet_jeu TEXT CHECK (effet_jeu IS NULL OR (typeof(effet_jeu) = 'text' AND length(effet_jeu) BETWEEN 1 AND 200));
ALTER TABLE swn_catalogue_armes ADD COLUMN effet_jeu TEXT CHECK (effet_jeu IS NULL OR (typeof(effet_jeu) = 'text' AND length(effet_jeu) BETWEEN 1 AND 200));
ALTER TABLE swn_catalogue_modifications ADD COLUMN effet_jeu TEXT CHECK (effet_jeu IS NULL OR (typeof(effet_jeu) = 'text' AND length(effet_jeu) BETWEEN 1 AND 200));

ALTER TABLE swn_conceptions ADD COLUMN pj INTEGER NOT NULL DEFAULT 0 CHECK (typeof(pj) = 'integer' AND pj >= 0);
ALTER TABLE swn_conceptions ADD COLUMN robots INTEGER NOT NULL DEFAULT 0 CHECK (typeof(robots) = 'integer' AND robots >= 0);

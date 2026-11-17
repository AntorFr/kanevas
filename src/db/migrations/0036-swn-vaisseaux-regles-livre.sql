-- migrate: sans-cles-etrangeres
-- B-87, W-5 (kanevas-outils-format-vaisseaux-regles-livre; number taken at merge, AD-51).
-- The CHECK of `effet` takes the four new codes (SQLite does not widen a CHECK): `swn_catalogue_modifications` is rebuilt (procedure of 0035),
-- without `armure_par_classe`. In the same copy, `surcharge_arme` becomes `surcharge_cumulable`; the three other old effects lose their
-- effect and their parameters and stay plain modifications. No catalogue version moves.

CREATE TABLE swn_catalogue_modifications_new (
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
  cout_pct INTEGER CHECK (cout_pct IS NULL OR (typeof(cout_pct) = 'integer' AND cout_pct BETWEEN 1 AND 1000)),
  effet TEXT CHECK (effet IS NULL OR effet IN ('vitesse', 'armure', 'echange', 'soutes_doublees', 'magasins_doubles', 'reparation_min',
    'soutes_optimisees_livre', 'blindage_renforce', 'montages_specialises', 'surcharge_cumulable')),
  valeur INTEGER CHECK (valeur IS NULL OR (typeof(valeur) = 'integer' AND valeur BETWEEN -9 AND 20)),
  points_max INTEGER CHECK (points_max IS NULL OR (typeof(points_max) = 'integer' AND points_max BETWEEN 1 AND 99)),
  sens TEXT CHECK (sens IS NULL OR sens IN ('puissance_vers_masse', 'masse_vers_puissance')),
  echange_puissance INTEGER CHECK (echange_puissance IS NULL OR (typeof(echange_puissance) = 'integer' AND echange_puissance BETWEEN 1 AND 99)),
  echange_masse REAL CHECK (echange_masse IS NULL OR (typeof(echange_masse) IN ('integer', 'real') AND echange_masse >= 0.5 AND echange_masse <= 99)),
  reparation_min INTEGER CHECK (reparation_min IS NULL OR (typeof(reparation_min) = 'integer' AND reparation_min BETWEEN 1 AND 20)),
  effet_pct INTEGER CHECK (effet_pct IS NULL OR (typeof(effet_pct) = 'integer' AND effet_pct BETWEEN 1 AND 1000)),
  echange_arrondi TEXT CHECK (echange_arrondi IS NULL OR echange_arrondi IN ('installation')),
  CHECK ((proprietaire = 'systeme' AND systeme_id IS NOT NULL AND univers_id IS NULL)
      OR (proprietaire = 'univers' AND univers_id IS NOT NULL AND systeme_id IS NULL)),
  CHECK (proprietaire = 'univers' OR masque = 0)
);

INSERT INTO swn_catalogue_modifications_new (proprietaire, systeme_id, univers_id, cle, nom, nom_en, description, source, cout, puissance, masse, pv, ca, limite, x_cout, x_puissance, x_masse, masque, version, version_catalogue, cout_pct, effet, valeur, points_max, sens, echange_puissance, echange_masse, reparation_min, effet_pct, echange_arrondi)
SELECT proprietaire, systeme_id, univers_id, cle, nom, nom_en, description, source, cout, puissance, masse, pv, ca, limite, x_cout, x_puissance, x_masse, masque, version, version_catalogue, cout_pct,
  CASE WHEN effet = 'surcharge_arme' THEN 'surcharge_cumulable' WHEN effet IN ('soutes_optimisees', 'armure_par_classe', 'montage_specialise') THEN NULL ELSE effet END,
  CASE WHEN effet IN ('soutes_optimisees', 'armure_par_classe', 'montage_specialise') THEN NULL ELSE valeur END,
  points_max, sens, echange_puissance, echange_masse, reparation_min,
  CASE WHEN effet IN ('soutes_optimisees', 'armure_par_classe', 'montage_specialise') THEN NULL ELSE effet_pct END,
  echange_arrondi
FROM swn_catalogue_modifications;
DROP TABLE swn_catalogue_modifications;
ALTER TABLE swn_catalogue_modifications_new RENAME TO swn_catalogue_modifications;
CREATE UNIQUE INDEX swn_catalogue_modifications_systeme ON swn_catalogue_modifications(systeme_id, cle) WHERE proprietaire = 'systeme';
CREATE UNIQUE INDEX swn_catalogue_modifications_univers ON swn_catalogue_modifications(univers_id, cle) WHERE proprietaire = 'univers';

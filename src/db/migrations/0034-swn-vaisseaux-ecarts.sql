-- migrate: sans-cles-etrangeres
-- B-85, Y-2 (kanevas-outils-format-vaisseaux-ecarts; number taken at merge, AD-51).
-- `bonus_vitesse` becomes signed (-9 to 9): SQLite does not change a CHECK, so `swn_catalogue_defenses` is rebuilt (procedure of
-- 0026-swn-masses.sql: every row and both unique indexes copied as they are, no version moves). The three new nullable columns
-- (NULL = not stated) follow with `ADD COLUMN`; no row is rewritten.

CREATE TABLE swn_catalogue_defenses_new (
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
  bonus_vitesse INTEGER CHECK (bonus_vitesse IS NULL OR (typeof(bonus_vitesse) = 'integer' AND bonus_vitesse BETWEEN -9 AND 9)),
  CHECK ((proprietaire = 'systeme' AND systeme_id IS NOT NULL AND univers_id IS NULL)
      OR (proprietaire = 'univers' AND univers_id IS NOT NULL AND systeme_id IS NULL)),
  CHECK (proprietaire = 'univers' OR masque = 0)
);

INSERT INTO swn_catalogue_defenses_new (proprietaire, systeme_id, univers_id, cle, nom, nom_en, description, source, cout, puissance, masse, pv, ca, limite, x_cout, x_puissance, x_masse, masque, version, version_catalogue, classe_min, classe_max, condition, bonus_vitesse) SELECT proprietaire, systeme_id, univers_id, cle, nom, nom_en, description, source, cout, puissance, masse, pv, ca, limite, x_cout, x_puissance, x_masse, masque, version, version_catalogue, classe_min, classe_max, condition, bonus_vitesse FROM swn_catalogue_defenses;
DROP TABLE swn_catalogue_defenses;
ALTER TABLE swn_catalogue_defenses_new RENAME TO swn_catalogue_defenses;
CREATE UNIQUE INDEX swn_catalogue_defenses_systeme ON swn_catalogue_defenses(systeme_id, cle) WHERE proprietaire = 'systeme';
CREATE UNIQUE INDEX swn_catalogue_defenses_univers ON swn_catalogue_defenses(univers_id, cle) WHERE proprietaire = 'univers';

ALTER TABLE swn_catalogue_modifications ADD COLUMN reparation_min INTEGER CHECK (reparation_min IS NULL OR (typeof(reparation_min) = 'integer' AND reparation_min BETWEEN 1 AND 20));
ALTER TABLE swn_catalogue_amenagements ADD COLUMN soute_par_classe TEXT CHECK (soute_par_classe IS NULL OR (typeof(soute_par_classe) = 'text' AND json_valid(soute_par_classe) AND json_array_length(soute_par_classe) = 4));
ALTER TABLE swn_catalogue_amenagements ADD COLUMN reduction_cout_pct INTEGER CHECK (reduction_cout_pct IS NULL OR (typeof(reduction_cout_pct) = 'integer' AND reduction_cout_pct BETWEEN 1 AND 100));

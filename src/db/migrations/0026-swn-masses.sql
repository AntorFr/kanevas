-- migrate: sans-cles-etrangeres
-- Migration 0013 model (kanevas-outils-format-evolue-masses, B-80, AD-130; number taken at merge, AD-51).
-- `masse` of the six catalogue tables carrying it becomes REAL, a multiple of 0.5: the tables are rebuilt (AD-120's procedure),
-- every row and index copied as it is (an integer mass stays the same number; no version moves).

CREATE TABLE swn_catalogue_coques_new (
  proprietaire TEXT NOT NULL CHECK (proprietaire IN ('systeme', 'univers')),
  systeme_id INTEGER REFERENCES systemes_jeu(id) ON DELETE CASCADE,
  univers_id INTEGER REFERENCES univers(id) ON DELETE CASCADE,
  cle TEXT NOT NULL CHECK (length(cle) BETWEEN 1 AND 64),
  nom TEXT NOT NULL CHECK (length(nom) BETWEEN 1 AND 200),
  nom_en TEXT,
  description TEXT,
  source TEXT,
  classe INTEGER NOT NULL CHECK (typeof(classe) = 'integer' AND classe >= 1 AND classe <= 4),
  cout INTEGER NOT NULL CHECK (typeof(cout) = 'integer' AND cout >= 0),
  pv INTEGER NOT NULL CHECK (typeof(pv) = 'integer' AND pv >= 0),
  ca INTEGER NOT NULL CHECK (typeof(ca) = 'integer' AND ca >= 0),
  puissance INTEGER NOT NULL CHECK (typeof(puissance) = 'integer' AND puissance >= 0),
  masse REAL NOT NULL CHECK (typeof(masse) IN ('integer','real') AND masse >= 0 AND masse * 2 = CAST(masse * 2 AS INTEGER)),
  emports INTEGER NOT NULL CHECK (typeof(emports) = 'integer' AND emports >= 0),
  facteur_cout INTEGER NOT NULL CHECK (typeof(facteur_cout) = 'integer' AND facteur_cout >= 1),
  facteur_puissance INTEGER NOT NULL CHECK (typeof(facteur_puissance) = 'integer' AND facteur_puissance >= 1),
  facteur_masse INTEGER NOT NULL CHECK (typeof(facteur_masse) = 'integer' AND facteur_masse >= 1),
  masque INTEGER NOT NULL DEFAULT 0 CHECK (masque IN (0, 1)),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  version_catalogue TEXT NOT NULL,
  CHECK ((proprietaire = 'systeme' AND systeme_id IS NOT NULL AND univers_id IS NULL)
      OR (proprietaire = 'univers' AND univers_id IS NOT NULL AND systeme_id IS NULL)),
  CHECK (proprietaire = 'univers' OR masque = 0)
);

INSERT INTO swn_catalogue_coques_new (proprietaire, systeme_id, univers_id, cle, nom, nom_en, description, source, classe, cout, pv, ca, puissance, masse, emports, facteur_cout, facteur_puissance, facteur_masse, masque, version, version_catalogue) SELECT proprietaire, systeme_id, univers_id, cle, nom, nom_en, description, source, classe, cout, pv, ca, puissance, masse, emports, facteur_cout, facteur_puissance, facteur_masse, masque, version, version_catalogue FROM swn_catalogue_coques;
DROP TABLE swn_catalogue_coques;
ALTER TABLE swn_catalogue_coques_new RENAME TO swn_catalogue_coques;
CREATE UNIQUE INDEX swn_catalogue_coques_systeme ON swn_catalogue_coques(systeme_id, cle) WHERE proprietaire = 'systeme';
CREATE UNIQUE INDEX swn_catalogue_coques_univers ON swn_catalogue_coques(univers_id, cle) WHERE proprietaire = 'univers';

CREATE TABLE swn_catalogue_moteurs_new (
  proprietaire TEXT NOT NULL CHECK (proprietaire IN ('systeme', 'univers')),
  systeme_id INTEGER REFERENCES systemes_jeu(id) ON DELETE CASCADE,
  univers_id INTEGER REFERENCES univers(id) ON DELETE CASCADE,
  cle TEXT NOT NULL CHECK (length(cle) BETWEEN 1 AND 64),
  nom TEXT NOT NULL CHECK (length(nom) BETWEEN 1 AND 200),
  nom_en TEXT,
  description TEXT,
  source TEXT,
  niveau INTEGER NOT NULL CHECK (typeof(niveau) = 'integer' AND niveau >= 1 AND niveau <= 6),
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
  CHECK ((proprietaire = 'systeme' AND systeme_id IS NOT NULL AND univers_id IS NULL)
      OR (proprietaire = 'univers' AND univers_id IS NOT NULL AND systeme_id IS NULL)),
  CHECK (proprietaire = 'univers' OR masque = 0)
);

INSERT INTO swn_catalogue_moteurs_new (proprietaire, systeme_id, univers_id, cle, nom, nom_en, description, source, niveau, cout, puissance, masse, pv, ca, limite, x_cout, x_puissance, x_masse, masque, version, version_catalogue) SELECT proprietaire, systeme_id, univers_id, cle, nom, nom_en, description, source, niveau, cout, puissance, masse, pv, ca, limite, x_cout, x_puissance, x_masse, masque, version, version_catalogue FROM swn_catalogue_moteurs;
DROP TABLE swn_catalogue_moteurs;
ALTER TABLE swn_catalogue_moteurs_new RENAME TO swn_catalogue_moteurs;
CREATE UNIQUE INDEX swn_catalogue_moteurs_systeme ON swn_catalogue_moteurs(systeme_id, cle) WHERE proprietaire = 'systeme';
CREATE UNIQUE INDEX swn_catalogue_moteurs_univers ON swn_catalogue_moteurs(univers_id, cle) WHERE proprietaire = 'univers';

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
  CHECK ((proprietaire = 'systeme' AND systeme_id IS NOT NULL AND univers_id IS NULL)
      OR (proprietaire = 'univers' AND univers_id IS NOT NULL AND systeme_id IS NULL)),
  CHECK (proprietaire = 'univers' OR masque = 0)
);

INSERT INTO swn_catalogue_amenagements_new (proprietaire, systeme_id, univers_id, cle, nom, nom_en, description, source, cout, puissance, masse, pv, ca, limite, x_cout, x_puissance, x_masse, masque, version, version_catalogue) SELECT proprietaire, systeme_id, univers_id, cle, nom, nom_en, description, source, cout, puissance, masse, pv, ca, limite, x_cout, x_puissance, x_masse, masque, version, version_catalogue FROM swn_catalogue_amenagements;
DROP TABLE swn_catalogue_amenagements;
ALTER TABLE swn_catalogue_amenagements_new RENAME TO swn_catalogue_amenagements;
CREATE UNIQUE INDEX swn_catalogue_amenagements_systeme ON swn_catalogue_amenagements(systeme_id, cle) WHERE proprietaire = 'systeme';
CREATE UNIQUE INDEX swn_catalogue_amenagements_univers ON swn_catalogue_amenagements(univers_id, cle) WHERE proprietaire = 'univers';

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
  CHECK ((proprietaire = 'systeme' AND systeme_id IS NOT NULL AND univers_id IS NULL)
      OR (proprietaire = 'univers' AND univers_id IS NOT NULL AND systeme_id IS NULL)),
  CHECK (proprietaire = 'univers' OR masque = 0)
);

INSERT INTO swn_catalogue_defenses_new (proprietaire, systeme_id, univers_id, cle, nom, nom_en, description, source, cout, puissance, masse, pv, ca, limite, x_cout, x_puissance, x_masse, masque, version, version_catalogue) SELECT proprietaire, systeme_id, univers_id, cle, nom, nom_en, description, source, cout, puissance, masse, pv, ca, limite, x_cout, x_puissance, x_masse, masque, version, version_catalogue FROM swn_catalogue_defenses;
DROP TABLE swn_catalogue_defenses;
ALTER TABLE swn_catalogue_defenses_new RENAME TO swn_catalogue_defenses;
CREATE UNIQUE INDEX swn_catalogue_defenses_systeme ON swn_catalogue_defenses(systeme_id, cle) WHERE proprietaire = 'systeme';
CREATE UNIQUE INDEX swn_catalogue_defenses_univers ON swn_catalogue_defenses(univers_id, cle) WHERE proprietaire = 'univers';

CREATE TABLE swn_catalogue_armes_new (
  proprietaire TEXT NOT NULL CHECK (proprietaire IN ('systeme', 'univers')),
  systeme_id INTEGER REFERENCES systemes_jeu(id) ON DELETE CASCADE,
  univers_id INTEGER REFERENCES univers(id) ON DELETE CASCADE,
  cle TEXT NOT NULL CHECK (length(cle) BETWEEN 1 AND 64),
  nom TEXT NOT NULL CHECK (length(nom) BETWEEN 1 AND 200),
  nom_en TEXT,
  description TEXT,
  source TEXT,
  emport INTEGER NOT NULL CHECK (typeof(emport) = 'integer' AND emport >= 0),
  munitions INTEGER NOT NULL CHECK (typeof(munitions) = 'integer' AND munitions >= 0),
  cout_munition INTEGER NOT NULL CHECK (typeof(cout_munition) = 'integer' AND cout_munition >= 0),
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
  CHECK ((proprietaire = 'systeme' AND systeme_id IS NOT NULL AND univers_id IS NULL)
      OR (proprietaire = 'univers' AND univers_id IS NOT NULL AND systeme_id IS NULL)),
  CHECK (proprietaire = 'univers' OR masque = 0)
);

INSERT INTO swn_catalogue_armes_new (proprietaire, systeme_id, univers_id, cle, nom, nom_en, description, source, emport, munitions, cout_munition, cout, puissance, masse, pv, ca, limite, x_cout, x_puissance, x_masse, masque, version, version_catalogue) SELECT proprietaire, systeme_id, univers_id, cle, nom, nom_en, description, source, emport, munitions, cout_munition, cout, puissance, masse, pv, ca, limite, x_cout, x_puissance, x_masse, masque, version, version_catalogue FROM swn_catalogue_armes;
DROP TABLE swn_catalogue_armes;
ALTER TABLE swn_catalogue_armes_new RENAME TO swn_catalogue_armes;
CREATE UNIQUE INDEX swn_catalogue_armes_systeme ON swn_catalogue_armes(systeme_id, cle) WHERE proprietaire = 'systeme';
CREATE UNIQUE INDEX swn_catalogue_armes_univers ON swn_catalogue_armes(univers_id, cle) WHERE proprietaire = 'univers';

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
  CHECK ((proprietaire = 'systeme' AND systeme_id IS NOT NULL AND univers_id IS NULL)
      OR (proprietaire = 'univers' AND univers_id IS NOT NULL AND systeme_id IS NULL)),
  CHECK (proprietaire = 'univers' OR masque = 0)
);

INSERT INTO swn_catalogue_modifications_new (proprietaire, systeme_id, univers_id, cle, nom, nom_en, description, source, cout, puissance, masse, pv, ca, limite, x_cout, x_puissance, x_masse, masque, version, version_catalogue) SELECT proprietaire, systeme_id, univers_id, cle, nom, nom_en, description, source, cout, puissance, masse, pv, ca, limite, x_cout, x_puissance, x_masse, masque, version, version_catalogue FROM swn_catalogue_modifications;
DROP TABLE swn_catalogue_modifications;
ALTER TABLE swn_catalogue_modifications_new RENAME TO swn_catalogue_modifications;
CREATE UNIQUE INDEX swn_catalogue_modifications_systeme ON swn_catalogue_modifications(systeme_id, cle) WHERE proprietaire = 'systeme';
CREATE UNIQUE INDEX swn_catalogue_modifications_univers ON swn_catalogue_modifications(univers_id, cle) WHERE proprietaire = 'univers';

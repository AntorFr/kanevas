-- Module swn, ship designer (AD-123, AD-129, AD-130, V-1): the seven catalogue natures, the withdrawals and the designs.
-- The owning level is `proprietaire`: `niveau` is the engines' own field (1-6).
-- Number provisional until merge (AD-51). Only src/services/swn/* reads or writes them (AD-2).
-- `swn_fiches_generees` is not here: `kanevas-outils-vaisseaux-regles` creates it.
CREATE TABLE swn_catalogue_coques (
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
  masse INTEGER NOT NULL CHECK (typeof(masse) = 'integer' AND masse >= 0),
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
CREATE UNIQUE INDEX swn_catalogue_coques_systeme ON swn_catalogue_coques(systeme_id, cle) WHERE proprietaire = 'systeme';
CREATE UNIQUE INDEX swn_catalogue_coques_univers ON swn_catalogue_coques(univers_id, cle) WHERE proprietaire = 'univers';

CREATE TABLE swn_catalogue_moteurs (
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
  masse INTEGER NOT NULL CHECK (typeof(masse) = 'integer' AND masse >= 0),
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
CREATE UNIQUE INDEX swn_catalogue_moteurs_systeme ON swn_catalogue_moteurs(systeme_id, cle) WHERE proprietaire = 'systeme';
CREATE UNIQUE INDEX swn_catalogue_moteurs_univers ON swn_catalogue_moteurs(univers_id, cle) WHERE proprietaire = 'univers';

CREATE TABLE swn_catalogue_amenagements (
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
  masse INTEGER NOT NULL CHECK (typeof(masse) = 'integer' AND masse >= 0),
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
CREATE UNIQUE INDEX swn_catalogue_amenagements_systeme ON swn_catalogue_amenagements(systeme_id, cle) WHERE proprietaire = 'systeme';
CREATE UNIQUE INDEX swn_catalogue_amenagements_univers ON swn_catalogue_amenagements(univers_id, cle) WHERE proprietaire = 'univers';

CREATE TABLE swn_catalogue_defenses (
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
  masse INTEGER NOT NULL CHECK (typeof(masse) = 'integer' AND masse >= 0),
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
CREATE UNIQUE INDEX swn_catalogue_defenses_systeme ON swn_catalogue_defenses(systeme_id, cle) WHERE proprietaire = 'systeme';
CREATE UNIQUE INDEX swn_catalogue_defenses_univers ON swn_catalogue_defenses(univers_id, cle) WHERE proprietaire = 'univers';

CREATE TABLE swn_catalogue_armes (
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
  masse INTEGER NOT NULL CHECK (typeof(masse) = 'integer' AND masse >= 0),
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
CREATE UNIQUE INDEX swn_catalogue_armes_systeme ON swn_catalogue_armes(systeme_id, cle) WHERE proprietaire = 'systeme';
CREATE UNIQUE INDEX swn_catalogue_armes_univers ON swn_catalogue_armes(univers_id, cle) WHERE proprietaire = 'univers';

CREATE TABLE swn_catalogue_modifications (
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
  masse INTEGER NOT NULL CHECK (typeof(masse) = 'integer' AND masse >= 0),
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
CREATE UNIQUE INDEX swn_catalogue_modifications_systeme ON swn_catalogue_modifications(systeme_id, cle) WHERE proprietaire = 'systeme';
CREATE UNIQUE INDEX swn_catalogue_modifications_univers ON swn_catalogue_modifications(univers_id, cle) WHERE proprietaire = 'univers';

CREATE TABLE swn_catalogue_exemples (
  proprietaire TEXT NOT NULL CHECK (proprietaire IN ('systeme', 'univers')),
  systeme_id INTEGER REFERENCES systemes_jeu(id) ON DELETE CASCADE,
  univers_id INTEGER REFERENCES univers(id) ON DELETE CASCADE,
  cle TEXT NOT NULL CHECK (length(cle) BETWEEN 1 AND 64),
  nom TEXT NOT NULL CHECK (length(nom) BETWEEN 1 AND 200),
  nom_en TEXT,
  description TEXT,
  source TEXT,
  coque TEXT NOT NULL CHECK (length(coque) BETWEEN 1 AND 64),
  choix TEXT NOT NULL CHECK (json_valid(choix) AND json_type(choix) = 'array' AND json_array_length(choix) <= 100),
  masque INTEGER NOT NULL DEFAULT 0 CHECK (masque IN (0, 1)),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  version_catalogue TEXT NOT NULL,
  CHECK ((proprietaire = 'systeme' AND systeme_id IS NOT NULL AND univers_id IS NULL)
      OR (proprietaire = 'univers' AND univers_id IS NOT NULL AND systeme_id IS NULL)),
  CHECK (proprietaire = 'univers' OR masque = 0)
);
CREATE UNIQUE INDEX swn_catalogue_exemples_systeme ON swn_catalogue_exemples(systeme_id, cle) WHERE proprietaire = 'systeme';
CREATE UNIQUE INDEX swn_catalogue_exemples_univers ON swn_catalogue_exemples(univers_id, cle) WHERE proprietaire = 'univers';

CREATE TABLE swn_catalogue_retraits (
  univers_id INTEGER NOT NULL REFERENCES univers(id) ON DELETE CASCADE,
  nature TEXT NOT NULL CHECK (nature IN ('coques', 'moteurs', 'amenagements', 'defenses', 'armes', 'modifications', 'exemples')),
  cle TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  PRIMARY KEY (univers_id, nature, cle)
);

CREATE TABLE swn_conceptions (
  id INTEGER PRIMARY KEY,
  univers_id INTEGER NOT NULL REFERENCES univers(id) ON DELETE CASCADE,
  fiche_id INTEGER NOT NULL REFERENCES fiches(id) ON DELETE CASCADE,
  section_id INTEGER REFERENCES sections(id) ON DELETE SET NULL,
  coque_cle TEXT NOT NULL CHECK (length(coque_cle) BETWEEN 1 AND 64),
  choix TEXT NOT NULL CHECK (json_valid(choix) AND json_type(choix) = 'array' AND json_array_length(choix) <= 100),
  version_reglages TEXT NOT NULL,
  version_catalogue TEXT NOT NULL,
  resultat TEXT NOT NULL CHECK (json_valid(resultat) AND json_type(resultat) = 'object'),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  UNIQUE (fiche_id)
);
CREATE INDEX idx_swn_conceptions_univers ON swn_conceptions (univers_id);

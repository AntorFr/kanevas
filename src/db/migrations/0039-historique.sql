-- Migration 0039 (kanevas-synchro-historique-noyau, number taken at merge, AD-51, AD-147): every write on a
-- sheet dates it (`fiches.modifie_le`) and leaves its history line, by triggers reading the one-row table
-- `contexte_ecriture` that `services/historique.ts` fills for the duration of a transaction. Origin `systeme`
-- (link resolution, cache rewrite) neither dates nor writes; an empty context is recorded as `inconnu`.
-- `empreinte_apres` is left null here: `avecContexte` fills it before the commit (SHA-256 is not SQL).
-- Generated once from a script; the table starts empty (no past write is reconstructed).

CREATE TABLE contexte_ecriture (
  id        INTEGER PRIMARY KEY CHECK (id = 1),
  compte_id INTEGER REFERENCES comptes (id),
  jeton_id  INTEGER REFERENCES jetons_api (id),
  origine   TEXT NOT NULL CHECK (origine IN ('ecran', 'assistant', 'import', 'mcp', 'outil', 'inconnu', 'systeme')),
  lot_id    INTEGER
);

CREATE TABLE historique (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  univers_id      INTEGER NOT NULL,
  fiche_id        INTEGER,
  fiche_cle       TEXT NOT NULL,
  fiche_titre     TEXT NOT NULL,
  objet           TEXT NOT NULL CHECK (objet IN ('entete', 'section', 'relation', 'fiche')),
  objet_cle       TEXT,
  action          TEXT NOT NULL CHECK (action IN ('creee', 'modifiee', 'supprimee')),
  empreinte_apres TEXT,
  compte_id       INTEGER REFERENCES comptes (id),
  jeton_id        INTEGER REFERENCES jetons_api (id),
  origine         TEXT NOT NULL CHECK (origine IN ('ecran', 'assistant', 'import', 'mcp', 'outil', 'inconnu')),
  lot_id          INTEGER,
  cree_le         TEXT NOT NULL,
  valeur_avant    TEXT CHECK (valeur_avant IS NULL OR json_valid(valeur_avant))
);
CREATE INDEX historique_univers ON historique (univers_id, id DESC);
CREATE INDEX historique_fiche ON historique (fiche_id, id DESC);
CREATE INDEX historique_cree_le ON historique (cree_le);

CREATE TRIGGER historique_fiches_ai AFTER INSERT ON fiches
  WHEN COALESCE((SELECT origine FROM contexte_ecriture WHERE id = 1), 'inconnu') <> 'systeme'
  BEGIN
    INSERT INTO historique (univers_id, fiche_id, fiche_cle, fiche_titre, objet, objet_cle, action, compte_id, jeton_id, origine, lot_id, cree_le, valeur_avant)
    SELECT f.univers_id, f.id, f.cle, f.titre, 'fiche', NULL, 'creee', c.compte_id, c.jeton_id, COALESCE(c.origine, 'inconnu'), c.lot_id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL
      FROM fiches f LEFT JOIN contexte_ecriture c ON c.id = 1
     WHERE f.id = NEW.id;
  END;

CREATE TRIGGER historique_fiches_au AFTER UPDATE OF titre, type, sous_type, parent_id, charge, cle, illustration_fichier_id, illustration_fichier, illustration_type, illustration_taille ON fiches
  WHEN COALESCE((SELECT origine FROM contexte_ecriture WHERE id = 1), 'inconnu') <> 'systeme' AND (OLD.titre IS NOT NEW.titre OR OLD.type IS NOT NEW.type OR OLD.sous_type IS NOT NEW.sous_type OR OLD.parent_id IS NOT NEW.parent_id OR OLD.charge IS NOT NEW.charge OR OLD.cle IS NOT NEW.cle OR OLD.illustration_fichier_id IS NOT NEW.illustration_fichier_id OR OLD.illustration_fichier IS NOT NEW.illustration_fichier OR OLD.illustration_type IS NOT NEW.illustration_type OR OLD.illustration_taille IS NOT NEW.illustration_taille)
  BEGIN
    INSERT INTO historique (univers_id, fiche_id, fiche_cle, fiche_titre, objet, objet_cle, action, compte_id, jeton_id, origine, lot_id, cree_le, valeur_avant)
    SELECT f.univers_id, f.id, f.cle, f.titre, 'entete', NULL, 'modifiee', c.compte_id, c.jeton_id, COALESCE(c.origine, 'inconnu'), c.lot_id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), json_object('titre', OLD.titre, 'type', OLD.type, 'sous_type', OLD.sous_type, 'parent_id', OLD.parent_id, 'charge', json(OLD.charge), 'cle', OLD.cle, 'cree_le', OLD.cree_le, 'illustration_fichier_id', OLD.illustration_fichier_id, 'alias', json((SELECT json_group_array(alias) FROM (SELECT alias FROM fiche_alias WHERE fiche_id = NEW.id ORDER BY alias))), 'etiquettes', json((SELECT json_group_array(nom) FROM (SELECT e.nom AS nom FROM fiche_etiquettes fe JOIN etiquettes e ON e.id = fe.etiquette_id WHERE fe.fiche_id = NEW.id ORDER BY e.nom))))
      FROM fiches f LEFT JOIN contexte_ecriture c ON c.id = 1
     WHERE f.id = NEW.id;
    UPDATE fiches SET modifie_le = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
  END;

CREATE TRIGGER historique_fiches_bd BEFORE DELETE ON fiches
  WHEN COALESCE((SELECT origine FROM contexte_ecriture WHERE id = 1), 'inconnu') <> 'systeme'
  BEGIN
    INSERT INTO historique (univers_id, fiche_id, fiche_cle, fiche_titre, objet, objet_cle, action, compte_id, jeton_id, origine, lot_id, cree_le, valeur_avant)
    SELECT f.univers_id, f.id, f.cle, f.titre, 'fiche', NULL, 'supprimee', c.compte_id, c.jeton_id, COALESCE(c.origine, 'inconnu'), c.lot_id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), json_insert(json_object('titre', OLD.titre, 'type', OLD.type, 'sous_type', OLD.sous_type, 'parent_id', OLD.parent_id, 'charge', json(OLD.charge), 'cle', OLD.cle, 'cree_le', OLD.cree_le, 'illustration_fichier_id', OLD.illustration_fichier_id, 'alias', json((SELECT json_group_array(alias) FROM (SELECT alias FROM fiche_alias WHERE fiche_id = OLD.id ORDER BY alias))), 'etiquettes', json((SELECT json_group_array(nom) FROM (SELECT e.nom AS nom FROM fiche_etiquettes fe JOIN etiquettes e ON e.id = fe.etiquette_id WHERE fe.fiche_id = OLD.id ORDER BY e.nom)))), '$.sections', json((SELECT json_group_array(json(json_object('cle', s.cle, 'titre', s.titre, 'ordre', s.ordre, 'contenu', s.contenu, 'version', s.version, 'joueurs_lisent', s.joueurs_lisent, 'joueurs_ecrivent', s.joueurs_ecrivent, 'auteur_id', s.auteur_id, 'auteur_lit', s.auteur_lit, 'auteur_ecrit', s.auteur_ecrit, 'gere_par', s.gere_par, 'fichiers', json((SELECT json_group_array(fichier_id) FROM (SELECT fichier_id FROM fichiers_sections WHERE section_id = s.id AND joint = 1 ORDER BY fichier_id)))))) FROM (SELECT * FROM sections WHERE fiche_id = OLD.id ORDER BY ordre) s)))
      FROM fiches f LEFT JOIN contexte_ecriture c ON c.id = 1
     WHERE f.id = OLD.id;
  END;

-- A deleted sheet keeps its lines (30 days of values, then 90 of trace) with no `fiche_id`.
CREATE TRIGGER historique_fiches_ad AFTER DELETE ON fiches BEGIN
  UPDATE historique SET fiche_id = NULL WHERE fiche_id = OLD.id;
END;

CREATE TRIGGER historique_sections_ai AFTER INSERT ON sections
  WHEN COALESCE((SELECT origine FROM contexte_ecriture WHERE id = 1), 'inconnu') <> 'systeme'
  BEGIN
    INSERT INTO historique (univers_id, fiche_id, fiche_cle, fiche_titre, objet, objet_cle, action, compte_id, jeton_id, origine, lot_id, cree_le, valeur_avant)
    SELECT f.univers_id, f.id, f.cle, f.titre, 'section', NEW.cle, 'creee', c.compte_id, c.jeton_id, COALESCE(c.origine, 'inconnu'), c.lot_id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL
      FROM fiches f LEFT JOIN contexte_ecriture c ON c.id = 1
     WHERE f.id = NEW.fiche_id;
    UPDATE fiches SET modifie_le = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.fiche_id;
  END;

CREATE TRIGGER historique_sections_au AFTER UPDATE OF titre, ordre, contenu, joueurs_lisent, joueurs_ecrivent, auteur_id, auteur_lit, auteur_ecrit, gere_par, cle ON sections
  WHEN COALESCE((SELECT origine FROM contexte_ecriture WHERE id = 1), 'inconnu') <> 'systeme' AND (OLD.titre IS NOT NEW.titre OR OLD.ordre IS NOT NEW.ordre OR OLD.contenu IS NOT NEW.contenu OR OLD.joueurs_lisent IS NOT NEW.joueurs_lisent OR OLD.joueurs_ecrivent IS NOT NEW.joueurs_ecrivent OR OLD.auteur_id IS NOT NEW.auteur_id OR OLD.auteur_lit IS NOT NEW.auteur_lit OR OLD.auteur_ecrit IS NOT NEW.auteur_ecrit OR OLD.gere_par IS NOT NEW.gere_par OR OLD.cle IS NOT NEW.cle)
  BEGIN
    INSERT INTO historique (univers_id, fiche_id, fiche_cle, fiche_titre, objet, objet_cle, action, compte_id, jeton_id, origine, lot_id, cree_le, valeur_avant)
    SELECT f.univers_id, f.id, f.cle, f.titre, 'section', NEW.cle, 'modifiee', c.compte_id, c.jeton_id, COALESCE(c.origine, 'inconnu'), c.lot_id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), json_object('cle', OLD.cle, 'titre', OLD.titre, 'ordre', OLD.ordre, 'contenu', OLD.contenu, 'version', OLD.version, 'joueurs_lisent', OLD.joueurs_lisent, 'joueurs_ecrivent', OLD.joueurs_ecrivent, 'auteur_id', OLD.auteur_id, 'auteur_lit', OLD.auteur_lit, 'auteur_ecrit', OLD.auteur_ecrit, 'gere_par', OLD.gere_par, 'fichiers', json((SELECT json_group_array(fichier_id) FROM (SELECT fichier_id FROM fichiers_sections WHERE section_id = OLD.id AND joint = 1 ORDER BY fichier_id))))
      FROM fiches f LEFT JOIN contexte_ecriture c ON c.id = 1
     WHERE f.id = NEW.fiche_id;
    UPDATE fiches SET modifie_le = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.fiche_id;
  END;

CREATE TRIGGER historique_sections_bd BEFORE DELETE ON sections
  WHEN COALESCE((SELECT origine FROM contexte_ecriture WHERE id = 1), 'inconnu') <> 'systeme'
  BEGIN
    INSERT INTO historique (univers_id, fiche_id, fiche_cle, fiche_titre, objet, objet_cle, action, compte_id, jeton_id, origine, lot_id, cree_le, valeur_avant)
    SELECT f.univers_id, f.id, f.cle, f.titre, 'section', OLD.cle, 'supprimee', c.compte_id, c.jeton_id, COALESCE(c.origine, 'inconnu'), c.lot_id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), json_object('cle', OLD.cle, 'titre', OLD.titre, 'ordre', OLD.ordre, 'contenu', OLD.contenu, 'version', OLD.version, 'joueurs_lisent', OLD.joueurs_lisent, 'joueurs_ecrivent', OLD.joueurs_ecrivent, 'auteur_id', OLD.auteur_id, 'auteur_lit', OLD.auteur_lit, 'auteur_ecrit', OLD.auteur_ecrit, 'gere_par', OLD.gere_par, 'fichiers', json((SELECT json_group_array(fichier_id) FROM (SELECT fichier_id FROM fichiers_sections WHERE section_id = OLD.id AND joint = 1 ORDER BY fichier_id))))
      FROM fiches f LEFT JOIN contexte_ecriture c ON c.id = 1
     WHERE f.id = OLD.fiche_id;
    UPDATE fiches SET modifie_le = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = OLD.fiche_id;
  END;

CREATE TRIGGER historique_relations_ai AFTER INSERT ON relations
  WHEN COALESCE((SELECT origine FROM contexte_ecriture WHERE id = 1), 'inconnu') <> 'systeme'
  BEGIN
    INSERT INTO historique (univers_id, fiche_id, fiche_cle, fiche_titre, objet, objet_cle, action, compte_id, jeton_id, origine, lot_id, cree_le, valeur_avant)
    SELECT f.univers_id, f.id, f.cle, f.titre, 'relation', (SELECT cle FROM sections WHERE id = NEW.section_id), 'creee', c.compte_id, c.jeton_id, COALESCE(c.origine, 'inconnu'), c.lot_id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL
      FROM fiches f LEFT JOIN contexte_ecriture c ON c.id = 1
     WHERE f.id = (SELECT fiche_id FROM sections WHERE id = NEW.section_id);
    UPDATE fiches SET modifie_le = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = (SELECT fiche_id FROM sections WHERE id = NEW.section_id);
  END;

CREATE TRIGGER historique_relations_au AFTER UPDATE ON relations
  WHEN COALESCE((SELECT origine FROM contexte_ecriture WHERE id = 1), 'inconnu') <> 'systeme' AND (OLD.cible_fiche_id IS NOT NEW.cible_fiche_id OR OLD.nature IS NOT NEW.nature OR OLD.qualificatif IS NOT NEW.qualificatif)
  BEGIN
    INSERT INTO historique (univers_id, fiche_id, fiche_cle, fiche_titre, objet, objet_cle, action, compte_id, jeton_id, origine, lot_id, cree_le, valeur_avant)
    SELECT f.univers_id, f.id, f.cle, f.titre, 'relation', (SELECT cle FROM sections WHERE id = NEW.section_id), 'modifiee', c.compte_id, c.jeton_id, COALESCE(c.origine, 'inconnu'), c.lot_id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), json_object('cible_fiche_id', OLD.cible_fiche_id, 'cible_cle', (SELECT cle FROM fiches WHERE id = OLD.cible_fiche_id), 'nature', OLD.nature, 'qualificatif', OLD.qualificatif)
      FROM fiches f LEFT JOIN contexte_ecriture c ON c.id = 1
     WHERE f.id = (SELECT fiche_id FROM sections WHERE id = NEW.section_id);
    UPDATE fiches SET modifie_le = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = (SELECT fiche_id FROM sections WHERE id = NEW.section_id);
  END;

CREATE TRIGGER historique_relations_ad AFTER DELETE ON relations
  WHEN COALESCE((SELECT origine FROM contexte_ecriture WHERE id = 1), 'inconnu') <> 'systeme'
  BEGIN
    INSERT INTO historique (univers_id, fiche_id, fiche_cle, fiche_titre, objet, objet_cle, action, compte_id, jeton_id, origine, lot_id, cree_le, valeur_avant)
    SELECT f.univers_id, f.id, f.cle, f.titre, 'relation', (SELECT cle FROM sections WHERE id = OLD.section_id), 'supprimee', c.compte_id, c.jeton_id, COALESCE(c.origine, 'inconnu'), c.lot_id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), json_object('cible_fiche_id', OLD.cible_fiche_id, 'cible_cle', (SELECT cle FROM fiches WHERE id = OLD.cible_fiche_id), 'nature', OLD.nature, 'qualificatif', OLD.qualificatif)
      FROM fiches f LEFT JOIN contexte_ecriture c ON c.id = 1
     WHERE f.id = (SELECT fiche_id FROM sections WHERE id = OLD.section_id);
    UPDATE fiches SET modifie_le = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = (SELECT fiche_id FROM sections WHERE id = OLD.section_id);
  END;

CREATE TRIGGER historique_alias_ai AFTER INSERT ON fiche_alias
  WHEN COALESCE((SELECT origine FROM contexte_ecriture WHERE id = 1), 'inconnu') <> 'systeme'
  BEGIN
    INSERT INTO historique (univers_id, fiche_id, fiche_cle, fiche_titre, objet, objet_cle, action, compte_id, jeton_id, origine, lot_id, cree_le, valeur_avant)
    SELECT f.univers_id, f.id, f.cle, f.titre, 'entete', NULL, 'modifiee', c.compte_id, c.jeton_id, COALESCE(c.origine, 'inconnu'), c.lot_id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), json_object('titre', f.titre, 'type', f.type, 'sous_type', f.sous_type, 'parent_id', f.parent_id, 'charge', json(f.charge), 'cle', f.cle, 'cree_le', f.cree_le, 'illustration_fichier_id', f.illustration_fichier_id, 'alias', json((SELECT json_group_array(alias) FROM (SELECT alias FROM fiche_alias WHERE fiche_id = f.id AND alias <> NEW.alias COLLATE NOCASE ORDER BY alias))), 'etiquettes', json((SELECT json_group_array(nom) FROM (SELECT e.nom AS nom FROM fiche_etiquettes fe JOIN etiquettes e ON e.id = fe.etiquette_id WHERE fe.fiche_id = f.id ORDER BY e.nom))))
      FROM fiches f LEFT JOIN contexte_ecriture c ON c.id = 1
     WHERE f.id = NEW.fiche_id;
    UPDATE fiches SET modifie_le = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.fiche_id;
  END;

CREATE TRIGGER historique_alias_au AFTER UPDATE ON fiche_alias
  WHEN COALESCE((SELECT origine FROM contexte_ecriture WHERE id = 1), 'inconnu') <> 'systeme' AND OLD.alias IS NOT NEW.alias
  BEGIN
    INSERT INTO historique (univers_id, fiche_id, fiche_cle, fiche_titre, objet, objet_cle, action, compte_id, jeton_id, origine, lot_id, cree_le, valeur_avant)
    SELECT f.univers_id, f.id, f.cle, f.titre, 'entete', NULL, 'modifiee', c.compte_id, c.jeton_id, COALESCE(c.origine, 'inconnu'), c.lot_id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), json_object('titre', f.titre, 'type', f.type, 'sous_type', f.sous_type, 'parent_id', f.parent_id, 'charge', json(f.charge), 'cle', f.cle, 'cree_le', f.cree_le, 'illustration_fichier_id', f.illustration_fichier_id, 'alias', json((SELECT json_group_array(alias) FROM (SELECT alias FROM fiche_alias WHERE fiche_id = f.id AND alias <> NEW.alias COLLATE NOCASE UNION SELECT OLD.alias ORDER BY alias))), 'etiquettes', json((SELECT json_group_array(nom) FROM (SELECT e.nom AS nom FROM fiche_etiquettes fe JOIN etiquettes e ON e.id = fe.etiquette_id WHERE fe.fiche_id = f.id ORDER BY e.nom))))
      FROM fiches f LEFT JOIN contexte_ecriture c ON c.id = 1
     WHERE f.id = NEW.fiche_id;
    UPDATE fiches SET modifie_le = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.fiche_id;
  END;

CREATE TRIGGER historique_alias_ad AFTER DELETE ON fiche_alias
  WHEN COALESCE((SELECT origine FROM contexte_ecriture WHERE id = 1), 'inconnu') <> 'systeme'
  BEGIN
    INSERT INTO historique (univers_id, fiche_id, fiche_cle, fiche_titre, objet, objet_cle, action, compte_id, jeton_id, origine, lot_id, cree_le, valeur_avant)
    SELECT f.univers_id, f.id, f.cle, f.titre, 'entete', NULL, 'modifiee', c.compte_id, c.jeton_id, COALESCE(c.origine, 'inconnu'), c.lot_id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), json_object('titre', f.titre, 'type', f.type, 'sous_type', f.sous_type, 'parent_id', f.parent_id, 'charge', json(f.charge), 'cle', f.cle, 'cree_le', f.cree_le, 'illustration_fichier_id', f.illustration_fichier_id, 'alias', json((SELECT json_group_array(alias) FROM (SELECT alias FROM fiche_alias WHERE fiche_id = f.id UNION SELECT OLD.alias ORDER BY alias))), 'etiquettes', json((SELECT json_group_array(nom) FROM (SELECT e.nom AS nom FROM fiche_etiquettes fe JOIN etiquettes e ON e.id = fe.etiquette_id WHERE fe.fiche_id = f.id ORDER BY e.nom))))
      FROM fiches f LEFT JOIN contexte_ecriture c ON c.id = 1
     WHERE f.id = OLD.fiche_id;
    UPDATE fiches SET modifie_le = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = OLD.fiche_id;
  END;

CREATE TRIGGER historique_etiquettes_ai AFTER INSERT ON fiche_etiquettes
  WHEN COALESCE((SELECT origine FROM contexte_ecriture WHERE id = 1), 'inconnu') <> 'systeme'
  BEGIN
    INSERT INTO historique (univers_id, fiche_id, fiche_cle, fiche_titre, objet, objet_cle, action, compte_id, jeton_id, origine, lot_id, cree_le, valeur_avant)
    SELECT f.univers_id, f.id, f.cle, f.titre, 'entete', NULL, 'modifiee', c.compte_id, c.jeton_id, COALESCE(c.origine, 'inconnu'), c.lot_id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), json_object('titre', f.titre, 'type', f.type, 'sous_type', f.sous_type, 'parent_id', f.parent_id, 'charge', json(f.charge), 'cle', f.cle, 'cree_le', f.cree_le, 'illustration_fichier_id', f.illustration_fichier_id, 'alias', json((SELECT json_group_array(alias) FROM (SELECT alias FROM fiche_alias WHERE fiche_id = f.id ORDER BY alias))), 'etiquettes', json((SELECT json_group_array(nom) FROM (SELECT e.nom AS nom FROM fiche_etiquettes fe JOIN etiquettes e ON e.id = fe.etiquette_id WHERE fe.fiche_id = f.id AND fe.etiquette_id <> NEW.etiquette_id ORDER BY e.nom))))
      FROM fiches f LEFT JOIN contexte_ecriture c ON c.id = 1
     WHERE f.id = NEW.fiche_id;
    UPDATE fiches SET modifie_le = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.fiche_id;
  END;

CREATE TRIGGER historique_etiquettes_ad AFTER DELETE ON fiche_etiquettes
  WHEN COALESCE((SELECT origine FROM contexte_ecriture WHERE id = 1), 'inconnu') <> 'systeme'
  BEGIN
    INSERT INTO historique (univers_id, fiche_id, fiche_cle, fiche_titre, objet, objet_cle, action, compte_id, jeton_id, origine, lot_id, cree_le, valeur_avant)
    SELECT f.univers_id, f.id, f.cle, f.titre, 'entete', NULL, 'modifiee', c.compte_id, c.jeton_id, COALESCE(c.origine, 'inconnu'), c.lot_id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), json_object('titre', f.titre, 'type', f.type, 'sous_type', f.sous_type, 'parent_id', f.parent_id, 'charge', json(f.charge), 'cle', f.cle, 'cree_le', f.cree_le, 'illustration_fichier_id', f.illustration_fichier_id, 'alias', json((SELECT json_group_array(alias) FROM (SELECT alias FROM fiche_alias WHERE fiche_id = f.id ORDER BY alias))), 'etiquettes', json((SELECT json_group_array(nom) FROM (SELECT e.nom AS nom FROM fiche_etiquettes fe JOIN etiquettes e ON e.id = fe.etiquette_id WHERE fe.fiche_id = f.id UNION SELECT nom FROM etiquettes WHERE id = OLD.etiquette_id ORDER BY nom))))
      FROM fiches f LEFT JOIN contexte_ecriture c ON c.id = 1
     WHERE f.id = OLD.fiche_id;
    UPDATE fiches SET modifie_le = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = OLD.fiche_id;
  END;

CREATE TRIGGER historique_fichiers_sections_ai AFTER INSERT ON fichiers_sections
  WHEN COALESCE((SELECT origine FROM contexte_ecriture WHERE id = 1), 'inconnu') <> 'systeme' AND NEW.joint = 1
  BEGIN
    INSERT INTO historique (univers_id, fiche_id, fiche_cle, fiche_titre, objet, objet_cle, action, compte_id, jeton_id, origine, lot_id, cree_le, valeur_avant)
    SELECT f.univers_id, f.id, f.cle, f.titre, 'section', (SELECT cle FROM sections WHERE id = NEW.section_id), 'modifiee', c.compte_id, c.jeton_id, COALESCE(c.origine, 'inconnu'), c.lot_id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), (SELECT json_object('cle', s.cle, 'titre', s.titre, 'ordre', s.ordre, 'contenu', s.contenu, 'version', s.version, 'joueurs_lisent', s.joueurs_lisent, 'joueurs_ecrivent', s.joueurs_ecrivent, 'auteur_id', s.auteur_id, 'auteur_lit', s.auteur_lit, 'auteur_ecrit', s.auteur_ecrit, 'gere_par', s.gere_par, 'fichiers', json((SELECT json_group_array(fichier_id) FROM (SELECT fichier_id FROM fichiers_sections WHERE section_id = s.id AND joint = 1 AND fichier_id <> NEW.fichier_id ORDER BY fichier_id)))) FROM sections s WHERE s.id = NEW.section_id)
      FROM fiches f LEFT JOIN contexte_ecriture c ON c.id = 1
     WHERE f.id = (SELECT fiche_id FROM sections WHERE id = NEW.section_id);
    UPDATE fiches SET modifie_le = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = (SELECT fiche_id FROM sections WHERE id = NEW.section_id);
  END;

CREATE TRIGGER historique_fichiers_sections_joint AFTER UPDATE OF joint ON fichiers_sections
  WHEN COALESCE((SELECT origine FROM contexte_ecriture WHERE id = 1), 'inconnu') <> 'systeme' AND OLD.joint = 0 AND NEW.joint = 1
  BEGIN
    INSERT INTO historique (univers_id, fiche_id, fiche_cle, fiche_titre, objet, objet_cle, action, compte_id, jeton_id, origine, lot_id, cree_le, valeur_avant)
    SELECT f.univers_id, f.id, f.cle, f.titre, 'section', (SELECT cle FROM sections WHERE id = NEW.section_id), 'modifiee', c.compte_id, c.jeton_id, COALESCE(c.origine, 'inconnu'), c.lot_id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), (SELECT json_object('cle', s.cle, 'titre', s.titre, 'ordre', s.ordre, 'contenu', s.contenu, 'version', s.version, 'joueurs_lisent', s.joueurs_lisent, 'joueurs_ecrivent', s.joueurs_ecrivent, 'auteur_id', s.auteur_id, 'auteur_lit', s.auteur_lit, 'auteur_ecrit', s.auteur_ecrit, 'gere_par', s.gere_par, 'fichiers', json((SELECT json_group_array(fichier_id) FROM (SELECT fichier_id FROM fichiers_sections WHERE section_id = s.id AND joint = 1 AND fichier_id <> NEW.fichier_id ORDER BY fichier_id)))) FROM sections s WHERE s.id = NEW.section_id)
      FROM fiches f LEFT JOIN contexte_ecriture c ON c.id = 1
     WHERE f.id = (SELECT fiche_id FROM sections WHERE id = NEW.section_id);
    UPDATE fiches SET modifie_le = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = (SELECT fiche_id FROM sections WHERE id = NEW.section_id);
  END;

CREATE TRIGGER historique_fichiers_sections_retire AFTER UPDATE OF joint ON fichiers_sections
  WHEN COALESCE((SELECT origine FROM contexte_ecriture WHERE id = 1), 'inconnu') <> 'systeme' AND OLD.joint = 1 AND NEW.joint = 0
  BEGIN
    INSERT INTO historique (univers_id, fiche_id, fiche_cle, fiche_titre, objet, objet_cle, action, compte_id, jeton_id, origine, lot_id, cree_le, valeur_avant)
    SELECT f.univers_id, f.id, f.cle, f.titre, 'section', (SELECT cle FROM sections WHERE id = NEW.section_id), 'modifiee', c.compte_id, c.jeton_id, COALESCE(c.origine, 'inconnu'), c.lot_id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), (SELECT json_object('cle', s.cle, 'titre', s.titre, 'ordre', s.ordre, 'contenu', s.contenu, 'version', s.version, 'joueurs_lisent', s.joueurs_lisent, 'joueurs_ecrivent', s.joueurs_ecrivent, 'auteur_id', s.auteur_id, 'auteur_lit', s.auteur_lit, 'auteur_ecrit', s.auteur_ecrit, 'gere_par', s.gere_par, 'fichiers', json(json_insert((SELECT json_group_array(fichier_id) FROM (SELECT fichier_id FROM fichiers_sections WHERE section_id = s.id AND joint = 1 ORDER BY fichier_id)), '$[#]', NEW.fichier_id))) FROM sections s WHERE s.id = NEW.section_id)
      FROM fiches f LEFT JOIN contexte_ecriture c ON c.id = 1
     WHERE f.id = (SELECT fiche_id FROM sections WHERE id = NEW.section_id);
    UPDATE fiches SET modifie_le = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = (SELECT fiche_id FROM sections WHERE id = NEW.section_id);
  END;

CREATE TRIGGER historique_fichiers_sections_ad AFTER DELETE ON fichiers_sections
  WHEN COALESCE((SELECT origine FROM contexte_ecriture WHERE id = 1), 'inconnu') <> 'systeme' AND OLD.joint = 1
  BEGIN
    INSERT INTO historique (univers_id, fiche_id, fiche_cle, fiche_titre, objet, objet_cle, action, compte_id, jeton_id, origine, lot_id, cree_le, valeur_avant)
    SELECT f.univers_id, f.id, f.cle, f.titre, 'section', (SELECT cle FROM sections WHERE id = OLD.section_id), 'modifiee', c.compte_id, c.jeton_id, COALESCE(c.origine, 'inconnu'), c.lot_id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), (SELECT json_object('cle', s.cle, 'titre', s.titre, 'ordre', s.ordre, 'contenu', s.contenu, 'version', s.version, 'joueurs_lisent', s.joueurs_lisent, 'joueurs_ecrivent', s.joueurs_ecrivent, 'auteur_id', s.auteur_id, 'auteur_lit', s.auteur_lit, 'auteur_ecrit', s.auteur_ecrit, 'gere_par', s.gere_par, 'fichiers', json(json_insert((SELECT json_group_array(fichier_id) FROM (SELECT fichier_id FROM fichiers_sections WHERE section_id = s.id AND joint = 1 ORDER BY fichier_id)), '$[#]', OLD.fichier_id))) FROM sections s WHERE s.id = OLD.section_id)
      FROM fiches f LEFT JOIN contexte_ecriture c ON c.id = 1
     WHERE f.id = (SELECT fiche_id FROM sections WHERE id = OLD.section_id);
    UPDATE fiches SET modifie_le = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = (SELECT fiche_id FROM sections WHERE id = OLD.section_id);
  END;

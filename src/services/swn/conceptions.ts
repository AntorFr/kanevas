import type { Db } from '../../db/db.js';
import type { AlerteVaisseau, ResultatVaisseau } from '../../outils/swn/regles/vaisseau.js';
import { texteVaisseau } from '../../outils/swn/regles/texte-vaisseau.js';
import { estGeree, exigerRole, peutEcrireSection, peutLireSection, peutVoirFiche, vueMJ } from '../droits.js';
import { ErreurService, introuvable, invalide, refuse } from '../erreurs.js';
import { chargerFiche } from '../fiches.js';
import { accessible, peutUsage } from '../outils.js';
import { poserSectionGeree } from '../sections-gerees.js';
import { etatGere } from '../sections-gerees-etat.js';
import type { Acteur, SectionRow } from '../types.js';
import { calculerDepuisChoix, calculerResolu, OUTIL_VAISSEAUX, resoudreChoix, TYPE_CARACTERISTIQUES, validerChoix, validerEquipage, versionSourceVaisseaux,
  versionsSource, type EntreeCalcul, type LigneChoix, type Porte } from './calcul-vaisseau.js';
import { ligneDe, porteDe, type ChargeConception, type LigneConception } from './section-vaisseaux.js';

// The designs under rights (V-5, V-7): the row `swn_conceptions` and the managed section « Caractéristiques » are written
// together, in one transaction, by `poserSectionGeree` and its `apresEcriture` hook — never apart. The SQL on
// `swn_conceptions` lives in this file and in `section-vaisseaux.ts` (the hook), both under `services/swn/`.

/** A blocking alert refuses the save; the alerts ride on the error (the screen shows them). */
export class ErreurConceptionBloquee extends ErreurService {
  constructor(readonly alertes: AlerteVaisseau[]) {
    super('invalide', alertes.find((a) => a.niveau === 'bloquante')?.texte ?? 'Conception bloquée.', 'conception_bloquee');
  }
}

export interface VueConception {
  ficheId: number;
  titre: string;
  coque: { cle: string; nom: string; classe: number };
  lignes: { nature: string; cle: string; nom: string; quantite: number }[];
  resultat: ResultatVaisseau;
  alertes: AlerteVaisseau[];
  version: number;
  /** The core's `etatGere` (S-4), read at each call, never stored (R-8). */
  perime: boolean;
  peutRecalculer: boolean;
  sectionId: number;
  sectionVersion: number;
  peutEcrire: boolean;
  lienFiche: string;
}
export interface ConceptionListee {
  ficheId: number; titre: string; coque: { cle: string; nom: string; classe: number }; prix: number;
  bloquantes: number; aSurveiller: number; perime: boolean; auteur: { id: number; nom: string } | null; peutEcrire: boolean;
}
export interface ListeConceptions {
  conceptions: ConceptionListee[];
  peutCreer: boolean;
  fichesSansConception?: { ficheId: number; titre: string }[];
}

/** Who may write the section: the usage `concevoir`, then the audience, read as the actor (Player mode writes as a player). */
function peutEcrire(db: Db, acteur: Acteur, universId: number, role: 'mj' | 'joueur', s: SectionRow): boolean {
  if (!peutUsage(db, acteur, universId, OUTIL_VAISSEAUX, 'concevoir')) return false;
  return vueMJ(role, acteur) || peutEcrireSection('joueur', s, acteur.modeJoueur ? 0 : acteur.compteId);
}

interface Lue { role: 'mj' | 'joueur'; ligne: LigneConception; section: SectionRow; titre: string }
/** Reading = reading the sheet and the section; anything else is the answer of an absent address (V-7). */
function lire(db: Db, acteur: Acteur, universId: number, ficheId: number): Lue {
  const role = exigerRole(db, universId, acteur.compteId);
  if (!accessible(db, acteur, universId, OUTIL_VAISSEAUX)) throw introuvable();
  const ligne = db.prepare('SELECT * FROM swn_conceptions WHERE fiche_id = ? AND univers_id = ?').get(ficheId, universId) as LigneConception | undefined;
  if (!ligne || ligne.section_id === null) throw introuvable();
  const section = db.prepare('SELECT * FROM sections WHERE id = ? AND fiche_id = ?').get(ligne.section_id, ficheId) as SectionRow | undefined;
  if (!section || !estGeree(section) || !peutVoirFiche(db, role, ficheId, acteur) || !peutLireSection(role, section, acteur)) {
    throw introuvable();
  }
  const titre = (db.prepare('SELECT titre FROM fiches WHERE id = ?').get(ficheId) as { titre: string }).titre;
  return { role, ligne, section, titre };
}

function vue(db: Db, acteur: Acteur, universId: number, l: Lue): VueConception {
  const stocke = JSON.parse(l.ligne.resultat) as ResultatVaisseau;
  // A result stored before the slice has no vitesse / armure / equipage: read as `null` (F-3).
  const resultat: ResultatVaisseau = { ...stocke, vitesse: stocke.vitesse ?? null, armure: stocke.armure ?? null, equipage: stocke.equipage ?? null };
  const choix = JSON.parse(l.ligne.choix) as LigneChoix[];
  // The elements the design carries that no longer resolve: computed now, never stored (V-3).
  const r = resoudreChoix(db, universId, { coque: l.ligne.coque_cle, choix }, porteDe(l.ligne));
  const bloquantes = resultat.alertes.filter((a) => a.niveau === 'bloquante');
  const surveiller = resultat.alertes.filter((a) => a.niveau !== 'bloquante');
  const geree = etatGere(db, acteur, universId, l.section);
  return {
    ficheId: l.ligne.fiche_id, titre: l.titre, coque: resultat.coque, lignes: resultat.lignes, resultat,
    alertes: [...bloquantes, ...r.retirees, ...surveiller],
    version: l.ligne.version,
    perime: geree?.etat === 'perime',
    peutRecalculer: geree?.peutRecalculer === true,
    sectionId: l.section.id,
    sectionVersion: l.section.version,
    peutEcrire: peutEcrire(db, acteur, universId, l.role, l.section),
    lienFiche: `/univers/${universId}/fiches/${l.ligne.fiche_id}`,
  };
}

export function lireConception(db: Db, acteur: Acteur, universId: number, ficheId: number): VueConception {
  return vue(db, acteur, universId, lire(db, acteur, universId, ficheId));
}

export function listerConceptions(db: Db, acteur: Acteur, universId: number): ListeConceptions {
  const role = exigerRole(db, universId, acteur.compteId);
  if (!accessible(db, acteur, universId, OUTIL_VAISSEAUX)) throw introuvable();
  const lignes = db.prepare(`SELECT c.fiche_id FROM swn_conceptions c JOIN fiches f ON f.id = c.fiche_id
    WHERE c.univers_id = ? ORDER BY f.titre COLLATE NOCASE, f.id`).all(universId) as { fiche_id: number }[];
  // The sources' version is the same for every design of a universe: computed once, not per row (R-8).
  const courante = versionSourceVaisseaux(db, universId);
  const conceptions: ConceptionListee[] = [];
  for (const { fiche_id } of lignes) {
    let l: Lue;
    try { l = lire(db, acteur, universId, fiche_id); } catch (e) {
      if (e instanceof ErreurService && e.code === 'introuvable') continue;
      throw e;
    }
    const r = JSON.parse(l.ligne.resultat) as ResultatVaisseau;
    // Same count as the workshop view: the retired elements are blocking alerts computed now (V-3, B-75).
    const retirees = resoudreChoix(db, universId, { coque: l.ligne.coque_cle, choix: JSON.parse(l.ligne.choix) as LigneChoix[] }, porteDe(l.ligne)).retirees;
    const auteur = l.section.auteur_id === null ? null
      : db.prepare('SELECT id, username AS nom FROM comptes WHERE id = ?').get(l.section.auteur_id) as { id: number; nom: string } | undefined ?? null;
    conceptions.push({
      ficheId: fiche_id, titre: l.titre, coque: r.coque, prix: r.prix,
      perime: l.section.source_version !== courante,
      bloquantes: r.alertes.filter((a) => a.niveau === 'bloquante').length + retirees.length,
      aSurveiller: r.alertes.filter((a) => a.niveau !== 'bloquante').length,
      auteur, peutEcrire: peutEcrire(db, acteur, universId, role, l.section),
    });
  }
  const peutCreer = peutUsage(db, acteur, universId, OUTIL_VAISSEAUX, 'creer');
  if (!peutCreer) return { conceptions, peutCreer };
  const sans = db.prepare(`SELECT id AS ficheId, titre FROM fiches WHERE univers_id = ? AND type = 'vaisseau'
    AND id NOT IN (SELECT fiche_id FROM swn_conceptions) ORDER BY titre COLLATE NOCASE, id`).all(universId) as { ficheId: number; titre: string }[];
  return { conceptions, peutCreer, fichesSansConception: sans };
}

function charger(db: Db, universId: number, e: EntreeCalcul, porte: Porte | null) {
  const r = resoudreChoix(db, universId, e, porte);
  if (r.inconnu) {
    throw new ErreurService('invalide', "Cet élément n'est pas disponible.", 'element_indisponible', r.inconnu.champ);
  }
  const s = { ...calculerResolu(db, universId, r), equipage: r.equipage };
  if (s.resultat === null) throw new ErreurConceptionBloquee(s.alertes);
  if (s.alertes.some((a) => a.niveau === 'bloquante')) throw new ErreurConceptionBloquee(s.alertes);
  const charge: ChargeConception = { coque: e.coque, lignes: e.choix, resultat: s.resultat,
    versionReglages: versionsSource(db, universId).reglages, versionCatalogue: versionsSource(db, universId).catalogue,
    equipage: s.equipage };
  return charge;
}

export function creerConception(db: Db, acteur: Acteur, universId: number,
  entree: { ficheId: number; coque: string; auteurId?: number | null }): VueConception {
  exigerRole(db, universId, acteur.compteId);
  if (!accessible(db, acteur, universId, OUTIL_VAISSEAUX)) throw introuvable();
  if (!peutUsage(db, acteur, universId, OUTIL_VAISSEAUX, 'creer')) throw refuse();
  const fiche = chargerFiche(db, universId, entree.ficheId);
  if (fiche.type !== 'vaisseau') throw invalide('Cette fiche n\'est pas un vaisseau.');
  const { coque } = validerChoix(entree.coque, []);
  return db.transaction(() => {
    if (ligneDe(db, fiche.id)) throw new ErreurService('conflit', 'Cette fiche a déjà une conception.', 'deja_concue');
    const charge = charger(db, universId, { coque, choix: [] }, null);
    poserSectionGeree(db, acteur.compteId, universId, {
      ficheId: fiche.id, outil: OUTIL_VAISSEAUX, type: TYPE_CARACTERISTIQUES,
      audience: { auteurId: entree.auteurId ?? null, auteurLit: true, auteurEcrit: true },
      contenu: texteVaisseau(charge.resultat), sourceVersion: versionSourceVaisseaux(db, universId), charge,
    });
    return lireConception(db, acteur, universId, fiche.id);
  })();
}

export function enregistrerConception(db: Db, acteur: Acteur, universId: number, ficheId: number,
  entree: { coque: unknown; choix: unknown; version: unknown; equipage?: unknown }): VueConception {
  const l = lire(db, acteur, universId, ficheId);
  if (!peutEcrire(db, acteur, universId, l.role, l.section)) throw refuse('Vous ne pouvez pas modifier cette conception.');
  const e = validerChoix(entree?.coque, entree?.choix);
  const equipage = validerEquipage(entree?.equipage);
  if (equipage !== undefined) e.equipage = equipage;
  if (!Number.isInteger(entree.version) || (entree.version as number) < 1) throw invalide('La version lue est requise.');
  return db.transaction(() => {
    const cur = lire(db, acteur, universId, ficheId);
    if (cur.ligne.version !== entree.version) {
      throw new ErreurService('conflit', "Cette conception a changé depuis que vous l'avez ouverte.", 'donnee_modifiee');
    }
    const charge = charger(db, universId, e, porteDe(cur.ligne));
    poserSectionGeree(db, acteur.compteId, universId, {
      ficheId, outil: OUTIL_VAISSEAUX, type: TYPE_CARACTERISTIQUES, sectionId: cur.section.id,
      contenu: texteVaisseau(charge.resultat), sourceVersion: versionSourceVaisseaux(db, universId),
      version: cur.section.version, charge,
    });
    return lireConception(db, acteur, universId, ficheId);
  })();
}

/**
 * `POST calcul` (V-8): nothing is written. With `ficheId`, the design's masked elements still resolve (V-3), once the
 * design is readable under both guards; an unreadable or unknown one is `introuvable`.
 */
export function calculerConception(db: Db, acteur: Acteur, universId: number, entree: unknown) {
  const o = (entree ?? {}) as { coque?: unknown; choix?: unknown; ficheId?: unknown; equipage?: unknown };
  let porte: Porte | null = null;
  if (o.ficheId !== undefined && o.ficheId !== null) {
    if (!Number.isInteger(o.ficheId)) throw new ErreurService('invalide', 'Fiche invalide.', 'fiche_invalide', 'ficheId');
    porte = porteDe(lire(db, acteur, universId, o.ficheId as number).ligne);
  }
  return calculerDepuisChoix(db, acteur, universId, { coque: o.coque, choix: o.choix, equipage: o.equipage }, porte);
}

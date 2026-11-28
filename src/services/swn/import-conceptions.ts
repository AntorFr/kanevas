import type { Db } from '../../db/db.js';
import { ErreurService } from '../erreurs.js';
import { resoudreFiche } from '../cles.js';
import { assurerFiche } from '../import-fiches.js';
import { cleValide } from '../import.js';
import type { Issue } from '../lots.js';
import type { JetonRequete } from '../jetons.js';
import { changerAudience } from '../sections.js';
import type { Acteur } from '../types.js';
import {
  calculerResolu, ciblesDeLigne, controlerChoix, integreLu, ligneAEnregistrer, OUTIL_VAISSEAUX, resoudreChoix, validerChoix,
  validerEquipage, validerModIntCon, validerEffectif, validerReparation, type EntreeCalcul, type LigneChoix, type Porte,
} from './calcul-vaisseau.js';
import { integreValide } from './catalogue-vaisseaux.js';
import { creerConception, enregistrerConception } from './conceptions.js';
import { ligneDe, porteDe } from './section-vaisseaux.js';

/**
 * Import of ship designs by the API (I-1 to I-3): the designer's own write functions, as the token's account — one rule, two
 * doors. The import has no rule of its own about numbers: validators and calculation are the screen's. Nothing is counted in a
 * batch here (the route does, I-1).
 */

export const MAX_CONCEPTIONS = 500;
const MAX_REFUS = 1000;
const MAX_LIGNES = 100;

export interface Compteurs { creees: number; mises_a_jour: number; inchangees: number; refusees: number }
export interface RefusConception { cle: string; champ: string; raison: string }
export interface RapportConceptions {
  natures: { conceptions: Compteurs };
  refus: RefusConception[];
  refusTotal: number;
}

const invalideCorps = (champ: string, message: string) => new ErreurService('invalide', message, undefined, champ);
const objet = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const CHAMPS = ['cle', 'titre', 'coque', 'choix', 'visibilite', 'equipage', 'reparation', 'pj', 'robots', 'mod_int_con'];
const CHAMPS_LIGNE = ['nature', 'cle', 'quantite', 'magasins', 'points', 'cibles', 'integre'];

/** The request as a whole: a shape or a size that is wrong makes the whole request `invalide`, before any write. */
function lireFichier(corps: unknown): unknown[] {
  if (!objet(corps)) throw invalideCorps('corps', 'Le corps doit être un objet.');
  for (const k of Object.keys(corps)) if (k !== 'conceptions') throw invalideCorps(k, `Champ inconnu : ${k}.`);
  const v = corps.conceptions;
  if (v === undefined) return [];
  if (!Array.isArray(v)) throw invalideCorps('conceptions', 'conceptions : une liste est attendue.');
  if (v.length > MAX_CONCEPTIONS) throw invalideCorps('conceptions', `conceptions : ${MAX_CONCEPTIONS} éléments au plus.`);
  return v;
}

/** A refusal of one item alone, with the field it names (relative to the item). */
class Refus extends Error {
  constructor(readonly champ: string | undefined, readonly raison: string) { super(raison); }
}

interface Voulue {
  cle: string; titre: string; entree: EntreeCalcul; joueurs: boolean;
  equipage: number | undefined; reparation: number; pj: number; robots: number; modIntCon: number;
}

/** Runs a validator of the designer and turns its refusal into that of the field it came from. */
function valider<T>(champ: string, f: () => T): T {
  try { return f(); } catch (e) {
    if (e instanceof ErreurService && e.code === 'invalide') throw new Refus(champ, e.message);
    throw e;
  }
}

/** Checks the shape of one item; a wrong one is the refusal of that item alone. */
function lireItem(brut: unknown): Voulue {
  if (!objet(brut)) throw new Refus(undefined, 'Une conception est un objet.');
  const inconnu = Object.keys(brut).find((k) => !CHAMPS.includes(k));
  if (inconnu) throw new Refus(inconnu, 'Champ inconnu.');
  // A key of digits only would read as an id (AD-146): the sheet needs a letter in its key.
  if (typeof brut.cle !== 'string' || !cleValide(brut.cle) || !/\p{L}/u.test(brut.cle)) throw new Refus('cle', 'Clé invalide.');
  if (typeof brut.titre !== 'string' || brut.titre.trim().length < 1 || brut.titre.length > 120) throw new Refus('titre', 'Titre : de 1 à 120 caractères.');
  if (typeof brut.coque !== 'string' || brut.coque.length < 1 || brut.coque.length > 64) throw new Refus('coque', 'Coque invalide.');
  if (brut.visibilite !== undefined && brut.visibilite !== 'joueurs' && brut.visibilite !== 'mj') throw new Refus('visibilite', 'Visibilité : joueurs ou mj.');
  if (!Array.isArray(brut.choix)) throw new Refus('choix', 'choix : une liste est attendue.');
  if (brut.choix.length > MAX_LIGNES) throw new Refus('choix', `choix : ${MAX_LIGNES} lignes au plus.`);
  const coque = brut.coque;
  const vus = new Set<string>();
  const choix = brut.choix.map((l: unknown, j): LigneChoix => {
    const ch = `choix[${j}]`;
    if (!objet(l)) throw new Refus(ch, 'Une ligne est un objet.');
    const autre = Object.keys(l).find((k) => !CHAMPS_LIGNE.includes(k));
    if (autre) throw new Refus(`${ch}.${autre}`, 'Champ inconnu.');
    if (typeof l.cle !== 'string' || l.cle.length < 1 || l.cle.length > 64) throw new Refus(`${ch}.cle`, 'Clé invalide.');
    if (!Number.isInteger(l.quantite) || (l.quantite as number) < 1 || (l.quantite as number) > 99) throw new Refus(`${ch}.quantite`, 'Quantité : de 1 à 99.');
    // Everything else about the line is the designer's own validator, one field at a time for the field named.
    const seule = (extra: Record<string, unknown>) => validerChoix(coque, [{ ...l, ...extra }]).choix[0]!;
    if (l.cibles !== undefined) {
      if (!Array.isArray(l.cibles)) throw new Refus(`${ch}.cibles`, 'Cibles invalides.');
      l.cibles.forEach((c: unknown, k) => valider(`${ch}.cibles[${k}]`, () => seule({ cibles: [c] })));
    }
    if (l.integre !== undefined && !integreValide(l)) throw new Refus(`${ch}.integre`, 'Mods intégrés invalides.');
    valider(`${ch}.nature`, () => seule({ cibles: undefined, integre: undefined, magasins: undefined, points: undefined }));
    if (l.magasins !== undefined) valider(`${ch}.magasins`, () => seule({ cibles: undefined, integre: undefined, points: undefined }));
    if (l.points !== undefined) valider(`${ch}.points`, () => seule({ cibles: undefined, integre: undefined, magasins: undefined }));
    const ligne = valider(ch, () => seule({}));
    const k = JSON.stringify([ligne.nature, ligne.cle]);
    if (vus.has(k)) throw new Refus(ch, "Un élément ne peut figurer qu'une fois.");
    vus.add(k);
    return ligne;
  });
  const equipage = valider('equipage', () => validerEquipage(brut.equipage));
  const reparation = valider('reparation', () => validerReparation(brut.reparation)) ?? 0;
  const pj = valider('pj', () => validerEffectif(brut.pj, 'pj')) ?? 0;
  const robots = valider('robots', () => validerEffectif(brut.robots, 'robots')) ?? 0;
  const modIntCon = valider('mod_int_con', () => validerModIntCon(brut.mod_int_con)) ?? 0;
  return {
    cle: brut.cle, titre: brut.titre, joueurs: brut.visibilite === 'joueurs', equipage, reparation, pj, robots, modIntCon,
    entree: { coque, choix, ...(equipage === undefined ? {} : { equipage }), reparation, pj, robots, modIntCon },
  };
}

/** The line as the screen saves it, in a form where only meaning is left: order of keys and of pairs, absent = 0. */
function canonLigne(l: LigneChoix, effet: string | undefined): string {
  const e = ligneAEnregistrer(l, effet);
  const cibles = ciblesDeLigne({ quantite: e.quantite, ...(e.vise ? { vise: e.vise } : {}), ...(e.cibles ? { cibles: e.cibles } : {}) }, effet)
    ?.map((c) => JSON.stringify([c.nature, c.cle, c.quantite])).sort() ?? [];
  return JSON.stringify([e.nature, e.cle, e.quantite, e.magasins ?? 0, e.points ?? 0,
    e.nature === 'modifications' ? integreLu({ integre: e.integre, quantite: e.quantite }) : 0, cibles, e.vise ? [e.vise.nature, e.vise.cle] : null]);
}

/** The fingerprint of a design: hull, lines as a set, and the inputs — order of the file never changes equality (I-3). */
function empreinte(coque: string, choix: LigneChoix[], effets: Map<string, string | undefined>,
  entrees: { equipage: number | null; reparation: number; pj: number; robots: number; modIntCon: number }): string {
  const lignes = choix.map((l) => canonLigne(l, effets.get(JSON.stringify([l.nature, l.cle])))).sort();
  return JSON.stringify([coque, lignes, entrees.equipage, entrees.reparation, entrees.pj, entrees.robots, entrees.modIntCon]);
}

/** The token the sheet door needs; without a real one (a call from a service), the acteur's account alone is read. */
function jetonDe(acteur: Acteur, universId: number, jeton?: JetonRequete): JetonRequete {
  if (jeton) return jeton;
  return { id: null as unknown as number, universId, compteId: acteur.compteId, outils: [OUTIL_VAISSEAUX] } as unknown as JetonRequete;
}

/** Refusal fields of the designer's validators, brought back to the item's own field names. */
const CHAMP_LIGNE = new Set(['cibles', 'points', 'vise', 'integre']);

/**
 * Applies the file in one transaction, as the account of the token. An item is fully checked, calculation included, before it
 * creates anything: a refused item leaves no sheet behind. The catalogue is pushed first.
 */
export function importerConceptions(db: Db, acteur: Acteur, universId: number, corps: unknown, jeton?: JetonRequete): RapportConceptions {
  const items = lireFichier(corps);
  const j = jetonDe(acteur, universId, jeton);
  return db.transaction(() => {
    const compteurs: Compteurs = { creees: 0, mises_a_jour: 0, inchangees: 0, refusees: 0 };
    const refus: RefusConception[] = [];
    let refusTotal = 0;
    const refuser = (i: number, cle: string, champ: string | undefined, raison: string) => {
      compteurs.refusees++;
      refusTotal++;
      if (refus.length < MAX_REFUS) refus.push({ cle, champ: champ ? `conceptions[${i}].${champ}` : `conceptions[${i}]`, raison });
    };
    const vues = new Set<string>();
    items.forEach((brut, i) => {
      const cle = objet(brut) && typeof brut.cle === 'string' ? brut.cle : '';
      let issue: Issue;
      try {
        const v = lireItem(brut);
        if (vues.has(v.cle)) throw new Refus('cle', 'Clé en double dans le fichier.');
        vues.add(v.cle);
        // A savepoint per item: whatever it wrote before a refusal is undone.
        issue = db.transaction(() => appliquerItem(db, acteur, j, universId, v))();
      } catch (e) {
        if (e instanceof Refus) return refuser(i, cle, e.champ, e.raison);
        if (e instanceof ErreurService && (e.code === 'invalide' || e.code === 'conflit')) {
          const champ = e.detail === 'conception_bloquee' || e.detail === 'element_indisponible' || (e.champ && CHAMP_LIGNE.has(e.champ)) ? 'choix' : e.champ;
          return refuser(i, cle, champ, e.message);
        }
        throw e;
      }
      compteurs[issue]++;
    });
    return { natures: { conceptions: compteurs }, refus, refusTotal };
  })();
}

function appliquerItem(db: Db, acteur: Acteur, jeton: JetonRequete, universId: number, v: Voulue): Issue {
  const atteinte = resoudreFiche(db, universId, v.cle);
  const fiche = atteinte ? db.prepare('SELECT id, type FROM fiches WHERE id = ?').get(atteinte.id) as { id: number; type: string } : undefined;
  if (fiche && fiche.type !== 'vaisseau') throw new Refus('cle', "La clé désigne une fiche qui n'est pas un vaisseau.");
  const ligne = fiche ? ligneDe(db, fiche.id) : undefined;
  const porte: Porte | null = ligne ? porteDe(ligne) : null;

  // Resolution first (V-3: an element the design already carries may be masked, a new one may not).
  const r = resoudreChoix(db, universId, v.entree, porte);
  if (r.inconnu) {
    if (r.inconnu.champ === 'coque') throw new Refus('coque', `élément inconnu : coques/${v.entree.coque}`);
    const k = r.lignes.findIndex((l) => l === null);
    const l = v.entree.choix[k]!;
    throw new Refus(`choix[${k}].cle`, `élément inconnu : ${l.nature}/${l.cle}`);
  }

  if (ligne) {
    const effets = new Map(r.lignes.map((l, i) => [JSON.stringify([v.entree.choix[i]!.nature, v.entree.choix[i]!.cle]), l?.element.effet] as const));
    const voulu = empreinte(v.entree.coque, v.entree.choix, effets,
      { equipage: r.equipage, reparation: r.reparation, pj: r.pj, robots: r.robots, modIntCon: r.modIntCon });
    const stocke = empreinte(ligne.coque_cle, JSON.parse(ligne.choix) as LigneChoix[], effets,
      { equipage: ligne.equipage, reparation: ligne.reparation, pj: ligne.pj, robots: ligne.robots, modIntCon: ligne.mod_int_con });
    if (voulu === stocke) return 'inchangees';
  }

  // Then the checks of the save, before anything is created (I-2).
  controlerChoix(r, v.entree);
  const s = calculerResolu(db, universId, r);
  const bloquante = s.alertes.find((a) => a.niveau === 'bloquante');
  if (s.resultat === null || bloquante) throw new Refus('choix', (bloquante ?? s.alertes[0])?.texte ?? 'Conception bloquée.');

  const entree = { coque: v.entree.coque, choix: v.entree.choix, equipage: v.equipage, reparation: v.reparation, pj: v.pj, robots: v.robots, mod_int_con: v.modIntCon };
  if (ligne) {
    enregistrerConception(db, acteur, universId, fiche!.id, { ...entree, version: ligne.version });
    return 'mises_a_jour';
  }

  // The title is that of the creation only: an existing sheet keeps its own (AD-119).
  const ficheId = fiche?.id ?? assurerFiche(db, jeton, null, v.cle, { type: 'vaisseau', titre: v.titre }).id;
  let vue = creerConception(db, acteur, universId, { ficheId, coque: v.entree.coque, pj: v.pj, robots: v.robots, mod_int_con: v.modIntCon });
  if (v.entree.choix.length > 0 || v.equipage !== undefined || v.reparation > 0) {
    vue = enregistrerConception(db, acteur, universId, ficheId, { ...entree, version: vue.version });
  }
  if (v.joueurs) changerAudience(db, acteur.compteId, universId, ficheId, vue.sectionId, { joueursLisent: true });
  return 'creees';
}

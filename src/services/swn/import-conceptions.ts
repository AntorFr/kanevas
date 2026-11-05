import type { Db } from '../../db/db.js';
import { ErreurService } from '../erreurs.js';
import { assurerFiche } from '../import-fiches.js';
import { cleValide } from '../import.js';
import type { Jeton } from '../jetons.js';
import { changerAudience } from '../sections.js';
import type { Acteur } from '../types.js';
import { calculerResolu, resoudreChoix, OUTIL_VAISSEAUX, type LigneChoix } from './calcul-vaisseau.js';
import { NATURES_DE_LIGNE } from './catalogue-vaisseaux.js';
import { creerConception, enregistrerConception } from './conceptions.js';
import { ligneDe, porteDe } from './section-vaisseaux.js';

/**
 * Import of ship designs by the API (M-1 to M-5): the designer's own write functions, as the token's account — one rule, two
 * doors. Only this file writes `swn_conceptions.version_importee`, and only for the designs the import wrote (B-48).
 */

export const NATURES_CONCEPTIONS = [{ nom: 'conceptions', libelle: 'conception', libellePluriel: 'conceptions' }];
export const MAX_CONCEPTIONS = 500;
export const HORS_SYNCHRO = 'Modifié dans Kanevas depuis le dernier import.';
const MAX_REFUS = 1000;
const MAX_LIGNES = 100;

export interface Compteurs { creees: number; mises_a_jour: number; inchangees: number; refusees: number }
export interface RefusConception { cle: string; champ: string; raison: string }
export interface RapportConceptions {
  natures: { conceptions: Compteurs };
  refus: RefusConception[];
  refusTotal: number;
}
type Issue = keyof Compteurs;

const invalideCorps = (champ: string, message: string) => new ErreurService('invalide', message, undefined, champ);
const objet = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const CHAMPS = ['cle', 'titre', 'coque', 'choix', 'visibilite'];

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

/** The ordered key of a set of lines: the order of a file never changes equality (M-4). */
const empreinte = (coque: string, choix: LigneChoix[]) =>
  JSON.stringify([coque, choix.map((l) => [l.nature, l.cle, l.quantite]).sort((a, b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : 1)]);

class Refus extends Error {
  constructor(readonly champ: string | undefined, readonly raison: string) { super(raison); }
}

interface Voulue { cle: string; titre: string; coque: string; choix: LigneChoix[]; joueurs: boolean }

/** Checks the shape of one item; a wrong one is a refusal of that item alone. */
function lireItem(brut: unknown): Voulue {
  if (!objet(brut)) throw new Refus(undefined, 'Une conception est un objet.');
  const inconnu = Object.keys(brut).find((k) => !CHAMPS.includes(k));
  if (inconnu) throw new Refus(inconnu, 'Champ inconnu.');
  if (typeof brut.cle !== 'string' || !cleValide(brut.cle)) throw new Refus('cle', 'Clé invalide (minuscules, chiffres et tirets).');
  if (typeof brut.titre !== 'string' || brut.titre.trim().length < 1 || brut.titre.length > 120) throw new Refus('titre', 'Titre : de 1 à 120 caractères.');
  if (typeof brut.coque !== 'string' || brut.coque.length < 1 || brut.coque.length > 64) throw new Refus('coque', 'Coque invalide.');
  if (brut.visibilite !== undefined && brut.visibilite !== 'joueurs' && brut.visibilite !== 'mj') {
    throw new Refus('visibilite', 'Visibilité : joueurs ou mj.');
  }
  if (!Array.isArray(brut.choix)) throw new Refus('choix', 'choix : une liste est attendue.');
  if (brut.choix.length > MAX_LIGNES) throw new Refus('choix', `choix : ${MAX_LIGNES} lignes au plus.`);
  const vus = new Set<string>();
  const choix = brut.choix.map((l: unknown, j): LigneChoix => {
    if (!objet(l)) throw new Refus(`choix[${j}]`, 'Une ligne est un objet.');
    const autre = Object.keys(l).find((k) => !['nature', 'cle', 'quantite'].includes(k));
    if (autre) throw new Refus(`choix[${j}].${autre}`, 'Champ inconnu.');
    if (typeof l.nature !== 'string' || !(NATURES_DE_LIGNE as readonly string[]).includes(l.nature)) {
      throw new Refus(`choix[${j}].nature`, 'Nature inconnue.');
    }
    if (typeof l.cle !== 'string' || l.cle.length < 1 || l.cle.length > 64) throw new Refus(`choix[${j}].cle`, 'Clé invalide.');
    if (!Number.isInteger(l.quantite) || (l.quantite as number) < 1 || (l.quantite as number) > 99) {
      throw new Refus(`choix[${j}].quantite`, 'Quantité : de 1 à 99.');
    }
    const k = JSON.stringify([l.nature, l.cle]);
    if (vus.has(k)) throw new Refus(`choix[${j}]`, 'Un élément ne peut figurer qu\'une fois.');
    vus.add(k);
    return { nature: l.nature as LigneChoix['nature'], cle: l.cle, quantite: l.quantite as number };
  });
  return { cle: brut.cle, titre: brut.titre, coque: brut.coque, choix, joueurs: brut.visibilite === 'joueurs' };
}

/** The token the sheet door needs: only the universe and the account are read when no section and no batch are involved. */
const jetonDe = (acteur: Acteur, universId: number): Jeton => ({
  id: 0, universId, compteId: acteur.compteId, nom: '', creeLe: '', expireLe: '', revoqueLe: null, dernierUsageLe: null, outils: [OUTIL_VAISSEAUX],
});

/**
 * Applies the file in one transaction; nothing is counted anywhere (see `importerConceptionsParJeton`, which has the batch).
 * An item is fully checked, calculation included, before it creates anything.
 */
export function importerConceptions(db: Db, acteur: Acteur, universId: number, corps: unknown): RapportConceptions {
  const items = lireFichier(corps);
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
    const jeton = jetonDe(acteur, universId);
    items.forEach((brut, i) => {
      const cle = objet(brut) && typeof brut.cle === 'string' ? brut.cle : '';
      let issue: Issue;
      try {
        const v = lireItem(brut);
        if (vues.has(v.cle)) throw new Refus('cle', 'Clé en double dans le fichier.');
        vues.add(v.cle);
        issue = db.transaction(() => appliquerItem(db, acteur, jeton, universId, v))();
      } catch (e) {
        if (e instanceof Refus) return refuser(i, cle, e.champ, e.raison);
        if (e instanceof ErreurService && (e.code === 'invalide' || e.code === 'conflit')) {
          return refuser(i, cle, e.detail === 'conception_bloquee' ? 'choix' : e.champ, e.message);
        }
        throw e;
      }
      compteurs[issue]++;
    });
    return { natures: { conceptions: compteurs }, refus, refusTotal };
  })();
}

function appliquerItem(db: Db, acteur: Acteur, jeton: Jeton, universId: number, v: Voulue): Issue {
  const fiche = db.prepare('SELECT id, type FROM fiches WHERE univers_id = ? AND cle_origine = ?').get(universId, v.cle) as
    { id: number; type: string } | undefined;
  if (fiche && fiche.type !== 'vaisseau') throw new Refus('cle', "La clé désigne une fiche qui n'est pas un vaisseau.");
  const ligne = fiche ? ligneDe(db, fiche.id) as (ReturnType<typeof ligneDe> & { version_importee: number | null }) | undefined : undefined;

  if (ligne) {
    const stockees = JSON.parse(ligne.choix) as LigneChoix[];
    if (empreinte(ligne.coque_cle, stockees) === empreinte(v.coque, v.choix)) return 'inchangees';
  }

  // Resolution and calculation first: a refused item leaves nothing behind (M-3).
  const r = resoudreChoix(db, universId, { coque: v.coque, choix: v.choix }, ligne ? porteDe(ligne) : null);
  if (!r.coque) throw new Refus('coque', `élément inconnu : coques/${v.coque}`);
  const j = r.lignes.findIndex((l) => l === null);
  if (j >= 0) throw new Refus(`choix[${j}].cle`, `élément inconnu : ${v.choix[j]!.nature}/${v.choix[j]!.cle}`);
  const alerte = calculerResolu(db, universId, r).alertes.find((a) => a.niveau === 'bloquante');
  if (alerte) throw new Refus('choix', alerte.texte);

  if (ligne) {
    if (ligne.version !== ligne.version_importee) throw new ErreurService('conflit', HORS_SYNCHRO, 'hors_synchro');
    const vue = enregistrerConception(db, acteur, universId, fiche!.id, { coque: v.coque, choix: v.choix, version: ligne.version });
    db.prepare('UPDATE swn_conceptions SET version_importee = ? WHERE fiche_id = ?').run(vue.version, fiche!.id);
    return 'mises_a_jour';
  }

  // A missing design: on the sheet of that key, created by the sheet door when it is missing (M-2).
  const ficheId = fiche?.id ?? assurerFiche(db, jeton, null, v.cle, { type: 'vaisseau', titre: v.titre }).id;
  let vue = creerConception(db, acteur, universId, { ficheId, coque: v.coque });
  if (v.choix.length > 0) vue = enregistrerConception(db, acteur, universId, ficheId, { coque: v.coque, choix: v.choix, version: vue.version });
  if (v.joueurs) changerAudience(db, acteur.compteId, universId, ficheId, vue.sectionId, { joueursLisent: true });
  db.prepare('UPDATE swn_conceptions SET version_importee = ? WHERE fiche_id = ?').run(vue.version, ficheId);
  return 'creees';
}

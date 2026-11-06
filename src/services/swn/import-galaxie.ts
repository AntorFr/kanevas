import type { Db } from '../../db/db.js';
import { ErreurService } from '../erreurs.js';
import type { Acteur } from '../types.js';
import type { Issue } from '../lots.js';
import {
  apresEcriture, booleenImport, dessinerZone, modifierRoute, modifierSysteme, modifierZone, normaliserSysteme, typeLienValide,
  normaliserZone, placerSysteme, routesDeSysteme, sansSignal, tracerRoute,
} from './ecriture-carte.js';
import { exigerEcritureGalaxie, exigerMJOutil, OUTIL_GALAXIE, type LigneRoute, type LigneSysteme, type LigneZone } from './galaxies.js';

/**
 * Import of a galaxy by the API (T-9): the same write functions as the screen, one rule and two doors, acting as the
 * token's account. Only this file writes `version_importee`, and only for the rows the import wrote (B-48).
 */

export const NATURES_GALAXIE = [
  { nom: 'systemes', libelle: 'système', libellePluriel: 'systèmes' },
  { nom: 'zones', libelle: 'territoire', libellePluriel: 'territoires' },
  { nom: 'routes', libelle: 'route', libellePluriel: 'routes' },
];

export const MAX_SYSTEMES = 2000, MAX_ZONES = 500, MAX_ROUTES = 4000;
const CLE = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const HORS_SYNCHRO = 'Modifié dans Kanevas depuis le dernier import.';

type Nature = 'systemes' | 'zones' | 'routes';
export interface RefusGalaxie { nature: Nature; cle: string; champ: string; raison: string }
export interface Compteurs { creees: number; mises_a_jour: number; inchangees: number; refusees: number }
export interface RapportGalaxie {
  galaxie: number;
  natures: Record<Nature, Compteurs>;
  refus: RefusGalaxie[];
  refusTotal: number;
}

const MAX_REFUS = 1000;
const invalideCorps = (champ: string, message: string) => new ErreurService('invalide', message, undefined, champ);
const objet = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/** The galaxies a script can target: `{id, titre}`, GM only. */
export function listerGalaxiesImport(db: Db, compteId: number, universId: number): { id: number; titre: string }[] {
  exigerMJOutil(db, compteId, universId);
  return db.prepare('SELECT id, titre FROM swn_galaxies WHERE univers_id = ? ORDER BY id').all(universId) as { id: number; titre: string }[];
}

interface Fichier { systemes: unknown[]; zones: unknown[]; routes: unknown[] }

/** The request as a whole: a shape or a size that is wrong makes the whole request `invalide`, before any write. */
function lireFichier(corps: unknown): Fichier {
  if (!objet(corps)) throw invalideCorps('corps', 'Le corps doit être un objet.');
  for (const k of Object.keys(corps)) {
    if (!['systemes', 'zones', 'routes'].includes(k)) throw invalideCorps(k, `Champ inconnu : ${k}.`);
  }
  const liste = (k: Nature, max: number): unknown[] => {
    const v = corps[k];
    if (v === undefined) return [];
    if (!Array.isArray(v)) throw invalideCorps(k, `${k} : une liste est attendue.`);
    if (v.length > max) throw invalideCorps(k, `${k} : ${max} éléments au plus.`);
    return v;
  };
  return { systemes: liste('systemes', MAX_SYSTEMES), zones: liste('zones', MAX_ZONES), routes: liste('routes', MAX_ROUTES) };
}

const CHAMPS_SYSTEME = ['cle', 'nom', 'q', 'r', 'taille', 'couleur', 'notes', 'secret'];
const CHAMPS_ZONE = ['cle', 'nom', 'contour', 'couleur', 'densite', 'secret'];
const CHAMPS_ROUTE = ['depuis', 'vers', 'publique', 'type_lien'];

function champInconnu(item: Record<string, unknown>, permis: string[]): string | null {
  return Object.keys(item).find((k) => !permis.includes(k)) ?? null;
}

/** Applies the file to the galaxy, in one transaction; nothing is counted anywhere (see `importerGalaxieParJeton`, in `import-galaxie-lot.ts`: it needs the batches, which load the tool registry). */
export function importerGalaxie(db: Db, acteur: Acteur, universId: number, galaxieId: number, corps: unknown): RapportGalaxie {
  const fichier = lireFichier(corps);
  return db.transaction(() => {
    const g = exigerEcritureGalaxie(db, acteur, universId, galaxieId);
    const natures: Record<Nature, Compteurs> = {
      systemes: { creees: 0, mises_a_jour: 0, inchangees: 0, refusees: 0 },
      zones: { creees: 0, mises_a_jour: 0, inchangees: 0, refusees: 0 },
      routes: { creees: 0, mises_a_jour: 0, inchangees: 0, refusees: 0 },
    };
    const refus: RefusGalaxie[] = [];
    let refusTotal = 0;
    const refuser = (nature: Nature, i: number, cle: string, champ: string | undefined, raison: string) => {
      natures[nature].refusees++;
      refusTotal++;
      if (refus.length < MAX_REFUS) refus.push({ nature, cle, champ: champ ? `${nature}[${i}].${champ}` : `${nature}[${i}]`, raison });
    };
    /** Runs one item in its own savepoint: a service refusal undoes the item alone and is counted. */
    const item = (nature: Nature, i: number, cle: string, corpsItem: () => Issue) => {
      try {
        natures[nature][db.transaction(corpsItem)()]++;
      } catch (e) {
        if (!(e instanceof ErreurService) || (e.code !== 'invalide' && e.code !== 'conflit')) throw e;
        refuser(nature, i, cle, e.detail === 'case_occupee' ? 'q' : e.champ, e.message);
      }
    };

    const { modifie } = sansSignal(() => {
      // Systems.
      const vues = new Set<string>();
      const deplacees = new Set<number>(); // routes whose length a move rewrote in this request
      fichier.systemes.forEach((brut, i) => {
        const cle = objet(brut) && typeof brut.cle === 'string' ? brut.cle : '';
        if (!objet(brut)) return refuser('systemes', i, cle, undefined, 'Un système est un objet.');
        const inconnu = champInconnu(brut, CHAMPS_SYSTEME);
        if (inconnu) return refuser('systemes', i, cle, inconnu, 'Champ inconnu.');
        if (!CLE.test(cle)) return refuser('systemes', i, cle, 'cle', 'Clé invalide (minuscules, chiffres et tirets).');
        if (vues.has(cle)) return refuser('systemes', i, cle, 'cle', 'Clé en double dans le fichier.');
        vues.add(cle);
        item('systemes', i, cle, () => {
          const v = normaliserSysteme(brut);
          const ligne = db.prepare('SELECT * FROM swn_systemes WHERE galaxie_id = ? AND cle = ?').get(g.id, cle) as
            (LigneSysteme & { version_importee: number | null }) | undefined;
          if (!ligne) {
            const { id } = placerSysteme(db, acteur, universId, g.id, v, { cle });
            db.prepare('UPDATE swn_systemes SET version_importee = version WHERE id = ?').run(id);
            return 'creees';
          }
          const egal = ligne.nom === v.nom && ligne.q === v.q && ligne.r === v.r && ligne.taille === v.taille
            && ligne.couleur === v.couleur && ligne.notes === v.notes && (ligne.secret === 1) === v.secret;
          if (egal) return 'inchangees';
          if (ligne.version !== ligne.version_importee) throw new ErreurService('conflit', HORS_SYNCHRO, 'hors_synchro');
          const enPas = routesDeSysteme(db, ligne.id).filter((r) => r.version === r.version_importee).map((r) => r.id);
          const touchees = routesDeSysteme(db, ligne.id).map((r) => r.id);
          const { version } = modifierSysteme(db, acteur, universId, g.id, cle, { ...v, version: ligne.version });
          db.prepare('UPDATE swn_systemes SET version_importee = ? WHERE id = ?').run(version, ligne.id);
          if (ligne.q !== v.q || ligne.r !== v.r) {
            for (const id of touchees) deplacees.add(id);
            for (const id of enPas) db.prepare('UPDATE swn_routes SET version_importee = version WHERE id = ?').run(id);
          }
          return 'mises_a_jour';
        });
      });

      // Zones.
      const zonesVues = new Set<string>();
      fichier.zones.forEach((brut, i) => {
        const cle = objet(brut) && typeof brut.cle === 'string' ? brut.cle : '';
        if (!objet(brut)) return refuser('zones', i, cle, undefined, 'Un territoire est un objet.');
        const inconnu = champInconnu(brut, CHAMPS_ZONE);
        if (inconnu) return refuser('zones', i, cle, inconnu, 'Champ inconnu.');
        if (!CLE.test(cle)) return refuser('zones', i, cle, 'cle', 'Clé invalide (minuscules, chiffres et tirets).');
        if (zonesVues.has(cle)) return refuser('zones', i, cle, 'cle', 'Clé en double dans le fichier.');
        zonesVues.add(cle);
        item('zones', i, cle, () => {
          const v = normaliserZone(brut);
          const ligne = db.prepare('SELECT * FROM swn_zones WHERE galaxie_id = ? AND cle = ?').get(g.id, cle) as
            (LigneZone & { version_importee: number | null }) | undefined;
          if (!ligne) {
            const { id } = dessinerZone(db, acteur, universId, g.id, v, { cle });
            db.prepare('UPDATE swn_zones SET version_importee = version WHERE id = ?').run(id);
            return 'creees';
          }
          const egal = ligne.nom === v.nom && JSON.stringify(JSON.parse(ligne.contour)) === JSON.stringify(v.contour)
            && ligne.couleur === v.couleur && ligne.densite === v.densite && (ligne.secret === 1) === v.secret;
          if (egal) return 'inchangees';
          if (ligne.version !== ligne.version_importee) throw new ErreurService('conflit', HORS_SYNCHRO, 'hors_synchro');
          const { version } = modifierZone(db, acteur, universId, g.id, cle, { ...v, version: ligne.version });
          db.prepare('UPDATE swn_zones SET version_importee = ? WHERE id = ?').run(version, ligne.id);
          return 'mises_a_jour';
        });
      });

      // Routes, by the unordered pair of keys; the ends are the systems of the galaxy once the file's are applied.
      const paires = new Set<string>();
      fichier.routes.forEach((brut, i) => {
        if (!objet(brut)) return refuser('routes', i, '', undefined, 'Une route est un objet.');
        const depuis = typeof brut.depuis === 'string' ? brut.depuis : '', vers = typeof brut.vers === 'string' ? brut.vers : '';
        const cle = `${depuis}>${vers}`;
        if (Object.hasOwn(brut, 'longueur')) return refuser('routes', i, cle, 'longueur', 'La longueur est calculée.');
        const inconnu = champInconnu(brut, CHAMPS_ROUTE);
        if (inconnu) return refuser('routes', i, cle, inconnu, 'Champ inconnu.');
        const bout = (champ: 'depuis' | 'vers', cleSys: string) =>
          db.prepare('SELECT id FROM swn_systemes WHERE galaxie_id = ? AND cle = ?').get(g.id, cleSys) as { id: number } | undefined;
        const d = bout('depuis', depuis);
        if (!d) return refuser('routes', i, cle, 'depuis', 'Système inconnu.');
        const v = bout('vers', vers);
        if (!v) return refuser('routes', i, cle, 'vers', 'Système inconnu.');
        if (d.id === v.id) return refuser('routes', i, cle, 'vers', 'Les deux extrémités doivent différer.');
        const paire = d.id < v.id ? `${d.id}:${v.id}` : `${v.id}:${d.id}`;
        if (paires.has(paire)) return refuser('routes', i, cle, 'vers', 'Route en double dans le fichier.');
        paires.add(paire);
        item('routes', i, cle, () => {
          const publique = Object.hasOwn(brut, 'publique') && brut.publique !== undefined ? booleenImport('publique', brut.publique) : true;
          const typeLien = Object.hasOwn(brut, 'type_lien') && brut.type_lien !== undefined && brut.type_lien !== null
            ? typeLienValide(brut.type_lien) : null;
          const ligne = db.prepare(`SELECT * FROM swn_routes WHERE (depuis_id = ? AND vers_id = ?) OR (depuis_id = ? AND vers_id = ?)`)
            .get(d.id, v.id, v.id, d.id) as (LigneRoute & { version_importee: number | null }) | undefined;
          if (!ligne) {
            const { id } = tracerRoute(db, acteur, universId, g.id, { depuis, vers, publique, ...(typeLien === null ? {} : { type_lien: typeLien }) });
            db.prepare('UPDATE swn_routes SET version_importee = version WHERE id = ?').run(id);
            return 'creees';
          }
          if ((ligne.publique === 1) === publique && ligne.type_lien === typeLien) return deplacees.has(ligne.id) ? 'mises_a_jour' : 'inchangees';
          if (ligne.version !== ligne.version_importee) throw new ErreurService('conflit', HORS_SYNCHRO, 'hors_synchro');
          const { version } = modifierRoute(db, acteur, universId, g.id, ligne.id, { publique, type_lien: typeLien, version: ligne.version });
          db.prepare('UPDATE swn_routes SET version_importee = ? WHERE id = ?').run(version, ligne.id);
          return 'mises_a_jour';
        });
      });
    });
    // The document's recalculation proposal, once for the request (T-7).
    if (modifie) apresEcriture(db, acteur.compteId, universId);
    return { galaxie: g.id, natures, refus, refusTotal };
  })();
}

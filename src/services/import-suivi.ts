import type { Db } from '../db/db.js';
import { assurerCampagne, campagneDeCle, MAX_NOM_CAMPAGNE, STATUTS_CAMPAGNE, type StatutCampagne } from './campagnes.js';
import { exigerMJ } from './droits.js';
import { ErreurService } from './erreurs.js';
import { cleValide, type ResultatSuiviImport } from './import.js';
import type { Jeton } from './jetons.js';
import { lireLot, noterDansLot, type Issue } from './lots.js';
import { assurerScenario, MAX_TITRE_SCENARIO } from './scenarios.js';
import { MAX_CONTENU_SECTION } from './sections.js';

const ISSUES: Record<ResultatSuiviImport['etat'], Issue> = {
  creee: 'creees', mise_a_jour: 'mises_a_jour', inchangee: 'inchangees',
};

function invalide(champ: string, raison: string): never {
  throw new ErreurService('invalide', raison, 'invalide', champ);
}

function corpsDe(corps: unknown): Record<string, unknown> {
  if (typeof corps !== 'object' || corps === null || Array.isArray(corps)) {
    return invalide('corps', 'corps de la requête : un objet est attendu');
  }
  return corps as Record<string, unknown>;
}

function titreDe(corps: Record<string, unknown>, champ: string, max: number): string {
  const brut = corps[champ];
  if (typeof brut !== 'string' || !brut.trim() || brut.trim().length > max) {
    return invalide(champ, `${champ} : de 1 à ${max} caractères`);
  }
  return brut.trim();
}

function verifierCle(cle: string, champ: string) {
  if (!cleValide(cle)) invalide(champ, "clé d'origine invalide");
}

/** One request is one transaction; a refusal is counted only after its writes rolled back. */
function dansLot(
  db: Db, jeton: Jeton, lotId: number | null, nature: 'campagnes' | 'scenarios', cle: string,
  maintenant: Date, ecrire: () => ResultatSuiviImport,
): ResultatSuiviImport {
  exigerMJ(db, jeton.universId, jeton.compteId);
  if (lotId !== null && lireLot(db, jeton, lotId, maintenant).closLe !== null) {
    throw new ErreurService('conflit', 'Le lot est clos.', 'lot_clos');
  }
  const objet = nature === 'campagnes' ? 'campagne' : 'scénario';
  try {
    return db.transaction(() => {
      const resultat = ecrire();
      if (lotId !== null) noterDansLot(db, lotId, nature, ISSUES[resultat.etat],
        resultat.avertissements.map((raison) => ({ cle, objet, raison, gravite: 'avertissement' })), maintenant);
      return resultat;
    })();
  } catch (e) {
    if (e instanceof ErreurService && (e.code === 'invalide' || e.detail === 'campagne_inconnue')) {
      if (lotId !== null) noterDansLot(db, lotId, nature, 'refusees',
        [{ cle, objet, raison: e.message, gravite: 'refus' }], maintenant);
    }
    throw e;
  }
}

export function importerCampagne(
  db: Db, jeton: Jeton, lotId: number | null, cle: string, corps: unknown, maintenant: Date = new Date(),
): ResultatSuiviImport {
  return dansLot(db, jeton, lotId, 'campagnes', cle, maintenant, () => {
    verifierCle(cle, 'cle');
    const c = corpsDe(corps);
    const nom = titreDe(c, 'nom', MAX_NOM_CAMPAGNE);
    const statut = c.statut === undefined ? 'en_preparation' : c.statut;
    if (typeof statut !== 'string' || !(STATUTS_CAMPAGNE as readonly string[]).includes(statut)) {
      return invalide('statut', 'statut inconnu');
    }
    return assurerCampagne(db, jeton.compteId, jeton.universId, cle, { nom, statut: statut as StatutCampagne });
  });
}

export function importerScenario(
  db: Db, jeton: Jeton, lotId: number | null, cle: string, scle: string, corps: unknown,
  maintenant: Date = new Date(),
): ResultatSuiviImport {
  return dansLot(db, jeton, lotId, 'scenarios', scle, maintenant, () => {
    verifierCle(cle, 'cle');
    verifierCle(scle, 'scle');
    const c = corpsDe(corps);
    const titre = titreDe(c, 'titre', MAX_TITRE_SCENARIO);
    if (typeof c.contenu !== 'string' || c.contenu.length > MAX_CONTENU_SECTION) {
      return invalide('contenu', 'contenu : 100 000 caractères au plus');
    }
    // Resolve under the token's universe BEFORE calling the campaign-scoped scenario functions (AD-47).
    const campagne = campagneDeCle(db, jeton.compteId, jeton.universId, cle);
    if (!campagne) throw new ErreurService('introuvable', `campagne inconnue : ${cle}`, 'campagne_inconnue');
    return assurerScenario(db, jeton.compteId, campagne.id, scle, { titre, contenu: c.contenu });
  });
}

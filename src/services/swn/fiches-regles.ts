import type { Db } from '../../db/db.js';
import { creerFiche } from '../fiches.js';
import { propositionEnAttente } from '../propositions.js';
import { poserSectionGeree } from '../sections-gerees.js';
import { lireSection } from '../sections.js';
import { exigerUsage } from '../outils.js';
import type { Acteur } from '../types.js';
import { OUTIL_VAISSEAUX } from './calcul-vaisseau.js';
import { NATURES_VAISSEAU, type NatureCatalogueVaisseau } from './catalogue-vaisseaux.js';
import { ligneGeneree, produireRegles, typeDe, versionSourceRegles } from './regles-hooks.js';

export { apresEcritureRegles, ligneGeneree, natureDe, produireRegles, typeDe, TYPES_REGLES, versionSourceRegles } from './regles-hooks.js';
export type { LigneFicheGeneree } from './regles-hooks.js';

const TITRES: Record<NatureCatalogueVaisseau, string> = {
  coques: 'Règles — Coques', moteurs: 'Règles — Moteurs', amenagements: 'Règles — Aménagements', defenses: 'Règles — Défenses',
  armes: 'Règles — Armes', modifications: 'Règles — Modifications', exemples: 'Exemples de vaisseaux',
};

export interface EtatFicheRegles {
  cle: string; libelle: string; ficheId: number | null; titre: string;
  etat: 'absente' | 'a_jour' | 'perimee'; propositionId: number | null;
}
export interface RapportGeneration {
  creees: number; misesAJour: number; inchangees: number;
  fiches: { cle: string; ficheId: number; sectionId: number; resultat: 'creee' | 'mise_a_jour' | 'inchangee' }[];
}

const acteurDe = (a: Acteur | number): Acteur => (typeof a === 'number' ? { compteId: a } : a);
/** GM only (usage `generer`): `introuvable` without a role or when the tool is not accessible, `refuse` otherwise (V-7). */
const exigerGenerer = (db: Db, acteur: Acteur, universId: number) => exigerUsage(db, acteur, universId, OUTIL_VAISSEAUX, 'generer');

/** The seven sheets, in the order of R-1: absent, up to date or stale (computed at each read), with the caller's proposal. */
export function etatFichesRegles(db: Db, acteurOuCompte: Acteur | number, universId: number): EtatFicheRegles[] {
  const acteur = acteurDe(acteurOuCompte);
  exigerGenerer(db, acteur, universId);
  return NATURES_VAISSEAU.map((nature) => {
    const cle = typeDe(nature);
    const ligne = ligneGeneree(db, universId, cle);
    const titre = TITRES[nature];
    if (!ligne) return { cle, libelle: titre, ficheId: null, titre, etat: 'absente' as const, propositionId: null };
    const perimee = versionSourceRegles(db, universId, cle) !== ligne.source_version;
    return {
      cle, libelle: titre, ficheId: ligne.fiche_id, titre, etat: perimee ? 'perimee' as const : 'a_jour' as const,
      propositionId: perimee ? propositionEnAttente(db, acteur.compteId, ligne.section_id) : null,
    };
  });
}

/** « Générer les fiches de règles… » (R-6): one transaction, through `creerFiche` and `poserSectionGeree`, no SQL on sheets. */
export function genererFichesRegles(db: Db, acteurOuCompte: Acteur | number, universId: number): RapportGeneration {
  const acteur = acteurDe(acteurOuCompte);
  exigerGenerer(db, acteur, universId);
  return db.transaction((): RapportGeneration => {
    const rapport: RapportGeneration = { creees: 0, misesAJour: 0, inchangees: 0, fiches: [] };
    for (const nature of NATURES_VAISSEAU) {
      const type = typeDe(nature);
      const p = produireRegles(db, universId, type);
      const ligne = ligneGeneree(db, universId, type);
      const libelleSection = nature === 'exemples' ? 'Exemples' : 'Règles';
      if (!ligne) {
        const fiche = creerFiche(db, acteur.compteId, universId, { type: 'regle', titre: TITRES[nature], sections: [] });
        const s = poserSectionGeree(db, acteur.compteId, universId, {
          ficheId: fiche.id, outil: OUTIL_VAISSEAUX, type, titre: libelleSection, audience: { joueursLisent: true },
          contenu: p.contenu, sourceVersion: p.sourceVersion, charge: p.charge,
        });
        rapport.creees++;
        rapport.fiches.push({ cle: type, ficheId: fiche.id, sectionId: s.id, resultat: 'creee' });
        continue;
      }
      const actuelle = lireSection(db, acteur, universId, ligne.fiche_id, ligne.section_id, 'markdown');
      if (actuelle.contenu === p.contenu && ligne.source_version === p.sourceVersion) {
        rapport.inchangees++;
        rapport.fiches.push({ cle: type, ficheId: ligne.fiche_id, sectionId: ligne.section_id, resultat: 'inchangee' });
        continue;
      }
      poserSectionGeree(db, acteur.compteId, universId, {
        ficheId: ligne.fiche_id, outil: OUTIL_VAISSEAUX, type, sectionId: ligne.section_id,
        contenu: p.contenu, sourceVersion: p.sourceVersion, version: actuelle.version, charge: p.charge,
      });
      rapport.misesAJour++;
      rapport.fiches.push({ cle: type, ficheId: ligne.fiche_id, sectionId: ligne.section_id, resultat: 'mise_a_jour' });
    }
    return rapport;
  })();
}

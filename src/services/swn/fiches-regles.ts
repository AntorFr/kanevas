import { createHash } from 'node:crypto';
import type { Db } from '../../db/db.js';
import type { ContexteSection, EcritSection } from '../../outils/declaration.js';
import { texteExemples, texteRegles, type CoqueRegle, type ElementRegle, type ExempleResolu } from '../../outils/swn/regles/texte-regles.js';
import { resoudreElements } from '../catalogues.js';
import { ErreurService } from '../erreurs.js';
import { creerFiche } from '../fiches.js';
import { propositionEnAttente } from '../propositions.js';
import { poserSectionGeree } from '../sections-gerees.js';
import { lireSection } from '../sections.js';
import { exigerUsage } from '../outils.js';
import type { Acteur } from '../types.js';
import { calculerResolu, resoudreChoix, versionsSource, OUTIL_VAISSEAUX, type LigneChoix } from './calcul-vaisseau.js';
import { catalogueVaisseaux, NATURES_VAISSEAU, type NatureCatalogueVaisseau } from './catalogue-vaisseaux.js';

// The rule and example sheets of the ship designer (B-77, R-1 to R-5): seven managed sections of `recalcul: 'proposition'`,
// produced **at a player's level** (R-2), and the table `swn_fiches_generees`, which only this file reads or writes.
// Apart from `section-vaisseaux.ts` for the same reason: the declaration (`outils/swn/index.ts`) calls these hooks lazily.

/** `regles-<nature>` for the six rule sheets, `exemples` for the examples. */
export const typeDe = (nature: NatureCatalogueVaisseau): string => (nature === 'exemples' ? 'exemples' : `regles-${nature}`);
export const TYPES_REGLES: string[] = NATURES_VAISSEAU.map(typeDe);
export const natureDe = (type: string): NatureCatalogueVaisseau | null =>
  NATURES_VAISSEAU.find((n) => typeDe(n) === type) ?? null;

export interface LigneFicheGeneree { id: number; univers_id: number; cle: string; fiche_id: number; section_id: number; source_version: string }

/** What a player does not see of this nature (every nature for the examples), as a short digest: `-` when nothing is hidden. */
function empreinte(db: Db, universId: number, nature: NatureCatalogueVaisseau): string {
  const stock = catalogueVaisseaux.stockage;
  const tous = nature === 'exemples';
  const caches = new Set<string>();
  for (const r of stock.lister(db, { universId })) if (r.masque && (tous || r.nature === nature)) caches.add(`${r.nature}/${r.cle}`);
  for (const r of stock.retraits(db, universId)) if (tous || r.nature === nature) caches.add(`${r.nature}/${r.cle}`);
  if (caches.size === 0) return '-';
  return createHash('sha1').update([...caches].sort().join('\n')).digest('hex').slice(0, 12);
}

export function versionSourceRegles(db: Db, universId: number, type: string): string {
  const nature = natureDe(type);
  if (!nature) throw new ErreurService('invalide', 'Type de section inconnu.', 'section_geree');
  const s = versionsSource(db, universId);
  return `regles:c=${s.catalogue};m=${empreinte(db, universId, nature)}${nature === 'exemples' ? `;r=${s.reglages}` : ''}`;
}

/** The elements of a nature as a player reads them (K-2): masked and withdrawn ones are absent, no trace. */
function elementsJoueur(db: Db, universId: number, nature: NatureCatalogueVaisseau) {
  return resoudreElements(db, universId, OUTIL_VAISSEAUX, nature, { inclureMasques: false }).map((r) => ({
    ...r.donnees, cle: r.cle, nom: r.nom,
    proprietaire: r.origine === 'univers' || r.origine === 'remplace' ? ('univers' as const) : ('systeme' as const),
  }));
}

/** An example whose hull or any line does not resolve at a player's level is left out whole (R-2). */
function exemplesJoueur(db: Db, universId: number): ExempleResolu[] {
  const sortie: ExempleResolu[] = [];
  for (const x of resoudreElements(db, universId, OUTIL_VAISSEAUX, 'exemples', { inclureMasques: false })) {
    const d = x.donnees as { coque: string; choix: LigneChoix[] };
    const s = calculerResolu(db, universId, resoudreChoix(db, universId, { coque: d.coque, choix: d.choix }, null));
    if (s.resultat !== null) sortie.push({ cle: x.cle, nom: x.nom, resultat: s.resultat });
  }
  return sortie;
}

export function produireRegles(db: Db, universId: number, type: string): { contenu: string; sourceVersion: string; charge: { cle: string } } {
  const nature = natureDe(type);
  if (!nature) throw new ErreurService('invalide', 'Type de section inconnu.', 'section_geree');
  const contenu = nature === 'exemples' ? texteExemples(exemplesJoueur(db, universId))
    : nature === 'coques' ? texteRegles('coques', elementsJoueur(db, universId, 'coques') as unknown as CoqueRegle[])
    : texteRegles(nature, elementsJoueur(db, universId, nature) as unknown as ElementRegle[]);
  return { contenu, sourceVersion: versionSourceRegles(db, universId, type), charge: { cle: type } };
}

export const ligneGeneree = (db: Db, universId: number, cle: string): LigneFicheGeneree | undefined =>
  db.prepare('SELECT * FROM swn_fiches_generees WHERE univers_id = ? AND cle = ?').get(universId, cle) as LigneFicheGeneree | undefined;

/** Same transaction, after every write of the section: the row follows the section, whoever wrote (R-5). */
export function apresEcritureRegles(ctx: ContexteSection, ecrit: EcritSection): void {
  const cle = (ecrit.charge as { cle?: string } | undefined)?.cle;
  if (typeof cle !== 'string' || !natureDe(cle) || ctx.sectionId === null) {
    throw new ErreurService('invalide', 'Cette section ne s\'écrit que par la génération des fiches de règles.', 'section_geree');
  }
  const existe = ctx.db.prepare('SELECT id FROM swn_fiches_generees WHERE section_id = ?').get(ctx.sectionId);
  if (existe) {
    ctx.db.prepare('UPDATE swn_fiches_generees SET source_version = ? WHERE section_id = ?').run(ecrit.sourceVersion, ctx.sectionId);
  } else {
    ctx.db.prepare(`INSERT INTO swn_fiches_generees (univers_id, cle, fiche_id, section_id, source_version) VALUES (?, ?, ?, ?, ?)`)
      .run(ctx.universId, cle, ctx.ficheId, ctx.sectionId, ecrit.sourceVersion);
  }
}

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

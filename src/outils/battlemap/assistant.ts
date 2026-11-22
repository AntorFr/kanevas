// The assistant's tools of the battle map (AD-battlemap-assistant-1, 2, 4, 5). A tool only composes service functions
// (AD-27): no SQL, no database import here, the account, the universe and the role are closed over and never a parameter.
import { readFileSync } from 'node:fs';
import { z } from 'zod';

import { ErreurService } from '../../services/erreurs.js';
import { appliquerCommandes, creerCarte, lireCarte } from '../../services/battlemap-cartes.js';
import { accessible } from '../../services/outils.js';
import { choisirAdaptateur } from '../../services/images/index.js';
import type { Evenement, Outil, Resultat } from '../../services/assistant/types.js';
import type { ContexteOutil } from '../declaration.js';

export const MAX_COMMANDES_PAQUET = 200;
export const MAX_ASSETS_LISTES = 100;
const OUTIL_ASSETS = 'battlemap/assets';

// These three services reach the sheets; a static import would close a cycle with the registry (as `swn` does): loaded at the call.
const assetsSvc = () => import('../../services/battlemap-assets.js');
const directionSvc = () => import('../../services/battlemap-direction.js');
const lotsSvc = () => import('../../services/battlemap-lots.js');

// ---- Skills (AD-battlemap-assistant-5) ------------------------------------------------------------------------------------
export const COMPETENCES = ['direction-artistique', 'lot-d-assets', 'composition-de-carte'] as const;
const lues = new Map<string, string>();
/** A skill's Markdown, read once at first use (`dist/` carries the files, the build copies them). */
export function texteCompetence(nom: string): string | undefined {
  if (!(COMPETENCES as readonly string[]).includes(nom)) return undefined;
  let t = lues.get(nom);
  if (t === undefined) {
    try {
      t = readFileSync(new URL(`./competences/${nom}.md`, import.meta.url), 'utf8');
    } catch {
      // A `dist/` built without the copy step (the chain builds with `main`'s package.json): read the sources beside it.
      t = readFileSync(new URL(`../../../src/outils/battlemap/competences/${nom}.md`, import.meta.url), 'utf8');
    }
    lues.set(nom, t);
  }
  return t;
}

// ---- Refusals, in the interface's words (AD-battlemap-assistant-4) --------------------------------------------------------
const INTROUVABLE: Resultat = { ok: false, erreur: 'Introuvable.' };
const refus = (erreur: string): Resultat => ({ ok: false, erreur });
const PARAMETRES: Resultat = refus('Paramètres invalides.');

interface ContexteRefus { largeur: number; hauteur: number; commande?: string }
type Phrase = string | ((c: ContexteRefus) => string);

/**
 * One sentence per code of the core's refusals (`rust/modules/battlemap-core/src/{commandes,document,lib}.rs`): a test fails
 * for any code the core can raise that is missing here. A code outside the table gets `PHRASE_GENERIQUE`, never the raw code.
 */
export const PHRASES_REFUS_COEUR: Record<string, Phrase> = {
  position_invalide: (c) => {
    const taille = `(${c.largeur} × ${c.hauteur})`;
    if (c.commande === 'tracer_mur' || c.commande === 'poser_porte') return `Le mur sort de la carte ${taille}.`;
    if (c.commande === 'peindre_sol') return `Le sol sort de la carte ${taille}.`;
    if (c.commande === 'poser_element' || c.commande === 'deplacer_element' || c.commande === 'dupliquer_elements') {
      return `L'élément sort de la carte ${taille}.`;
    }
    return `Une position sort de la carte ${taille}.`;
  },
  calque_inconnu: () => "Le calque n'existe pas sur cette carte. Relisez la carte avec bm_lire_carte pour connaître les identifiants des calques.",
  calque_incompatible: () => 'Ce calque ne peut pas recevoir cette commande : le sol va sur un calque de sol, les murs sur un calque de murs, les éléments sur un calque d\'objets.',
  carte_pleine: () => 'La carte est pleine : elle ne peut plus recevoir d\'éléments.',
  commande_invalide: () => "Une commande est inconnue ou incomplète. Relisez la compétence composition-de-carte.",
  echelle_invalide: () => "L'échelle d'un élément va de 0,25 à 4.",
  element_inconnu: () => "L'élément n'existe pas sur cette carte. Relisez la carte avec bm_lire_carte.",
  id_existant: () => 'Cet identifiant est déjà pris sur la carte : choisissez-en un autre.',
  limite_depassee: () => 'Cette taille dépasse les limites de la carte (200 × 200 cases) ou laisse des éléments dehors.',
  mur_inconnu: () => "Le mur n'existe pas sur cette carte. Relisez la carte avec bm_lire_carte.",
  nom_invalide: () => 'Un nom est vide ou trop long (80 caractères au plus).',
  rotation_invalide: () => 'La rotation est de 0, 90, 180 ou 270 degrés.',
  document_invalide: () => 'Le document de la carte est illisible. Prévenez le MJ.',
  contexte_invalide: () => 'La demande est invalide.',
  etat_invalide: () => 'La demande est invalide.',
};
export const PHRASE_GENERIQUE = "La carte refuse ces commandes. Relisez la compétence composition-de-carte et vérifiez-les.";

function phraseDuCoeur(code: string | undefined, c: ContexteRefus): string {
  const p = code === undefined ? undefined : PHRASES_REFUS_COEUR[code];
  return p === undefined ? PHRASE_GENERIQUE : typeof p === 'string' ? p : p(c);
}

/** A service refusal in the interface's words; anything that is not a refusal is a fault and goes up. */
function refusDeService(e: unknown, parDetail: Record<string, string> = {}): Resultat {
  if (!(e instanceof ErreurService)) throw e;
  if (e.code === 'introuvable') return INTROUVABLE;
  const mot = e.detail === undefined ? undefined : parDetail[e.detail];
  return refus(mot ?? e.message);
}

const evenement = (type: Evenement['type'], libelle: string, cible: Evenement['cible']): Evenement => ({ type, libelle, cible });
const id = z.number().int().min(1);

// ---- Assets ---------------------------------------------------------------------------------------------------------------
const schemaListe = z.strictObject({ categorie: z.enum(['objet', 'vaisseau', 'decor', 'sol', 'mur']).optional(), recherche: z.string().max(80).optional() });
const schemaVide = z.strictObject({});
const schemaDirection = z.strictObject({ texte: z.string().max(100_000), version: z.number().int().min(0) });
const schemaCompetence = z.strictObject({ nom: z.string().max(100) });

/** The assets a map or a batch may use: valid ones the caller reads (a draft is never usable). */
async function assetsUtilisables(ctx: ContexteOutil, filtres: { categorie?: string; q?: string } = {}) {
  const { listerAssets } = await assetsSvc();
  return listerAssets(ctx.db, ctx.acteur, ctx.universId, filtres).assets.filter((a) => a.etat === 'valide');
}

function outilListerAssets(ctx: ContexteOutil): Outil {
  return {
    nom: 'bm_lister_assets',
    description: "Liste les assets de la bibliothèque de la battle map (100 au plus) : id, nom, catégorie (objet, vaisseau, decor, sol, mur), empreinte en cases, vue de dessus, étiquettes. L'id est ce que prennent les autres outils. Filtres facultatifs : catégorie, recherche dans le nom ou les étiquettes. N'écrit rien.",
    schema: schemaListe,
    async executer(args): Promise<Resultat> {
      const p = schemaListe.safeParse(args ?? {});
      if (!p.success) return PARAMETRES;
      try {
        const tous = await assetsUtilisables(ctx, { categorie: p.data.categorie, q: p.data.recherche });
        const assets = tous.slice(0, MAX_ASSETS_LISTES).map((a) => ({
          id: String(a.id), nom: a.nom, categorie: a.categorie, largeur: a.largeur, hauteur: a.hauteur, vue_dessus: a.vueDessus, tags: a.tags,
        }));
        return { ok: true, donnees: { assets, total: tous.length, tronque: tous.length > assets.length } };
      } catch (e) {
        return refusDeService(e);
      }
    },
  };
}

function outilLireDirection(ctx: ContexteOutil): Outil {
  return {
    nom: 'bm_lire_direction',
    description: "Lit la direction artistique de l'univers : son texte, sa version (à redonner à bm_ecrire_direction) et la légende de ses images de référence. N'écrit rien.",
    schema: schemaVide,
    async executer(args): Promise<Resultat> {
      if (!schemaVide.safeParse(args ?? {}).success) return PARAMETRES;
      try {
        const { lireDirection } = await directionSvc();
        const d = lireDirection(ctx.db, ctx.acteur, ctx.universId);
        return { ok: true, donnees: { texte: d.texte, version: d.version, references: d.images.map((i) => i.legende) } };
      } catch (e) {
        return refusDeService(e);
      }
    },
  };
}

function outilEcrireDirection(ctx: ContexteOutil): Outil {
  return {
    nom: 'bm_ecrire_direction',
    description: "Écrit la direction artistique de l'univers (5 000 caractères au plus) ; le MJ peut annuler d'un pas. `version` est celle lue par bm_lire_direction. Chargez la compétence direction-artistique (bm_competence) avant d'écrire.",
    schema: schemaDirection,
    async executer(args): Promise<Resultat> {
      const p = schemaDirection.safeParse(args ?? {});
      if (!p.success) return PARAMETRES;
      try {
        const { ecrireDirection } = await directionSvc();
        const d = ecrireDirection(ctx.db, ctx.acteur, ctx.universId, p.data.texte, p.data.version, 'assistant');
        return {
          ok: true, donnees: { version: d.version },
          evenement: evenement('direction_ecrite', 'Direction artistique modifiée', { type: 'direction', versionPrecedente: p.data.version }),
        };
      } catch (e) {
        return refusDeService(e, {
          direction_modifiee: "Le texte a changé depuis que vous l'avez lu. Relisez-le.",
          texte_trop_long: 'Le texte est limité à 5 000 caractères.',
        });
      }
    },
  };
}

function outilCompetence(): Outil {
  return {
    nom: 'bm_competence',
    description: `Rend une compétence de la battle map, en Markdown : ${COMPETENCES.join(', ')}. Chargez la compétence avant d'écrire une direction, de préparer un lot ou de composer une carte.`,
    schema: schemaCompetence,
    async executer(args): Promise<Resultat> {
      const p = schemaCompetence.safeParse(args ?? {});
      if (!p.success) return PARAMETRES;
      const t = texteCompetence(p.data.nom);
      if (t === undefined) return refus(`Compétence inconnue. Les compétences sont : ${COMPETENCES.join(', ')}.`);
      return { ok: true, donnees: { nom: p.data.nom, texte: t } };
    },
  };
}

/** `assets` (AD-battlemap-assistant-1): the listing for everyone who has the tool, the rest for the GM. */
export function outilsAssets(ctx: ContexteOutil): Outil[] {
  if (ctx.role !== 'mj') return [outilListerAssets(ctx)];
  return [outilListerAssets(ctx), outilLireDirection(ctx), outilEcrireDirection(ctx), outilCompetence()];
}

// ---- Generation -----------------------------------------------------------------------------------------------------------
const schemaLot = z.strictObject({
  lignes: z.array(z.strictObject({
    nom: z.string().max(200),
    categorie: z.enum(['objet', 'vaisseau', 'decor', 'sol', 'mur']),
    largeur: z.number().int().optional(),
    hauteur: z.number().int().optional(),
    indice: z.string().max(1000).optional(),
  })).min(1).max(100),
});

/** `generation`: needs the GM, `assets` accessible and an image engine (AD-88, E-27 would not exist to show the batch). */
export function outilsGeneration(ctx: ContexteOutil): Outil[] {
  if (ctx.role !== 'mj' || !accessible(ctx.db, ctx.acteur, ctx.universId, OUTIL_ASSETS) || choisirAdaptateur().nom === 'aucun') return [];
  return [{
    nom: 'bm_lancer_lot',
    description: "Prépare un lot d'assets à générer (1 à 20 lignes : nom, catégorie, empreinte en cases, indication) : l'assistant PRÉPARE, le MJ LANCE depuis la génération ; rien n'est généré par cet outil. Refusé si un lot est déjà préparé ou en cours. Chargez la compétence lot-d-assets (bm_competence) avant d'écrire.",
    schema: schemaLot,
    async executer(args): Promise<Resultat> {
      const p = schemaLot.safeParse(args ?? {});
      if (!p.success) return PARAMETRES;
      try {
        const { enregistrerLot, lireLot } = await lotsSvc();
        if (lireLot(ctx.db, ctx.acteur, ctx.universId) !== null) {
          return refus('Un lot est déjà préparé ou en cours. Ouvrez-le dans la génération.');
        }
        const lot = enregistrerLot(ctx.db, ctx.acteur, ctx.universId, p.data.lignes);
        return {
          ok: true, donnees: { lignes: lot.lignes.length, etat: lot.etat },
          evenement: evenement('lot_prepare', `Lot préparé : ${lot.lignes.length} assets`, { type: 'lot', lignes: lot.lignes.length }),
        };
      } catch (e) {
        return refusDeService(e, { lot_en_cours: 'Un lot est déjà préparé ou en cours. Ouvrez-le dans la génération.' });
      }
    },
  }];
}

// ---- Maps -----------------------------------------------------------------------------------------------------------------
interface DocCarte {
  calques: { id: string; nom: string; type: string; mj_seul?: boolean }[];
  sols: { calque: string; x: number; y: number; asset_id: string }[];
  murs: { calque: string; x: number; y: number; cote: 'h' | 'v'; asset_id: string; porte?: boolean }[];
  elements: { id: string; calque: string; asset_id: string; x: number; y: number; rotation?: number; miroir?: boolean; echelle?: number }[];
}

const schemaCreer = z.strictObject({ titre: z.string().min(1).max(80), largeur: z.number().int().min(1).max(200), hauteur: z.number().int().min(1).max(200) });
const schemaAppliquer = z.strictObject({
  carte_id: id, version: id,
  commandes: z.array(z.record(z.string(), z.unknown())).min(1),
});
const schemaLireCarte = z.strictObject({ carte_id: id });

const PERIMEE_CARTE = "La carte a changé depuis que vous l'avez lue. Relisez-la avec bm_lire_carte.";

/** Runs of consecutive wall segments on one line, so that a room is one line and not forty. */
function tronconsDeMurs(murs: DocCarte['murs']): { calque: string; asset_id: string; cote: 'h' | 'v'; fixe: number; de: number; a: number; portes: number }[] {
  const tries = [...murs].sort((a, b) => a.calque.localeCompare(b.calque) || a.asset_id.localeCompare(b.asset_id) || a.cote.localeCompare(b.cote)
    || (a.cote === 'h' ? a.y - b.y || a.x - b.x : a.x - b.x || a.y - b.y));
  const troncons: ReturnType<typeof tronconsDeMurs> = [];
  for (const m of tries) {
    const fixe = m.cote === 'h' ? m.y : m.x;
    const pos = m.cote === 'h' ? m.x : m.y;
    const t = troncons[troncons.length - 1];
    if (t && t.calque === m.calque && t.asset_id === m.asset_id && t.cote === m.cote && t.fixe === fixe && t.a === pos - 1) {
      t.a = pos;
      if (m.porte) t.portes += 1;
    } else troncons.push({ calque: m.calque, asset_id: m.asset_id, cote: m.cote, fixe, de: pos, a: pos, portes: m.porte ? 1 : 0 });
  }
  return troncons;
}

/** The compact description of a map the assistant reads: names of assets, never their files (AD-battlemap-assistant-2). */
function decrire(doc: DocCarte, nomAsset: (id: string) => string): string[] {
  const calque = (cid: string) => doc.calques.find((c) => c.id === cid)?.nom ?? cid;
  const lignes: string[] = [];
  const sols = new Map<string, DocCarte['sols']>();
  for (const s of doc.sols) sols.set(`${s.calque}\u0000${s.asset_id}`, [...(sols.get(`${s.calque}\u0000${s.asset_id}`) ?? []), s]);
  for (const g of sols.values()) {
    const xs = g.map((s) => s.x);
    const ys = g.map((s) => s.y);
    lignes.push(`Sol « ${nomAsset(g[0]!.asset_id)} » (calque ${calque(g[0]!.calque)}) : ${g.length} cases, de (${Math.min(...xs)}, ${Math.min(...ys)}) à (${Math.max(...xs)}, ${Math.max(...ys)}).`);
  }
  for (const t of tronconsDeMurs(doc.murs)) {
    const trace = t.cote === 'h' ? `y = ${t.fixe}, de x = ${t.de} à x = ${t.a + 1}` : `x = ${t.fixe}, de y = ${t.de} à y = ${t.a + 1}`;
    lignes.push(`Mur « ${nomAsset(t.asset_id)} » (calque ${calque(t.calque)}) : ${trace}${t.portes > 0 ? `, ${t.portes} porte(s)` : ''}.`);
  }
  for (const e of doc.elements) {
    lignes.push(`Élément ${e.id} « ${nomAsset(e.asset_id)} » (calque ${calque(e.calque)}) en (${e.x}, ${e.y})${e.rotation ? `, rotation ${e.rotation}` : ''}${e.echelle !== undefined && e.echelle !== 1 ? `, échelle ${e.echelle}` : ''}.`);
  }
  return lignes;
}

function outilCreerCarte(ctx: ContexteOutil): Outil {
  return {
    nom: 'bm_creer_carte',
    description: "Crée une carte de battle map vide (titre, largeur et hauteur en cases, 200 au plus) avec ses trois calques Sol, Murs, Objets ; elle est CACHÉE aux joueurs, le MJ la montre lui-même. Rend l'id de la carte, sa version et les identifiants des calques, que bm_appliquer_commandes demande. Chargez la compétence composition-de-carte (bm_competence) avant de composer.",
    schema: schemaCreer,
    async executer(args): Promise<Resultat> {
      const p = schemaCreer.safeParse(args ?? {});
      if (!p.success) return PARAMETRES;
      try {
        const { id: carteId } = creerCarte(ctx.db, ctx.acteur, ctx.universId, p.data);
        const c = lireCarte(ctx.db, ctx.acteur, ctx.universId, carteId);
        const doc = c.document as DocCarte;
        return {
          ok: true,
          donnees: { carte_id: c.id, version: c.version, largeur: c.largeur, hauteur: c.hauteur, visible: false, calques: doc.calques.map((k) => ({ id: k.id, nom: k.nom, type: k.type })) },
          evenement: evenement('carte_composee', `Carte « ${c.titre} » composée`, { type: 'carte', carteId: c.id, titre: c.titre }),
        };
      } catch (e) {
        return refusDeService(e);
      }
    },
  };
}

function outilAppliquerCommandes(ctx: ContexteOutil): Outil {
  return {
    nom: 'bm_appliquer_commandes',
    description: `Applique un paquet de commandes (${MAX_COMMANDES_PAQUET} au plus) à une carte, en bloc : tout est appliqué ou rien. \`version\` est celle de la carte lue ou rendue par le dernier appel. Les commandes viennent de la compétence composition-de-carte ; les asset_id sont ceux de bm_lister_assets, jamais inventés. Rend la nouvelle version.`,
    schema: schemaAppliquer,
    async executer(args): Promise<Resultat> {
      const p = schemaAppliquer.safeParse(args ?? {});
      if (!p.success) return PARAMETRES;
      const { carte_id: carteId, version, commandes } = p.data;
      if (commandes.length > MAX_COMMANDES_PAQUET) return refus(`Envoyez les commandes par paquets de ${MAX_COMMANDES_PAQUET} au plus.`);
      try {
        // Before the core: an asset that is not in the library is named, so that the assistant can say what is missing.
        const connus = new Set((await assetsUtilisables(ctx)).map((a) => String(a.id)));
        for (const c of commandes) {
          if (!['peindre_sol', 'tracer_mur', 'poser_element'].includes(String(c.type)) || c.asset_id === undefined) continue;
          if (typeof c.asset_id !== 'string' || !connus.has(c.asset_id)) {
            return refus(`L'asset ${String(c.asset_id)} n'existe pas dans la bibliothèque. Listez-la avec bm_lister_assets.`);
          }
        }
        const avant = lireCarte(ctx.db, ctx.acteur, ctx.universId, carteId);
        try {
          const r = appliquerCommandes(ctx.db, ctx.acteur, ctx.universId, carteId, version, commandes);
          return {
            ok: true, donnees: { carte_id: carteId, version: r.version, commandes: commandes.length },
            evenement: evenement('carte_composee', `Carte « ${avant.titre} » composée`, { type: 'carte', carteId, titre: avant.titre }),
          };
        } catch (e) {
          if (e instanceof ErreurService && e.code === 'conflit' && e.detail === 'version') return refus(PERIMEE_CARTE);
          if (e instanceof ErreurService && e.code === 'invalide' && e.detail === 'asset_inconnu') return refus("Un asset n'existe pas dans la bibliothèque. Listez-la avec bm_lister_assets.");
          if (e instanceof ErreurService && e.code === 'invalide' && e.detail === 'fiche_inconnue') return refus("Une fiche liée n'existe pas dans cet univers.");
          if (e instanceof ErreurService && (e.code === 'invalide' || e.code === 'conflit') && e.detail !== undefined && e.detail in PHRASES_REFUS_COEUR) {
            const commande = e.index === undefined ? undefined : String(commandes[e.index]?.type);
            return refus(phraseDuCoeur(e.detail, { largeur: avant.largeur, hauteur: avant.hauteur, commande }));
          }
          if (e instanceof ErreurService && e.code === 'invalide' && e.champ !== 'version') return refus(PHRASE_GENERIQUE);
          throw e;
        }
      } catch (e) {
        return refusDeService(e);
      }
    },
  };
}

function outilLireCarte(ctx: ContexteOutil): Outil {
  return {
    nom: 'bm_lire_carte',
    description: "Décrit une carte de façon compacte : taille, version, calques, puis une ligne par sol, par tronçon de mur et par élément, avec le NOM de l'asset. À lire après chaque paquet pour vérifier le résultat. N'écrit rien.",
    schema: schemaLireCarte,
    async executer(args): Promise<Resultat> {
      const p = schemaLireCarte.safeParse(args ?? {});
      if (!p.success) return PARAMETRES;
      try {
        const c = lireCarte(ctx.db, ctx.acteur, ctx.universId, p.data.carte_id);
        const doc = c.document as DocCarte;
        const noms = new Map((await assetsUtilisables(ctx)).map((a) => [String(a.id), a.nom]));
        return {
          ok: true,
          donnees: {
            carte_id: c.id, titre: c.titre, largeur: c.largeur, hauteur: c.hauteur, version: c.version,
            calques: doc.calques.map((k) => ({ id: k.id, nom: k.nom, type: k.type })),
            contenu: decrire(doc, (i) => noms.get(i) ?? `asset ${i} (retiré)`),
          },
        };
      } catch (e) {
        return refusDeService(e);
      }
    },
  };
}

/** `cartes`: the GM, with `assets` accessible (composing picks from the library). */
export function outilsCartes(ctx: ContexteOutil): Outil[] {
  if (ctx.role !== 'mj' || !accessible(ctx.db, ctx.acteur, ctx.universId, OUTIL_ASSETS)) return [];
  return [outilCreerCarte(ctx), outilAppliquerCommandes(ctx), outilLireCarte(ctx)];
}

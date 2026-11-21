import { ErreurTransport } from './erreurs.js';
import type { AgentTransport, DemandeAgent } from './transport.js';
import type { Outil } from './types.js';
import { ECHEC_IMAGE } from './catalogue.js';

export const HORS_SCRIPT =
  "Je ne sais répondre qu'à des demandes de test : chercher, lire, ajouter.";
const INTROUVABLE = 'Introuvable.';

/** What the stub's script calls: the real tools of the caller's catalogue (AD-78). */
class Appel {
  constructor(private readonly outils: Outil[]) {}

  a(nom: string) {
    return this.outils.some((o) => o.nom === nom);
  }

  /** Runs a tool; the stub only calls a tool it checked is in the catalogue. */
  async faire(nom: string, args: unknown) {
    const o = this.outils.find((x) => x.nom === nom);
    if (!o) throw new ErreurTransport('Outil absent.');
    return o.executer(args);
  }
}

const absent = (nom: string) =>
  `Je ne peux pas le faire : l'outil « ${nom} » ne fait pas partie de ceux dont vous disposez.`;

type Donnees = Record<string, any>;

async function creerCampagne(a: Appel, titre: string): Promise<string> {
  if (!a.a('creer_fiche')) return absent('creer_fiche');
  const r = await a.faire('creer_fiche', { type: 'aventure', titre, sousType: 'Campagne' });
  return r.ok ? `Campagne « ${(r.donnees as Donnees).titre} » créée.` : r.erreur;
}

async function creerScenario(a: Appel, titre: string, campagne: string): Promise<string> {
  if (!a.a('creer_fiche')) return absent('creer_fiche');
  const cherche = await a.faire('chercher', { mots: campagne, type: 'aventure' });
  if (!cherche.ok) return cherche.erreur;
  const parent = (cherche.donnees as Donnees).fiches.find(
    (f: Donnees) => f.titre.toLowerCase() === campagne.toLowerCase(),
  );
  if (!parent) return INTROUVABLE;
  const r = await a.faire('creer_fiche', {
    type: 'aventure', titre, sousType: 'Scénario', parentId: parent.id,
  });
  return r.ok ? `Scénario « ${(r.donnees as Donnees).titre} » créé dans ${parent.titre}.` : r.erreur;
}

async function lireSection(a: Appel, section: string): Promise<string> {
  const cherche = await a.faire('chercher', { mots: section });
  if (!cherche.ok) return cherche.erreur;
  const mot = section.toLowerCase();
  for (const f of (cherche.donnees as Donnees).fiches) {
    const fiche = await a.faire('lire_fiche', { ficheId: f.id });
    if (!fiche.ok) continue;
    const s = (fiche.donnees as Donnees).sections.find((x: Donnees) =>
      x.titre.toLowerCase().includes(mot),
    );
    if (!s) continue;
    const r = await a.faire('lire_section', { ficheId: f.id, sectionId: s.id });
    return r.ok ? `${s.titre} : ${(r.donnees as Donnees).contenu}` : r.erreur;
  }
  return INTROUVABLE;
}

async function proposer(a: Appel, section: string, fiche: string, cr: string): Promise<string> {
  if (!a.a('proposer_mise_a_jour')) return absent('proposer_mise_a_jour');
  const crs = await a.faire('chercher', { mots: cr, type: 'compte_rendu' });
  if (!crs.ok) return crs.erreur;
  const source = (crs.donnees as Donnees).fiches.find(
    (f: Donnees) => f.titre.toLowerCase() === cr.toLowerCase(),
  );
  if (!source) return INTROUVABLE;
  const cherche = await a.faire('chercher', { mots: fiche });
  if (!cherche.ok) return cherche.erreur;
  const mot = section.toLowerCase();
  for (const f of (cherche.donnees as Donnees).fiches) {
    if (f.titre.toLowerCase() !== fiche.toLowerCase() || f.id === source.id) continue;
    const lue = await a.faire('lire_fiche', { ficheId: f.id });
    if (!lue.ok) continue;
    const s = (lue.donnees as Donnees).sections.find((x: Donnees) =>
      x.titre.toLowerCase().includes(mot),
    );
    if (!s) continue;
    const l = await a.faire('lire_section', { ficheId: f.id, sectionId: s.id });
    if (!l.ok) return l.erreur;
    const d = l.donnees as Donnees;
    const ajout = `Mise à jour d'après « ${cr} ».`;
    const r = await a.faire('proposer_mise_a_jour', {
      section_id: s.id,
      cr_id: source.id,
      version: d.version,
      contenu: d.contenu === '' ? ajout : `${d.contenu}\n\n${ajout}`,
    });
    return r.ok ? `Mise à jour proposée pour la section « ${s.titre} » de « ${f.titre} ».` : r.erreur;
  }
  return INTROUVABLE;
}

async function ajouter(a: Appel, texte: string, section: string): Promise<string> {
  const cherche = await a.faire('chercher', { mots: section });
  if (!cherche.ok) return cherche.erreur;
  const mot = section.toLowerCase();
  for (const f of (cherche.donnees as Donnees).fiches) {
    const fiche = await a.faire('lire_fiche', { ficheId: f.id });
    if (!fiche.ok) continue;
    const s = (fiche.donnees as Donnees).sections.find((x: Donnees) =>
      x.titre.toLowerCase().includes(mot),
    );
    if (!s) continue;
    const r = await a.faire('ajouter_a_section', {
      ficheId: f.id,
      sectionId: s.id,
      texte,
      version: s.version,
    });
    return r.ok ? `Section « ${s.titre} » complétée.` : r.erreur;
  }
  return INTROUVABLE;
}

async function queSaitOn(a: Appel, sujet: string): Promise<string> {
  const cherche = await a.faire('chercher', { mots: sujet });
  if (!cherche.ok) return cherche.erreur;
  const lignes: string[] = [];
  for (const f of (cherche.donnees as Donnees).fiches.slice(0, 3)) {
    const fiche = await a.faire('lire_fiche', { ficheId: f.id });
    if (!fiche.ok) continue;
    const d = fiche.donnees as Donnees;
    lignes.push(
      `${d.titre} :\n` + d.sections.map((s: Donnees) => `${s.titre} : ${s.contenu}`).join('\n'),
    );
  }
  return lignes.length > 0 ? lignes.join('\n\n') : INTROUVABLE;
}

/** « Fais un portrait pour « S » d'« F » » (AD-89): the message itself is the description. */
async function portrait(a: Appel, section: string, fiche: string, message: string): Promise<string> {
  if (!a.a('generer_image')) return absent('generer_image');
  const cherche = await a.faire('chercher', { mots: fiche });
  if (!cherche.ok) return cherche.erreur;
  const mot = section.toLowerCase();
  for (const f of (cherche.donnees as Donnees).fiches) {
    if (f.titre.toLowerCase() !== fiche.toLowerCase()) continue;
    const lue = await a.faire('lire_fiche', { ficheId: f.id });
    if (!lue.ok) continue;
    const s = (lue.donnees as Donnees).sections.find((x: Donnees) => x.titre.toLowerCase().includes(mot));
    if (!s) continue;
    const r = await a.faire('generer_image', { sectionId: s.id, description: message });
    if (r.ok) return `Image attachée à la section « ${s.titre} » de « ${f.titre} ».`;
    return r.erreur;
  }
  return INTROUVABLE;
}


// ---- Battle map (AD-battlemap-assistant-8): the stub calls the real tools of the catalogue -----------------------------------
const TEXTE_DIRECTION =
  "Peinture à plat, couleurs franches, vue de dessus, contours nets. Palette chaude et sobre, lumière douce, matières lisibles.";
const VOCABULAIRE_DECORS = ['Cuve rouillée', 'Console éteinte', 'Conduit éventré', 'Cloison fendue', 'Caisson de secours', 'Câbles pendants', 'Rayonnage vide', 'Écran brisé', 'Sas scellé', 'Lampe clignotante'];
const NOMBRES: Record<string, number> = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, quinze: 15, vingt: 20 };

async function direction(a: Appel): Promise<string> {
  if (!a.a('bm_ecrire_direction')) return absent('bm_ecrire_direction');
  const c = await a.faire('bm_competence', { nom: 'direction-artistique' });
  if (!c.ok) return c.erreur;
  const l = await a.faire('bm_lire_direction', {});
  if (!l.ok) return l.erreur;
  const r = await a.faire('bm_ecrire_direction', { texte: TEXTE_DIRECTION, version: (l.donnees as Donnees).version });
  return r.ok ? "Direction artistique écrite. Vous pouvez l'annuler depuis son écran." : r.erreur;
}

async function decors(a: Appel, n: number): Promise<string> {
  if (!a.a('bm_lancer_lot')) return absent('bm_lancer_lot');
  const nombre = Math.min(Math.max(n, 1), 20);
  const c = await a.faire('bm_competence', { nom: 'lot-d-assets' });
  if (!c.ok) return c.erreur;
  const l = await a.faire('bm_lire_direction', {});
  if (!l.ok) return l.erreur;
  const lignes = Array.from({ length: nombre }, (_, i) => ({
    nom: i < VOCABULAIRE_DECORS.length ? VOCABULAIRE_DECORS[i]! : `${VOCABULAIRE_DECORS[i % VOCABULAIRE_DECORS.length]!} ${Math.floor(i / VOCABULAIRE_DECORS.length) + 1}`,
    categorie: 'decor', largeur: i % 2 === 0 ? 1 : 2, hauteur: 1,
  }));
  const r = await a.faire('bm_lancer_lot', { lignes });
  return r.ok ? `Lot de ${nombre} décors préparé. Il reste à le lancer depuis la génération.` : r.erreur;
}

const plier = (t: string) => t.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** « Compose une cantine de 20×14 avec une cuisine et une réserve »: one room per word, side by side, walls and floor. */
async function composer(a: Appel, titre: string, largeur: number, hauteur: number, mots: string[]): Promise<string> {
  if (!a.a('bm_creer_carte')) return absent('bm_creer_carte');
  const comp = await a.faire('bm_competence', { nom: 'composition-de-carte' });
  if (!comp.ok) return comp.erreur;
  const liste = await a.faire('bm_lister_assets', {});
  if (!liste.ok) return liste.erreur;
  const assets = (liste.donnees as Donnees).assets as Donnees[];
  const parCategorie = (c: string) => assets.find((x) => x.categorie === c);
  const sol = parCategorie('sol');
  const mur = parCategorie('mur');
  if (!sol || !mur) return "Il manque un sol ou un mur dans la bibliothèque.";
  const creee = await a.faire('bm_creer_carte', { titre, largeur, hauteur });
  if (!creee.ok) return creee.erreur;
  const carte = creee.donnees as Donnees;
  const calque = (nom: string) => (carte.calques as Donnees[]).find((k) => k.nom === nom)?.id as string;
  const n = Math.max(mots.length, 1);
  const largeurPiece = Math.max(Math.floor((largeur - 2) / n), 3);
  const manquants: string[] = [];
  const cellules: { x: number; y: number }[] = [];
  const segments: { x: number; y: number; cote: 'h' | 'v' }[] = [];
  const objets: Donnees[] = [];
  const mots_ = mots.length > 0 ? mots : [''];
  mots_.forEach((mot, i) => {
    const x0 = 1 + i * largeurPiece;
    const x1 = Math.min(x0 + largeurPiece - 1, largeur - 2);
    const y0 = 1;
    const y1 = hauteur - 2;
    if (x1 < x0 || y1 < y0) return;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) cellules.push({ x, y });
    for (let x = x0; x <= x1; x++) segments.push({ x, y: y0, cote: 'h' }, { x, y: y1 + 1, cote: 'h' });
    for (let y = y0; y <= y1; y++) segments.push({ x: x0, y, cote: 'v' }, { x: x1 + 1, y, cote: 'v' });
    if (!mot) return;
    const m = plier(mot);
    const objet = assets.find((x) => x.categorie !== 'sol' && x.categorie !== 'mur'
      && (plier(String(x.nom)).includes(m) || (x.tags as string[]).some((t) => plier(t).includes(m))));
    if (!objet) manquants.push(mot);
    else objets.push({ type: 'poser_element', id: `piece-${i + 1}`, calque: calque('Objets'), asset_id: objet.id, x: x0 + 1.5, y: y0 + 1.5 });
  });
  const commandes: Donnees[] = [
    { type: 'peindre_sol', calque: calque('Sol'), cellules, asset_id: sol.id },
    { type: 'tracer_mur', calque: calque('Murs'), segments, asset_id: mur.id },
  ];
  // Several batches on purpose: the orchestration answers with one event for the map (AD-battlemap-assistant-6).
  let version = carte.version as number;
  for (const paquet of [commandes.slice(0, 1), [...commandes.slice(1), ...objets]]) {
    const r = await a.faire('bm_appliquer_commandes', { carte_id: carte.carte_id, version, commandes: paquet });
    if (!r.ok) return r.erreur;
    version = (r.donnees as Donnees).version;
  }
  const lue = await a.faire('bm_lire_carte', { carte_id: carte.carte_id });
  if (!lue.ok) return lue.erreur;
  const dit = `Carte « ${titre} » composée (${largeur}×${hauteur}), cachée aux joueurs jusqu'à ce que vous la montriez.`;
  return manquants.length === 0
    ? dit
    : `${dit} Il manque un asset de ${manquants.join(' et de ')} dans la bibliothèque : la pièce est construite sans.`;
}

function regleCarte(a: Appel, message: string): string | Promise<string> | null {
  const m = message.match(/(\d+)\s*[x×]\s*(\d+)/i);
  if (!m || !/compose|carte/i.test(message)) return null;
  const apres = message.slice(m.index! + m[0].length);
  const avec = apres.match(/\bavec\s+(.+?)\s*[.!?]?\s*$/i);
  const mots = avec
    ? avec[1]!.split(/\s*,\s*|\s+et\s+/i).map((t) => t.replace(/^(?:une?|des|de la|du|de l['’]|la|le|les|l['’])\s*/i, '').trim()).filter(Boolean)
    : [];
  const avant = message.match(/compose\s+(?:une?|la|le)\s+(.+?)\s+de\s+\d/i);
  const titre = avant ? avant[1]!.charAt(0).toUpperCase() + avant[1]!.slice(1) : 'Carte composée';
  return composer(a, titre, Number(m[1]), Number(m[2]), mots);
}

function regleDecors(a: Appel, message: string): string | Promise<string> | null {
  if (!/d[ée]cors|assets/i.test(message)) return null;
  const chiffre = message.match(/\b(\d+)\b/);
  const mot = message.toLowerCase().match(/\b(un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|quinze|vingt)\b/);
  const n = chiffre ? Number(chiffre[1]) : mot ? NOMBRES[mot[1]!] : undefined;
  return n === undefined ? null : decors(a, n);
}

type Regle = { motif: RegExp; agir: (a: Appel, m: RegExpMatchArray, message: string) => string | Promise<string> | null };

/** Ordered: the first rule whose keywords appear in the message wins (AD-78); a rule answering `null` passes. */
const REGLES: Regle[] = [
  { motif: /direction.*artistique|artistique.*direction/i, agir: (a) => direction(a) },
  { motif: /./s, agir: (a, _m, message) => regleCarte(a, message) },
  { motif: /./s, agir: (a, _m, message) => regleDecors(a, message) },
  { motif: /cr[ée]e une campagne «\s*(.+?)\s*»/i, agir: (a, m) => creerCampagne(a, m[1]!) },
  {
    motif: /cr[ée]e un sc[ée]nario «\s*(.+?)\s*» dans «\s*(.+?)\s*»/i,
    agir: (a, m) => creerScenario(a, m[1]!, m[2]!),
  },
  {
    motif: /mets [àa] jour la section «\s*(.+?)\s*» de «\s*(.+?)\s*» d['’]après le compte-rendu «\s*(.+?)\s*»/i,
    agir: (a, m) => proposer(a, m[1]!, m[2]!, m[3]!),
  },
  { motif: /lis-moi la section «\s*(.+?)\s*»/i, agir: (a, m) => lireSection(a, m[1]!) },
  { motif: /ajoute le paragraphe «\s*(.+?)\s*» dans «\s*(.+?)\s*»/i, agir: (a, m) => ajouter(a, m[1]!, m[2]!) },
  { motif: /que sait-on d(?:e |['’])\s*(.+?)\s*\??\s*$/i, agir: (a, m) => queSaitOn(a, m[1]!) },
  {
    motif: /fais un portrait pour «\s*(.+?)\s*» d(?:e |['’])\s*«\s*(.+?)\s*»/i,
    agir: (a, m, message) => portrait(a, m[1]!, m[2]!, message),
  },
  {
    // A portrait request that does not fit the form but says « échec »: the image failure, not a transport error.
    motif: /portrait.*[ée]chec|[ée]chec.*portrait/i,
    agir: (a) => (a.a('generer_image') ? ECHEC_IMAGE : absent('generer_image')),
  },
  {
    motif: /[ée]chec/i,
    agir: () => {
      throw new ErreurTransport('Échec simulé du bouchon.');
    },
  },
];

/** The stub (AD-55, AD-78): a keyword script, no network, same tools as the real agent. */
export class BouchonTransport implements AgentTransport {
  readonly nom = 'bouchon';

  async repondre(demande: DemandeAgent): Promise<string> {
    const appel = new Appel(demande.outils);
    for (const regle of REGLES) {
      const m = demande.message.match(regle.motif);
      if (!m) continue;
      const r = await regle.agir(appel, m, demande.message);
      if (r !== null) return r;
    }
    return HORS_SCRIPT;
  }
}

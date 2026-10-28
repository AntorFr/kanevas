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

type Regle = { motif: RegExp; agir: (a: Appel, m: RegExpMatchArray, message: string) => string | Promise<string> };

/** Ordered: the first rule whose keywords appear in the message wins (AD-78). */
const REGLES: Regle[] = [
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
      if (m) return regle.agir(appel, m, demande.message);
    }
    return HORS_SCRIPT;
  }
}

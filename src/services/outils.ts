import type { Db } from '../db/db.js';
import { env } from '../config/env.js';
import { applicable, schemaValeur, type CarteOutil, type DeclarationModule, type DeclarationOutil,
  type Reglages, type ValeurReglage } from '../outils/declaration.js';
import { modulesActifs } from '../outils/registre.js';
import { exigerMJ, roleDe, vueMJ } from './droits.js';
import { ErreurService, introuvable, refuse } from './erreurs.js';
import type { Acteur } from './types.js';

export type CibleOutils = { niveau: 'systeme' | 'univers'; id: number };
export type Origine = 'defaut' | 'systeme' | 'univers';
export interface ValeurResolue { valeur: ValeurReglage; origine: Origine }
export interface ResolutionReglages {
  reglages: Record<string, ValeurResolue>;
  versionReglages: { systeme: number; univers: number };
}
export interface ResolutionOutil extends ResolutionReglages {
  active: boolean;
  visibilite: { mj: boolean; joueur: boolean };
  communs: ResolutionReglages;
}
export interface LigneOutil {
  active: number | null;
  visibilite_mj: number | null;
  visibilite_joueur: number | null;
  reglages: string;
  version_reglages: number;
  version_catalogue: string | null;
}
const invalide = (champ: string, message = 'Valeur de réglage invalide.', detail?: string) =>
  new ErreurService('invalide', message, detail, champ);
const acteurDe = (acteur: Acteur | number): Acteur => typeof acteur === 'number' ? { compteId: acteur } : acteur;

export function declarationOutil(cle: string): DeclarationOutil {
  const outil = modulesActifs().flatMap((m) => m.outils).find((o) => o.cle === cle);
  if (!outil) throw introuvable();
  return outil;
}
function declaration(cle: string): { module: DeclarationModule; outil?: DeclarationOutil; reglages: Reglages } {
  const module = modulesActifs().find((m) => m.nom === cle || m.outils.some((o) => o.cle === cle));
  if (!module) throw introuvable();
  const outil = module.outils.find((o) => o.cle === cle);
  return { module, outil, reglages: outil?.reglages ?? module.reglagesCommuns };
}
function systeme(db: Db, systemeId: number): { id: number; nom: string; responsable_id: number | null } {
  const s = db.prepare('SELECT id, nom, responsable_id FROM systemes_jeu WHERE id = ?').get(systemeId) as
    { id: number; nom: string; responsable_id: number | null } | undefined;
  if (!s) throw introuvable();
  return s;
}
function systemeDeCible(db: Db, cible: CibleOutils) {
  if (cible.niveau === 'systeme') return systeme(db, cible.id);
  const u = db.prepare('SELECT systeme_id FROM univers WHERE id = ?').get(cible.id) as
    { systeme_id: number | null } | undefined;
  if (!u || u.systeme_id === null) throw introuvable();
  return systeme(db, u.systeme_id);
}
function exigerApplicable(db: Db, cible: CibleOutils, cle: string) {
  const d = declaration(cle);
  const s = systemeDeCible(db, cible);
  if (d.outil ? !applicable(d.outil, s.nom) : !d.module.outils.some((o) => applicable(o, s.nom))) throw introuvable();
  return { ...d, systeme: s };
}
const estMJRattache = (db: Db, compteId: number, systemeId: number) => !!db.prepare(
  `SELECT 1 FROM membres m JOIN univers u ON u.id = m.univers_id
   WHERE u.systeme_id = ? AND m.compte_id = ? AND m.role = 'mj' LIMIT 1`,
).get(systemeId, compteId);

/** Ownership is effective only while attached as GM, or before the first universe is attached. */
export function responsableEffectif(db: Db, systemeId: number): number | null {
  const s = systeme(db, systemeId);
  if (s.responsable_id === null) return null;
  const rattache = db.prepare('SELECT 1 FROM univers WHERE systeme_id = ? LIMIT 1').get(systemeId);
  return !rattache || estMJRattache(db, s.responsable_id, systemeId) ? s.responsable_id : null;
}
export function exigerResponsable(db: Db, compte: number | Acteur, systemeId: number): void {
  const acteur = acteurDe(compte);
  const responsable = responsableEffectif(db, systemeId);
  const mj = estMJRattache(db, acteur.compteId, systemeId);
  if (responsable !== acteur.compteId && !mj) throw introuvable();
  if (acteur.modeJoueur || (responsable !== null && responsable !== acteur.compteId)) throw refuse();
}
export function transfererResponsabilite(db: Db, compte: number | Acteur, systemeId: number, versCompteId: number): void {
  db.transaction(() => {
    exigerResponsable(db, compte, systemeId);
    if (!estMJRattache(db, versCompteId, systemeId)) throw invalide('compte', "Ce compte n'est plus MJ d'un univers de ce système.");
    db.prepare('UPDATE systemes_jeu SET responsable_id = ? WHERE id = ?').run(versCompteId, systemeId);
  })();
}
/** Seed-only fixture of a system predating ownership; never exposed by a route. */
export function creerSystemeAncienPourBouchon(db: Db, nom: string): { id: number; nom: string } {
  if (env.KANEVAS_STUB !== '1' && env.NODE_ENV !== 'test') throw refuse();
  const info = db.prepare('INSERT INTO systemes_jeu (nom, cree_le) VALUES (?, ?)').run(nom, new Date().toISOString());
  return { id: Number(info.lastInsertRowid), nom };
}
function exigerEcriture(db: Db, compte: number | Acteur, cible: CibleOutils): void {
  const acteur = acteurDe(compte);
  if (cible.niveau === 'systeme') exigerResponsable(db, acteur, cible.id);
  else {
    if (roleDe(db, cible.id, acteur.compteId) !== 'mj') throw introuvable();
    exigerMJ(db, cible.id, acteur.compteId);
    if (acteur.modeJoueur) throw refuse();
  }
}
const table = (cible: CibleOutils) => cible.niveau === 'systeme'
  ? { nom: 'outils_systeme', id: 'systeme_id' } : { nom: 'outils_univers', id: 'univers_id' };

/** Raw level values for the settings interface; permissions remain the caller service's guard. */
export function lireLigneOutil(db: Db, cible: CibleOutils, cle: string): LigneOutil | undefined {
  const t = table(cible);
  return db.prepare(`SELECT active, visibilite_mj, visibilite_joueur, reglages, version_reglages, version_catalogue
    FROM ${t.nom} WHERE ${t.id} = ? AND outil = ?`).get(cible.id, cle) as LigneOutil | undefined;
}
function resoudreReglages(reglages: Reglages, s?: LigneOutil, u?: LigneOutil): ResolutionReglages {
  const systeme = JSON.parse(s?.reglages ?? '{}') as Record<string, ValeurReglage>;
  const univers = JSON.parse(u?.reglages ?? '{}') as Record<string, ValeurReglage>;
  return {
    reglages: Object.fromEntries(Object.entries(reglages).map(([nom, r]) => {
      const valeurUnivers = Object.hasOwn(univers, nom) ? univers[nom] : undefined;
      const valeurSysteme = r.niveau !== 'univers' && Object.hasOwn(systeme, nom) ? systeme[nom] : undefined;
      const v: ValeurResolue = valeurUnivers != null ? { valeur: valeurUnivers, origine: 'univers' }
        : valeurSysteme != null ? { valeur: valeurSysteme, origine: 'systeme' }
        : { valeur: r.defaut, origine: 'defaut' };
      return [nom, v];
    })),
    versionReglages: { systeme: s?.version_reglages ?? 0, univers: u?.version_reglages ?? 0 },
  };
}
function resolution(db: Db, cible: CibleOutils, cle: string): ResolutionOutil {
  const d = exigerApplicable(db, cible, cle);
  if (!d.outil) throw introuvable();
  const s = lireLigneOutil(db, { niveau: 'systeme', id: d.systeme.id }, cle);
  const u = cible.niveau === 'univers' ? lireLigneOutil(db, cible, cle) : undefined;
  const sc = lireLigneOutil(db, { niveau: 'systeme', id: d.systeme.id }, d.module.nom);
  const uc = cible.niveau === 'univers' ? lireLigneOutil(db, cible, d.module.nom) : undefined;
  return {
    active: Boolean(u?.active ?? s?.active ?? false),
    visibilite: { mj: Boolean(u?.visibilite_mj ?? s?.visibilite_mj ?? d.outil.visibiliteParDefaut.mj),
      joueur: Boolean(u?.visibilite_joueur ?? s?.visibilite_joueur ?? d.outil.visibiliteParDefaut.joueur) },
    ...resoudreReglages(d.reglages, s, u), communs: resoudreReglages(d.module.reglagesCommuns, sc, uc),
  };
}
export const resoudreOutil = (db: Db, universId: number, cle: string): ResolutionOutil =>
  resolution(db, { niveau: 'univers', id: universId }, cle);
export const resoudreOutilSysteme = (db: Db, systemeId: number, cle: string): ResolutionOutil =>
  resolution(db, { niveau: 'systeme', id: systemeId }, cle);

export function accessible(db: Db, acteur: Acteur, universId: number, cle: string): boolean {
  const role = roleDe(db, universId, acteur.compteId);
  if (!role) return false;
  try {
    const r = resoudreOutil(db, universId, cle);
    return r.active && (vueMJ(role, acteur) ? r.visibilite.mj : r.visibilite.joueur);
  } catch (e) {
    if (e instanceof ErreurService && e.code === 'introuvable') return false;
    throw e;
  }
}
export function exigerOutil(db: Db, acteur: Acteur, universId: number, cle: string): ResolutionOutil {
  if (!accessible(db, acteur, universId, cle)) throw introuvable();
  return resoudreOutil(db, universId, cle);
}
export function peutUsage(db: Db, acteur: Acteur, universId: number, cle: string, usage: string): boolean {
  if (!accessible(db, acteur, universId, cle)) return false;
  const u = declarationOutil(cle).usages.find((u) => u.nom === usage);
  const role = roleDe(db, universId, acteur.compteId);
  return !!u && !!role && (!u.mjSeul || vueMJ(role, acteur));
}
export function exigerUsage(db: Db, acteur: Acteur, universId: number, cle: string, usage: string): void {
  exigerOutil(db, acteur, universId, cle);
  if (!peutUsage(db, acteur, universId, cle, usage)) throw refuse();
}
/** The map contract's common reader also enforces the item-level visibility rule. */
export function listerCartesOutil(db: Db, acteur: Acteur, universId: number, cle: string): CarteOutil[] {
  exigerOutil(db, acteur, universId, cle);
  const outil = declarationOutil(cle);
  if (outil.type !== 'carte') throw introuvable();
  const role = roleDe(db, universId, acteur.compteId)!;
  return outil.cartes(db, acteur, universId).filter((c) => vueMJ(role, acteur) || c.visible);
}
function assurerLigne(db: Db, cible: CibleOutils, cle: string): void {
  const t = table(cible);
  const { outil } = declaration(cle);
  const vis = outil?.visibiliteParDefaut ?? { mj: true, joueur: true };
  db.prepare(`INSERT INTO ${t.nom} (${t.id}, outil, active, visibilite_mj, visibilite_joueur)
    VALUES (?, ?, ?, ?, ?) ON CONFLICT (${t.id}, outil) DO NOTHING`).run(cible.id, cle,
    cible.niveau === 'univers' ? null : 0, cible.niveau === 'univers' ? null : Number(vis.mj),
    cible.niveau === 'univers' ? null : Number(vis.joueur));
}
export function poserActivation(db: Db, compte: number | Acteur, cible: CibleOutils, cle: string, active: boolean | null): void {
  db.transaction(() => {
    exigerEcriture(db, compte, cible);
    const { outil, module, systeme } = exigerApplicable(db, cible, cle);
    if (!outil) throw introuvable();
    if (typeof active !== 'boolean' && !(active === null && cible.niveau === 'univers')) throw invalide('active');
    assurerLigne(db, cible, cle);
    const t = table(cible);
    db.prepare(`UPDATE ${t.nom} SET active = ? WHERE ${t.id} = ? AND outil = ?`).run(active === null ? null : Number(active), cible.id, cle);
    if (resolution(db, cible, cle).active) {
      for (const dep of outil.dependances) {
        const dependance = declarationOutil(dep);
        if (!applicable(dependance, systeme.nom) || !resolution(db, cible, dep).active) throw new ErreurService('conflit',
          `${outil.libelle} demande ${dependance.libelle} : activez-le d'abord.`, 'dependance');
      }
    } else {
      for (const dependant of module.outils.filter((o) => applicable(o, systeme.nom) && o.dependances.includes(cle))) {
        if (resolution(db, cible, dependant.cle).active) throw new ErreurService('conflit',
          `${dependant.libelle} demande ${outil.libelle} : désactivez-le d'abord.`, 'dependant');
      }
    }
  })();
}
export function poserVisibilite(db: Db, compte: number | Acteur, cible: CibleOutils, cle: string,
  valeurs: { mj?: boolean | null; joueur?: boolean | null }): void {
  db.transaction(() => {
    exigerEcriture(db, compte, cible);
    if (!exigerApplicable(db, cible, cle).outil) throw introuvable();
    if (!valeurs || typeof valeurs !== 'object' || Array.isArray(valeurs)) throw invalide('visibilite');
    for (const [nom, valeur] of Object.entries(valeurs)) {
      if (!['mj', 'joueur'].includes(nom) || (typeof valeur !== 'boolean' && !(valeur === null && cible.niveau === 'univers'))) {
        throw invalide(nom);
      }
    }
    assurerLigne(db, cible, cle);
    const t = table(cible);
    for (const nom of ['mj', 'joueur'] as const) {
      if (Object.hasOwn(valeurs, nom)) {
        const valeur = valeurs[nom];
        db.prepare(`UPDATE ${t.nom} SET visibilite_${nom} = ? WHERE ${t.id} = ? AND outil = ?`)
          .run(valeur === null ? null : Number(valeur), cible.id, cle);
      }
    }
  })();
}
export function poserReglages(db: Db, compte: number | Acteur, cible: CibleOutils, cle: string,
  entree: { version: number; valeurs: Record<string, ValeurReglage | null>; confirme?: boolean }): void {
  db.transaction(() => {
    exigerEcriture(db, compte, cible);
    const { reglages } = exigerApplicable(db, cible, cle);
    if (!entree || !Number.isInteger(entree.version) || entree.version < 0) throw invalide('version');
    if (!entree.valeurs || typeof entree.valeurs !== 'object' || Array.isArray(entree.valeurs)) throw invalide('valeurs');
    for (const [nom, valeur] of Object.entries(entree.valeurs)) {
      const r = Object.hasOwn(reglages, nom) ? reglages[nom] : undefined;
      if (!r || (r.niveau === 'univers' && cible.niveau === 'systeme')) throw invalide(nom);
      if (!(valeur === null && cible.niveau === 'univers') && !schemaValeur(r.forme).safeParse(valeur).success) throw invalide(nom);
      if (r.protege && entree.confirme !== true) throw invalide(nom, 'Confirmation requise.', 'confirmation_requise');
    }
    const ligne = lireLigneOutil(db, cible, cle);
    if ((ligne?.version_reglages ?? 0) !== entree.version) {
      throw new ErreurService('conflit', "Ce réglage a changé depuis que vous l'avez ouvert.", 'version');
    }
    let valeurs = JSON.parse(ligne?.reglages ?? '{}') as Record<string, ValeurReglage>;
    for (const [nom, valeur] of Object.entries(entree.valeurs)) {
      if (valeur === null) delete valeurs[nom];
      else valeurs = { ...valeurs, [nom]: valeur };
    }
    assurerLigne(db, cible, cle);
    const t = table(cible);
    db.prepare(`UPDATE ${t.nom} SET reglages = ?, version_reglages = version_reglages + 1
      WHERE ${t.id} = ? AND outil = ?`).run(JSON.stringify(valeurs), cible.id, cle);
  })();
}

// ---- Reads for the common API (C-5) -------------------------------------------------------

export interface EntreeOutil { cle: string; libelle: string; icone: string; chemin: string }
/** The sidebar's entries: tools enabled and visible to the actor, nothing about the hidden ones. */
export function entreesOutils(db: Db, acteur: Acteur, universId: number): EntreeOutil[] {
  const role = roleDe(db, universId, acteur.compteId);
  if (!role) throw introuvable();
  return modulesActifs().flatMap((m) => m.outils)
    .filter((o) => accessible(db, acteur, universId, o.cle))
    .map((o) => ({ cle: o.cle, libelle: o.ecran.libelle, icone: o.ecran.icone, chemin: `/univers/${universId}/outils/${o.cle}` }));
}

const vueReglages = (reglages: Reglages) => Object.entries(reglages).map(([nom, r]) => ({ nom, ...r }));

export interface DescriptionOutil {
  cle: string; libelle: string; type: string; description: string; dependances: string[];
  usages: { nom: string; mjSeul: boolean }[]; reglages: ReturnType<typeof vueReglages>;
  valeurs: Record<string, ValeurResolue>; communs: Record<string, ValeurResolue>;
}
/** What an actor who can use the tool learns about it; `introuvable` otherwise. */
export function decrireOutil(db: Db, acteur: Acteur, universId: number, cle: string): DescriptionOutil {
  const r = exigerOutil(db, acteur, universId, cle);
  const o = declarationOutil(cle);
  return { cle: o.cle, libelle: o.libelle, type: o.type, description: o.description, dependances: o.dependances,
    usages: o.usages, reglages: vueReglages(o.reglages), valeurs: r.reglages, communs: r.communs.reglages };
}

interface NiveauVu {
  active: boolean | null;
  visibilite: { mj: boolean | null; joueur: boolean | null };
  valeurs: Record<string, ValeurReglage>;
  versionReglages: number;
}
const niveauVu = (l: LigneOutil | undefined, defaut: { active: boolean; mj: boolean; joueur: boolean } | null): NiveauVu => {
  const b = (v: number | null | undefined, d: boolean | null) => v === null || v === undefined ? d : Boolean(v);
  return {
    active: b(l?.active, defaut?.active ?? null),
    visibilite: { mj: b(l?.visibilite_mj, defaut?.mj ?? null), joueur: b(l?.visibilite_joueur, defaut?.joueur ?? null) },
    valeurs: JSON.parse(l?.reglages ?? '{}') as Record<string, ValeurReglage>,
    versionReglages: l?.version_reglages ?? 0,
  };
};
export interface VueOutils {
  ecriture: boolean;
  responsable?: { id: number; nom: string; vousEtes: boolean } | null;
  outils: {
    cle: string; module: string; libelle: string; description: string; type: string; dependances: string[];
    usages: { nom: string; mjSeul: boolean }[]; reglages: ReturnType<typeof vueReglages>;
    systeme: NiveauVu; univers: NiveauVu | null;
    effectif: { active: boolean; visibilite: { mj: boolean; joueur: boolean }; reglages: Record<string, ValeurResolue> };
  }[];
  communs: { module: string; libelle: string; reglages: ReturnType<typeof vueReglages>;
    systeme: NiveauVu; univers: NiveauVu | null; effectif: Record<string, ValeurResolue> }[];
}
/** E-20: every applicable tool, even disabled, both levels side by side. GM of the universe / of an attached universe only. */
export function lireOutils(db: Db, acteur: Acteur, cible: CibleOutils): VueOutils {
  let ecriture: boolean;
  let responsable: VueOutils['responsable'];
  let systemeId: number | null;
  if (cible.niveau === 'univers') {
    if (roleDe(db, cible.id, acteur.compteId) !== 'mj' || acteur.modeJoueur) throw introuvable();
    ecriture = true;
    systemeId = (db.prepare('SELECT systeme_id FROM univers WHERE id = ?').get(cible.id) as { systeme_id: number | null }).systeme_id;
  } else {
    systeme(db, cible.id);
    if (!estMJRattache(db, acteur.compteId, cible.id) || acteur.modeJoueur) throw introuvable();
    const id = responsableEffectif(db, cible.id);
    ecriture = id === null || id === acteur.compteId;
    const nom = id === null ? undefined : (db.prepare('SELECT username FROM comptes WHERE id = ?').get(id) as { username: string } | undefined)?.username;
    responsable = id === null || nom === undefined ? null : { id, nom, vousEtes: id === acteur.compteId };
    systemeId = cible.id;
  }
  const vide: VueOutils = { ecriture, outils: [], communs: [] };
  if (responsable !== undefined) vide.responsable = responsable;
  if (systemeId === null) return vide;
  const nomSysteme = systeme(db, systemeId).nom;
  const sys = (cle: string) => lireLigneOutil(db, { niveau: 'systeme', id: systemeId }, cle);
  const uni = (cle: string) => cible.niveau === 'univers' ? lireLigneOutil(db, cible, cle) : undefined;
  for (const m of modulesActifs()) {
    const outils = m.outils.filter((o) => applicable(o, nomSysteme));
    if (outils.length === 0) continue;
    for (const o of outils) {
      const r = resolution(db, cible, o.cle);
      vide.outils.push({
        cle: o.cle, module: m.nom, libelle: o.libelle, description: o.description, type: o.type,
        dependances: o.dependances, usages: o.usages, reglages: vueReglages(o.reglages),
        systeme: niveauVu(sys(o.cle), { active: false, ...o.visibiliteParDefaut }),
        univers: cible.niveau === 'univers' ? niveauVu(uni(o.cle), null) : null,
        effectif: { active: r.active, visibilite: r.visibilite, reglages: r.reglages },
      });
    }
    const rc = resoudreReglages(m.reglagesCommuns, sys(m.nom), uni(m.nom));
    vide.communs.push({ module: m.nom, libelle: m.libelle, reglages: vueReglages(m.reglagesCommuns),
      systeme: niveauVu(sys(m.nom), null), univers: cible.niveau === 'univers' ? niveauVu(uni(m.nom), null) : null,
      effectif: rc.reglages });
  }
  return vide;
}

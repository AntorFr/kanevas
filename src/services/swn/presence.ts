// « Sur la carte spatiale » (AD-liens-3, E-9): where a sheet sits on the galaxy, read only. A line shows only for a body
// or a zone of a system the reader reads — same galaxy and system filters as `lireInterieur` (`galaxieLisible`'s
// visibility rule, `FILTRE_SYSTEMES`) — and nothing says how many lines are hidden or cut.
import type { Db } from '../../db/db.js';
import type { BlocFiche } from '../../outils/declaration.js';
import { FILTRE_SYSTEMES, niveauLecture } from './galaxies.js';
import type { Acteur } from '../types.js';

export const MAX_LIGNES_PRESENCE = 50;

interface Rangee {
  gid: number; q: number; r: number; ordre: number; genre: 0 | 1; id: number; texte: string;
}
interface LigneAstreP {
  id: number; gid: number; q: number; r: number; sys_nom: string; nom: string | null; genre: string;
  orbite: number | null; heure: number; parent_nom: string | null; parent_orbite: number | null; parent_id: number | null;
}
interface LigneFormationP {
  id: number; gid: number; q: number; r: number; sys_nom: string; nom: string | null; forme: string; parametres: string;
}

/** A number to two decimals at most, with the French comma (« 2,9 »). */
const nombre = (n: number): string => String(Math.round(n * 100) / 100).replace('.', ',');
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** « système Vael »; a nameless or default-named system reads as E-23's header does, without the word « système ». */
function systemeTexte(nom: string, q: number, r: number): string {
  if (nom === '') return `Système sans nom (${q}, ${r})`;
  if (nom === `Système (${q}, ${r})`) return nom;
  return `système ${nom}`;
}

export function presenceDeFiche(db: Db, acteur: Acteur, universId: number, ficheId: number): BlocFiche | null {
  // A database mid-way through its migrations (the « montée » tests seed it before 0038) has no interior tables yet: no line.
  if (!db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'swn_astres'`).get()) return null;
  const niveau = niveauLecture(db, acteur, universId);
  if (!niveau) return null;
  const garde = `s.univers_id = ? AND ${FILTRE_SYSTEMES[niveau]}${niveau === 'mj' ? '' : ' AND g.visible = 1'}`;
  const astres = db.prepare(`SELECT a.id, g.id AS gid, s.q, s.r, s.nom AS sys_nom, a.nom, a.genre, a.orbite, a.heure,
      p.nom AS parent_nom, p.orbite AS parent_orbite, a.parent_id
    FROM swn_astres a JOIN swn_systemes s ON s.id = a.systeme_id JOIN swn_galaxies g ON g.id = s.galaxie_id
    LEFT JOIN swn_astres p ON p.id = a.parent_id
    WHERE a.fiche_id = ? AND ${garde}`).all(ficheId, universId) as LigneAstreP[];
  const formations = db.prepare(`SELECT f.id, g.id AS gid, s.q, s.r, s.nom AS sys_nom, f.nom, f.forme, f.parametres
    FROM swn_formations f JOIN swn_systemes s ON s.id = f.systeme_id JOIN swn_galaxies g ON g.id = s.galaxie_id
    WHERE f.fiche_id = ? AND ${garde}`).all(ficheId, universId) as LigneFormationP[];

  const rangees: Rangee[] = [];
  for (const a of astres) {
    const nom = a.nom !== null && a.nom !== '' ? a.nom : 'Astre sans nom';
    const base = `${nom} — ${systemeTexte(a.sys_nom, a.q, a.r)}`;
    let place: string;
    if (a.genre === 'lune') {
      const planete = a.parent_nom !== null && a.parent_nom !== '' ? a.parent_nom : 'Astre sans nom';
      place = `, lune de ${planete}${a.orbite === null ? '' : `, orbite ${nombre(a.orbite)}`} · ${nombre(a.heure)} h`;
    } else {
      place = a.orbite === null ? '' : `, orbite ${nombre(a.orbite)} · ${nombre(a.heure)} h`;
    }
    // A moon follows its planet: it sorts on the orbit of the planet it turns around, after her.
    const ordre = a.orbite ?? a.parent_orbite ?? 0;
    rangees.push({ gid: a.gid, q: a.q, r: a.r, ordre, genre: 0, id: a.id, texte: base + place });
  }
  for (const f of formations) {
    const p = JSON.parse(f.parametres) as Record<string, unknown>;
    const nom = f.nom !== null && f.nom !== '' ? f.nom : 'Zone sans nom';
    let place = '';
    let ordre = 0;
    if (f.forme === 'anneau') {
      const de = num(p.de), a = num(p.a);
      ordre = de ?? 0;
      if (de !== null && a !== null) place = `, orbite ${nombre(de)} à ${nombre(a)}`;
    } else if (f.forme === 'nuage') {
      ordre = num(p.orbite) ?? 0;
      place = ', nuage';
    } else {
      const o = num(p.orbite), h = num(p.heure);
      ordre = o ?? 0;
      if (o !== null) place = h === null ? `, orbite ${nombre(o)}` : `, orbite ${nombre(o)} · ${nombre(h)} h`;
    }
    rangees.push({
      gid: f.gid, q: f.q, r: f.r, ordre, genre: 1, id: f.id,
      texte: `${nom} — ${systemeTexte(f.sys_nom, f.q, f.r)}${place}`,
    });
  }
  if (rangees.length === 0) return null;
  // Galaxy, hexagon, then orbit; on the same orbit bodies come before zones.
  rangees.sort((x, y) => x.gid - y.gid || x.q - y.q || x.r - y.r || x.ordre - y.ordre || x.genre - y.genre || x.id - y.id);
  return {
    cle: 'swn/galaxie', titre: 'Sur la carte spatiale',
    lignes: rangees.slice(0, MAX_LIGNES_PRESENCE).map((x) => ({
      texte: x.texte, adresse: `/univers/${universId}/outils/swn/galaxie/${x.gid}/interieur/${x.q}/${x.r}`,
    })),
  };
}

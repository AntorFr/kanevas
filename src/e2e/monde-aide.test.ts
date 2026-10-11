// Shared world of the black-box tests of kanevas-monde (no test of its own; named *.test.ts because tsc excludes tests and must not compile it):
// Antor GM and Léa player of « Lame d'Ébène », the sheet « Maître Aldric » whose « Vérité » says « Il sert la Couronne. »,
// report « Séance 3 » written by Léa. Everything goes through the real HTTP API of the real server.
import { type Any, connecte, startServer } from './harnais.test.js';

export const CR_DEMANDE =
  'Mets à jour la section « Vérité » de « Maître Aldric » d\'après le compte-rendu « Séance 3 »';
export const VERITE = 'Il sert la Couronne.';

export interface Monde {
  univers: number;
  fiche: number;
  section: number;
  cr: number;
}

export async function json(r: Any): Promise<Any> {
  const t = await r.text();
  try {
    return t ? JSON.parse(t) : null;
  } catch {
    return t;
  }
}

export async function comptes(srv: Awaited<ReturnType<typeof startServer>>, browser: Any) {
  return {
    antor: await connecte(browser, srv.base, 'Antor'),
    lea: await connecte(browser, srv.base, 'Léa'),
    mira: await connecte(browser, srv.base, 'Mira'),
    admin: await connecte(browser, srv.base, 'Admin'),
  };
}

/** A fresh universe (one per test, so tests do not see each other's proposals). */
export async function bati(antor: Any, lea: Any, nom = "Lame d'Ébène"): Promise<Monde> {
  const post = async (c: Any, url: string, data: unknown) => {
    const r = await c.ctx.request.post(url, { data });
    if (r.status() >= 300) throw new Error(`${url} -> ${r.status()} ${await r.text()}`);
    return json(r);
  };
  const u = await post(antor, '/api/univers', { nom });
  await post(antor, `/api/univers/${u.id}/membres`, { username: 'lea', role: 'joueur' });
  const f = await post(antor, `/api/univers/${u.id}/fiches`, { type: 'personnage', titre: 'Maître Aldric', charge: { v: 1, pj: false } });
  const s = await post(antor, `/api/univers/${u.id}/fiches/${f.id}/sections`, { titre: 'Vérité', contenu: VERITE });
  const c = await post(antor, `/api/univers/${u.id}/campagnes`, { nom: 'La Couronne brisée' });
  const cr = await post(lea, `/api/univers/${u.id}/comptes-rendus`, { campagneId: c.id, titre: 'Séance 3', texte: 'Aldric a livré la clef de la crypte à la Couronne.' });
  return { univers: u.id, fiche: f.id, section: s.id, cr: cr.id };
}

export const sectionUrl = (m: Monde) => `/api/univers/${m.univers}/fiches/${m.fiche}/sections/${m.section}`;

export async function lireSection(c: Any, m: Monde): Promise<{ contenu: string; version: number }> {
  return json(await c.ctx.request.get(sectionUrl(m)));
}

/** Antor asks for the update through the assistant route; returns the answer. */
export async function demander(c: Any, m: Monde, message = CR_DEMANDE): Promise<Any> {
  const r = await c.ctx.request.post(`/api/univers/${m.univers}/assistant/messages`, { data: { message } });
  return { status: r.status(), ...(await json(r)) };
}

export const propUrl = (m: Monde, pid: number | string) => `/api/univers/${m.univers}/propositions/${pid}`;
export const idProposition = (rep: Any): number => rep.evenements[0].cible.propositionId;

export async function modifierSection(c: Any, m: Monde, contenu: string): Promise<void> {
  const cur = await lireSection(c, m);
  const r = await c.ctx.request.put(`${sectionUrl(m)}/contenu`, { data: { contenu, version: cur.version } });
  if (r.status() >= 300) throw new Error(`modifier -> ${r.status()} ${await r.text()}`);
}

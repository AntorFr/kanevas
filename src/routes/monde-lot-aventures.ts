// Shared world of the doors written by the « aventures » lot (docs/tests-ecran/lot-aventures.md): the app in stub mode,
// Antor GM of « Lame » (Léa and Teo players), Mira GM of « Ailleurs » only. Not a test file.
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
export type App = Awaited<ReturnType<typeof buildApp>>;
export type Hote = { cookie: string };
export type Verbe = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

async function connecter(app: App, compte: string): Promise<Hote> {
  const res = await app.inject({
    method: 'POST',
    url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: `compte=${compte}`,
  });
  const c = res.cookies.find((x) => x.name === 'kanevas_session');
  assert.ok(c);
  return { cookie: `kanevas_session=${c.value}` };
}

export async function monter() {
  const app = await buildApp();
  const antor = await connecter(app, 'antor');
  const lea = await connecter(app, 'lea');
  const teo = await connecter(app, 'teo');
  const mira = await connecter(app, 'mira');
  const appel = (h: Hote, method: Verbe, url: string, payload?: object) => app.inject({ method, url, headers: h, payload });
  const u = (await appel(antor, 'POST', '/api/univers', { nom: 'Lame' })).json();
  const base = `/api/univers/${u.id}`;
  await appel(antor, 'POST', `${base}/membres`, { username: 'lea' });
  await appel(antor, 'POST', `${base}/membres`, { username: 'teo' });
  const n = (t: string) => (app.db.prepare(`SELECT COUNT(*) n FROM ${t}`).get() as { n: number }).n;
  const creer = async (h: Hote, corps: object) => {
    const r = await appel(h, 'POST', `${base}/fiches`, corps);
    assert.equal(r.statusCode, 201, r.body);
    return r.json() as { id: number; titre: string };
  };
  /** An open campaign « En cours » (Présentation read by the players). */
  const campagneOuverte = async (titre = 'La Couronne brisée') => {
    const c = await creer(antor, { type: 'aventure', sousType: 'Campagne', titre, sections: [{ titre: 'Présentation', joueursLisent: true }] });
    assert.equal((await appel(antor, 'PATCH', `${base}/fiches/${c.id}`, { statut: 'en_cours' })).statusCode, 200);
    return c;
  };
  /** A scenario under a campaign, closed to the players. */
  const scenarioFerme = (parent: number, titre = 'Acte II') =>
    creer(antor, { type: 'aventure', sousType: 'Scénario', titre, parent, sections: [{ titre: 'Scénario', joueursLisent: false }] });
  return { app, antor, lea, teo, mira, base, appel, n, creer, campagneOuverte, scenarioFerme };
}

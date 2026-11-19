// Door of the lot « vaisseaux » for `src/e2e/format-evolue-amendes-ensemble.test.ts` (B-80, amended criterion): the exact free mass of a
// hull of mass 7, read through the calculation route. The screen file keeps what the user reads (« 5,5 », « 7 », no mass used).
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { startServer, type Any, type Server } from './serveur-lot-vaisseaux.ts';

const servers: Server[] = [];
after(() => servers.forEach((s) => s.stop()));

interface Rep { status: number; json: Any; texte: string }
type Api = (compte: string, methode: string, chemin: string, corps?: unknown) => Promise<Rep>;

async function session(): Promise<{ base: string; api: Api; E: number }> {
  const srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
  servers.push(srv);
  const cookies: Record<string, string> = {};
  const api: Api = async (compte, methode, chemin, corps) => {
    if (!cookies[compte]) {
      const r = await fetch(`${srv.base}/connexion-bouchon`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `compte=${compte}` });
      cookies[compte] = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
    }
    const r = await fetch(srv.base + chemin, { method: methode, headers: { cookie: cookies[compte], ...(corps === undefined ? {} : { 'content-type': 'application/json' }) }, body: corps === undefined ? undefined : JSON.stringify(corps) });
    const texte = await r.text();
    let json: Any = null;
    try { json = JSON.parse(texte); } catch { /* not JSON */ }
    return { status: r.status, json, texte };
  };
  const E = ((await api('antor', 'GET', '/api/univers')).json as Any[]).find((u) => u.nom === "Éneria d'essai").id as number;
  return { base: srv.base, api, E, jeton: srv.jeton };
}

describe('B-80 (critère amendé) : masse libre exacte d’une coque de masse 7, sans masse utilisée', () => {
  const CLE = 'coupleur-essai';
  async function monde() {
    const s = await session();
    const V = `/api/univers/${s.E}/outils/swn/vaisseaux`;
    const jeton = s.jeton('antor', s.E, 'Script masses', ['swn/vaisseaux']);
    const imp = (methode: string, chemin: string, corps?: unknown) =>
      fetch(`${s.base}/api/import/v1/univers/${s.E}${chemin}`, { method: methode, headers: { authorization: `Bearer ${jeton}`, ...(corps === undefined ? {} : { 'content-type': 'application/json' }) }, body: corps === undefined ? undefined : JSON.stringify(corps) });
    const lot = ((await (await imp('POST', '/lots?outil=swn/vaisseaux')).json()) as Any).lotId as number;
    const r = await imp('PUT', `/outils/swn/vaisseaux/catalogue?niveau=univers&lot=${lot}`, {
      catalogue: 'swn/vaisseaux', version: 'essai-amende',
      coques: [{ cle: 'coque-sept', nom: 'Coque de sept', classe: 1, cout: 1000, pv: 5, ca: 10, puissance: 10, masse: 7, emports: 6, facteur_cout: 1, facteur_puissance: 1, facteur_masse: 1 }],
      amenagements: [{ cle: CLE, nom: "Coupleur d'essai", cout: 4, puissance: 0, masse: 0.5, x_cout: false, x_puissance: false, x_masse: false, pv: 0, ca: 0, limite: 0 }],
    });
    assert.equal(r.status, 200, await r.text());
    const aube = (await s.api('antor', 'GET', `${V}/conceptions`)).json.fichesSansConception.find((f: Any) => f.titre === 'Aube de Sel').ficheId as number;
    return { ...s, V, aube };
  }

  it('API : coque de masse 7 + trois éléments de 0,5 → masse libre exactement 5.5 ; sans élément → exactement 7 ; à seize… la coque de 7 en porte quatorze (7 − 7 = 0), le quinzième donne −0.5 et l’alerte', async () => {
    const m = await monde();
    const calc = async (q: number) => (await m.api('lea', 'POST', `${m.V}/calcul`, { coque: 'coque-sept', choix: q ? [{ nature: 'amenagements', cle: CLE, quantite: q }] : [] })).json;
    assert.equal((await calc(3)).resultat.masseLibre, 5.5);
    assert.equal((await calc(0)).resultat.masseLibre, 7);
    const zero = await calc(14);
    assert.equal(zero.resultat.masseLibre, 0);
    assert.ok(!(zero.alertes as Any[]).some((a) => a.code === 'masse_insuffisante'));
    const neg = await calc(15);
    assert.equal(neg.resultat.masseLibre, -0.5);
    assert.ok((neg.alertes as Any[]).some((a) => a.code === 'masse_insuffisante'));
  });
});

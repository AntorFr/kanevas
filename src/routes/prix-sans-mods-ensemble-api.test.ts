// Feature-level black-box tests of rouge-kanevas-concepteur-vaisseaux-2, price side: written from docs/vaisseaux-regles.md § 13.1
// and § 6 (the price of a modification is NOT in the ship's price; it is shown on its own line), not from the code.
// The app listens in this process (serveur-lot-vaisseaux), real SQLite; the door is POST .../vaisseaux/calcul, no browser.
// Hand values (trial catalogue): hull « Éclaireur » costs 20 000 (factor 1); « Renfort de coque » (modification) costs 5 000.
// Upkeep is 5 % of the price (§ 13.1: 255 000 -> 12 750).
//   nominal   : hull + 1 Renfort -> prix 20 000, entretien 1 000
//   bords     : no mod -> same 20 000 / 1 000; 3 Renforts -> still 20 000 / 1 000
//   exclusion : an amenagement of cost 700 stays in the price: 20 700 / 1 035 (the rule concerns modifications only)
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { startServer, type Any, type Server } from './serveur-lot-vaisseaux.ts';

const servers: Server[] = [];
after(() => { servers.forEach((s) => s.stop()); });

async function monde() {
  const srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
  servers.push(srv);
  const r = await fetch(`${srv.base}/connexion-bouchon`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'compte=lea' });
  const cookie = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
  const api = async (methode: string, chemin: string, corps?: unknown) => {
    const rep = await fetch(srv.base + chemin, { method: methode, headers: { cookie, ...(corps === undefined ? {} : { 'content-type': 'application/json' }) }, body: corps === undefined ? undefined : JSON.stringify(corps) });
    const texte = await rep.text();
    let json: Any = null;
    try { json = JSON.parse(texte); } catch { /* not JSON */ }
    return { status: rep.status, json, texte };
  };
  const E = ((await api('GET', '/api/univers')).json as Any[]).find((u) => u.nom === "Éneria d'essai").id as number;
  return { srv, api, V: `/api/univers/${E}/outils/swn/vaisseaux`, E };
}

describe('B-95 § 13.1 : le prix d’un vaisseau n’inclut pas ses modifications', { timeout: 120000 }, () => {
  it('une modification de 5 000 ne change ni le prix (20 000) ni l’entretien (1 000)', async () => {
    const m = await monde();
    const r = await m.api('POST', `${m.V}/calcul`, { coque: 'eclaireur', choix: [{ nature: 'modifications', cle: 'renfort', quantite: 1 }] });
    assert.equal(r.status, 200, r.texte);
    assert.equal(r.json.resultat.prix, 20000);
    assert.equal(r.json.resultat.entretien, 1000);
  });
  it('sans modification : 20 000 et 1 000 ; trois modifications : inchangé', async () => {
    const m = await monde();
    const zero = await m.api('POST', `${m.V}/calcul`, { coque: 'eclaireur', choix: [] });
    assert.equal(zero.json.resultat.prix, 20000);
    assert.equal(zero.json.resultat.entretien, 1000);
    const trois = await m.api('POST', `${m.V}/calcul`, { coque: 'eclaireur', choix: [{ nature: 'modifications', cle: 'renfort', quantite: 3 }] });
    assert.equal(trois.status, 200, trois.texte);
    assert.equal(trois.json.resultat.prix, 20000);
    assert.equal(trois.json.resultat.entretien, 1000);
  });
  it('un aménagement de 700 reste dans le prix : 20 700 et 1 035', async () => {
    const m = await monde();
    const jeton = m.srv.jeton('antor', m.E, 'Script prix', ['swn/vaisseaux']);
    const imp = (methode: string, chemin: string, corps?: unknown) => fetch(`${m.srv.base}/api/import/v1/univers/${m.E}${chemin}`, { method: methode, headers: { authorization: `Bearer ${jeton}`, ...(corps === undefined ? {} : { 'content-type': 'application/json' }) }, body: corps === undefined ? undefined : JSON.stringify(corps) });
    const lot = ((await (await imp('POST', '/lots?outil=swn/vaisseaux')).json()) as Any).lotId;
    const el = { cle: 'baie-essai', nom: 'Baie d’essai', cout: 700, puissance: 0, masse: 0, x_cout: false, x_puissance: false, x_masse: false, pv: 0, ca: 0, limite: 0 };
    const ok = await imp('PUT', `/outils/swn/vaisseaux/catalogue?niveau=univers&lot=${lot}`, { catalogue: 'swn/vaisseaux', version: 'essai-prix', amenagements: [el] });
    assert.equal(ok.status, 200, await ok.text());
    const r = await m.api('POST', `${m.V}/calcul`, { coque: 'eclaireur', choix: [{ nature: 'amenagements', cle: 'baie-essai', quantite: 1 }] });
    assert.equal(r.status, 200, r.texte);
    assert.equal(r.json.resultat.prix, 20700);
    assert.equal(r.json.resultat.entretien, 1035);
  });
});

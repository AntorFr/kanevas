// Re-verification tests of kanevas-outils-vaisseaux, from docs/ecrans.md (E-22 « List », E-9 « Entry ») and docs/parcours.md (P-19, B-75, B-76).
// TEST PLAN
//   B-75/E-22 liste · nominal : Antor withdraws the hull « Éclaireur » of « Étoile du soir » → Léa's list row shows « 1 bloquante »
//   B-75/E-22 liste · exclusion : « Vent d'Orak » (no withdrawn element) and « Étoile du soir » before the withdrawal carry no « bloquante » badge
//   B-75/E-22 liste · bord : the withdrawal lifted (hull put back) → the badge is gone
//   B-76/E-9 bandeau · nominal : Léa on « Vent d'Orak » sees « Générée par le concepteur de vaisseaux » and a link « Ouvrir dans le concepteur » to ?fiche=<id>
//   B-76/E-9 bandeau · bord : a GM (Mira) has the link too; no editor for Léa
//   B-76/E-9 bandeau · nominal : the link opens the workshop of the same design
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { connecte, launch, skipBrowser, startServer, texte, type Any, type Server } from './harnais.test.ts';

mkdirSync('/tmp/shots', { recursive: true });
let srv: Server;
let browser: Any;
const ctxs: Any[] = [];
before(async () => { if (!skipBrowser) { browser = await launch(); srv = await startServer({ KANEVAS_SANS_SEMIS: '' }); } });
after(async () => { for (const c of ctxs) await c.close().catch(() => {}); await browser?.close(); srv?.stop(); });

const cookies: Record<string, string> = {};
async function api(compte: string, methode: string, chemin: string, corps?: unknown): Promise<Any> {
  if (!cookies[compte]) {
    const r = await fetch(`${srv.base}/connexion-bouchon`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `compte=${compte}` });
    cookies[compte] = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
  }
  const r = await fetch(srv.base + chemin, { method: methode, headers: { cookie: cookies[compte], ...(corps === undefined ? {} : { 'content-type': 'application/json' }) }, body: corps === undefined ? undefined : JSON.stringify(corps) });
  const t = await r.text();
  try { return { status: r.status, json: JSON.parse(t) }; } catch { return { status: r.status, json: null }; }
}
async function monde(): Promise<{ E: number; orak: number; etoile: number }> {
  const E = ((await api('antor', 'GET', '/api/univers')).json as Any[]).find((u) => u.nom === "Éneria d'essai").id as number;
  const l = (await api('antor', 'GET', `/api/univers/${E}/outils/swn/vaisseaux/conceptions`)).json;
  const fid = (t: string) => l.conceptions.find((c: Any) => c.titre === t).ficheId as number;
  return { E, orak: fid("Vent d'Orak"), etoile: fid('Étoile du soir') };
}
async function ouvrir(compte: string, url: string): Promise<Any> {
  const { ctx, page } = await connecte(browser, srv.base, compte === 'lea' ? 'Léa' : compte);
  ctxs.push(ctx);
  await page.goto(url);
  return page;
}
const ligne = (page: Any, titre: string) => page.getByRole('listitem').filter({ has: page.getByRole('link', { name: titre }) }).or(page.getByRole('row').filter({ has: page.getByRole('link', { name: titre }) })).first();

describe('B-75 · E-22 liste : badge « N bloquante(s) »', { skip: skipBrowser }, () => {
  it('sans élément retiré, aucune ligne ne porte « bloquante » ; Antor retire la coque : « Étoile du soir » porte « 1 bloquante », « Vent d’Orak » non ; la coque remise, le badge disparaît', async () => {
    const { E, orak, etoile } = await monde();
    const url = `/univers/${E}/outils/swn/vaisseaux`;
    let p = await ouvrir('lea', url);
    await p.getByRole('link', { name: 'Étoile du soir' }).waitFor();
    assert.doesNotMatch(await texte(p), /bloquante/i, 'no blocking badge before the withdrawal');

    const R = `/api/univers/${E}/outils/swn/vaisseaux/catalogue/coques/eclaireur/retrait`;
    assert.equal((await api('antor', 'PUT', R, { retire: true })).status, 200);
    p = await ouvrir('lea', url);
    await p.getByRole('link', { name: 'Étoile du soir' }).waitFor();
    await ligne(p, 'Étoile du soir').getByText(/1 bloquante/).waitFor();
    await p.screenshot({ path: '/tmp/shots/reverif-liste-badge.png', fullPage: true });
    assert.match(await ligne(p, 'Étoile du soir').innerText(), /1 bloquante/);
    assert.doesNotMatch(await ligne(p, "Vent d'Orak").innerText(), /bloquante/i);
    assert.ok(orak > 0 && etoile > 0);

    assert.equal((await api('antor', 'PUT', R, { retire: false })).status, 200);
    p = await ouvrir('lea', url);
    await p.getByRole('link', { name: 'Étoile du soir' }).waitFor();
    assert.doesNotMatch(await texte(p), /bloquante/i, 'the badge is gone once the element is back');
  });
});

describe('B-76 · E-9 : bandeau de « Caractéristiques »', { skip: skipBrowser }, () => {
  it('Léa (autrice) voit « Générée par le concepteur de vaisseaux » et le lien « Ouvrir dans le concepteur » vers la même conception, sans éditeur', async () => {
    const { E, orak } = await monde();
    const p = await ouvrir('lea', `/univers/${E}/fiche/${orak}`);
    await p.getByText('Générée par le concepteur de vaisseaux').waitFor();
    const lien = p.getByRole('link', { name: 'Ouvrir dans le concepteur' });
    assert.equal(await lien.count(), 1);
    await p.screenshot({ path: '/tmp/shots/reverif-e9-bandeau.png', fullPage: true });
    assert.match((await lien.getAttribute('href')) ?? '', new RegExp(`/univers/${E}/outils/swn/vaisseaux\\?fiche=${orak}$`));
    assert.equal(await p.locator('textarea').count(), 0);
    await lien.click();
    await p.getByText('Résultats enregistrés').waitFor();
    assert.match(p.url(), new RegExp(`fiche=${orak}`));
  });

  it('un MJ (hors mode Joueur) voit aussi « Ouvrir dans le concepteur » sur la fiche d’« Étoile du soir »', async () => {
    const { E, etoile } = await monde();
    const p = await ouvrir('mira', `/univers/${E}/fiche/${etoile}`);
    await p.getByText('Générée par le concepteur de vaisseaux').waitFor();
    assert.equal(await p.getByRole('link', { name: 'Ouvrir dans le concepteur' }).count(), 1);
  });
});

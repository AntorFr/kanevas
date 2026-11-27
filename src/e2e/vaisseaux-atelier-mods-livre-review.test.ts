// ecrans: outil
// Revue de kanevas-concepteur-vaisseaux-mods-livre-atelier (E-22, B-93, B-94, V-5, P-19 étape 6, P-22): navigateur piloté, catalogue d'essai écrit par le test, attendus calculés à la main.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { connecte, launch, skipBrowser, startServer, type Any, type Server } from './harnais.test.ts';

let srv: Server;
let browser: Any;
const ctxs: Any[] = [];
const el = { cout: 0, puissance: 0, masse: 0, x_cout: false, x_puissance: false, x_masse: false, pv: 0, ca: 0, limite: 0 };
const catalogue = {
  catalogue: 'swn/vaisseaux', version: 'rev-mods',
  coques: [
    { cle: 'fregate-m', nom: 'Frégate M', classe: 3, cout: 300000, pv: 5, ca: 10, puissance: 60, masse: 60, emports: 1, facteur_cout: 1, facteur_puissance: 1, facteur_masse: 1, vitesse: 3, armure: 5 },
  ],
  moteurs: [], amenagements: [], defenses: [], armes: [],
  modifications: [
    { cle: 'refonte-m', nom: 'Refonte M', ...el, cout: 20000, composants: 3 },
    { cle: 'pretech-m', nom: 'Pretech M', ...el, cout: 0, composants: 2, composants_par_classe: 1 },
  ],
  exemples: [],
};

before(async () => {
  if (skipBrowser) return;
  mkdirSync('/tmp/shots', { recursive: true });
  browser = await launch();
  srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
});
after(async () => { for (const c of ctxs) await c.close().catch(() => {}); await browser?.close(); srv?.stop(); });

async function cookie(compte: string): Promise<string> {
  const r = await fetch(`${srv.base}/connexion-bouchon`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `compte=${compte}` });
  return (r.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
}
async function api(compte: string, methode: string, chemin: string, corps?: object): Promise<Any> {
  const r = await fetch(srv.base + chemin, { method: methode, headers: { cookie: await cookie(compte), ...(corps ? { 'content-type': 'application/json' } : {}) }, ...(corps ? { body: JSON.stringify(corps) } : {}) });
  return { statut: r.status, json: await r.json().catch(() => null) };
}
let E = 0; let orak = 0; let etoile = 0;
const B = () => `/api/univers/${E}/outils/swn/vaisseaux`;
async function remettre() {
  if (!E) E = ((await api('antor', 'GET', '/api/univers')).json as Any[]).find((u) => u.nom === "Éneria d'essai").id as number;
  const imp = await api('antor', 'POST', `${B()}/catalogue/application`, catalogue);
  assert.equal(imp.statut, 200, JSON.stringify(imp.json));
  const l = (await api('antor', 'GET', `${B()}/conceptions`)).json;
  orak = l.conceptions.find((c: Any) => c.titre === "Vent d'Orak").ficheId;
  etoile = l.conceptions.find((c: Any) => c.titre === 'Étoile du soir').ficheId;
  for (const f of [orak, etoile]) {
    const v = (await api('antor', 'GET', `${B()}/conceptions/${f}`)).json;
    const r = await api('antor', 'PUT', `${B()}/conceptions/${f}`, { coque: 'fregate-m', choix: [], version: v.version });
    assert.equal(r.statut, 200, JSON.stringify(r.json));
  }
}
async function ouvrir(compte: string, fiche: number, largeur: number): Promise<Any> {
  const { ctx, page } = await connecte(browser, srv.base, compte === 'lea' ? 'Léa' : compte);
  ctxs.push(ctx);
  await page.setViewportSize({ width: largeur, height: 900 });
  await page.goto(`/univers/${E}/outils/swn/vaisseaux?fiche=${fiche}`);
  await page.locator('.vx-resultats').waitFor();
  return page;
}
const norm = (s: string) => s.replace(/[  ]/g, ' ');
const corps = async (p: Any) => norm(await p.locator('body').innerText());
async function attendre(p: Any, re: RegExp) {
  await p.waitForFunction(({ s, f }: Any) => new RegExp(s, f).test(document.body.innerText.replace(/[  ]/g, ' ')), { s: re.source, f: re.flags }, { timeout: 15000 });
}
async function absent(p: Any, re: RegExp) {
  // called after an `attendre` that proves the calculation arrived (or on a design at rest): nothing is pending, no fixed wait
  assert.doesNotMatch(norm(await p.locator('.vx-resultats').innerText()) + ' ' + await corps(p), re);
}
async function ajouter(p: Any, nom: string) {
  await p.getByRole('button', { name: /^(Ajouter une modification|Ajouter : Modifications)$/ }).first().click();
  await p.locator('li').filter({ hasText: nom }).last().getByRole('button').first().click();
  await p.getByRole('button', { name: `Retirer : ${nom}` }).waitFor();
}
const plus = async (p: Any, nom: string, n: number) => { for (let i = 0; i < n; i++) await p.getByRole('button', { name: `Augmenter la quantité : ${nom}` }).click(); };
const integre = (p: Any) => p.locator('input[aria-label="Intégrées à la coque : Refonte M"]');
const valeurIntegre = (p: Any, v: string) => p.waitForFunction((x: string) => (document.querySelector('input[aria-label="Intégrées à la coque : Refonte M"]') as HTMLInputElement | null)?.value === x, v, { timeout: 15000 });
const sansDebordement = async (p: Any) => {
  const m = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  assert.ok(m.sw <= m.iw + 1, `aucun défilement horizontal ${JSON.stringify(m)}`);
};

describe('E-22 mods du livre', { skip: skipBrowser, timeout: 300000 }, () => {
  const parcours = (largeur: number) => async () => {
      await remettre();
      const p = await ouvrir('lea', orak, largeur);
      // an empty design: no row, no block
      await absent(p, /Installation|Maintenance :|Composants prétech/);
      assert.equal(await p.getByRole('heading', { name: 'Compétence de réparation' }).count(), 0);
      await ajouter(p, 'Refonte M');
      await attendre(p, /Installation\s*:?\s*4 jours d['’]équipage, 1 jour avec chantier/);
      await attendre(p, /Composants prétech\s*:?\s*3\b/);
      await p.getByRole('heading', { name: 'Compétence de réparation' }).waitFor();
      assert.equal(await integre(p).inputValue(), '0');
      await absent(p, /\bRefonte\s*:?\s*\d/);
      // Repair 1, Int + Con 0 → Maintenance 3
      await p.locator('input[aria-label="Compétence de réparation"]').fill('1');
      await attendre(p, /Maintenance : 3\b/);
      assert.equal(await p.locator('input[aria-label="Modificateurs Int + Con"]').inputValue(), '0');
      // four installations: 16 days, 4 > 3 kept up
      await plus(p, 'Refonte M', 3);
      await attendre(p, /Installation\s*:?\s*16 jours d['’]équipage, 4 jours avec chantier/);
      await attendre(p, /À surveiller\s*·?\s*4 mods entretenus, Maintenance 3/i);
      // two refitted: alert gone, refit 5 × 20 000 × 2 and 12 components
      await integre(p).fill('2');
      await attendre(p, /Refonte\s*:?\s*200 000 cr, 12 composants/);
      assert.doesNotMatch(await corps(p), /mods entretenus/);
      // three refitted with Repair 1: the watch alert, saving stays allowed
      await integre(p).fill('3');
      await attendre(p, /Plus de mods intégrés que 2 × Réparation/);
      await p.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'Enregistrer' && !(b as HTMLButtonElement).disabled), null, { timeout: 15000 });
      // beyond the quantity: refused; lowering the quantity lowers the refit
      await integre(p).fill('5');
      await attendre(p, /Intégrées à la coque : un nombre entier de 0 à 4/);
      await integre(p).fill('3');
      await p.getByRole('button', { name: 'Diminuer la quantité : Refonte M' }).click();
      await attendre(p, /sur 3\b/);
      await valeurIntegre(p, '3');
      await p.getByRole('button', { name: 'Diminuer la quantité : Refonte M' }).click();
      await attendre(p, /sur 2\b/);
      await valeurIntegre(p, '2');
      await attendre(p, /sur 2\b/);
      // Int + Con signed
      const ic = p.locator('input[aria-label="Modificateurs Int + Con"]');
      await ic.fill('11');
      await attendre(p, /Modificateurs Int \+ Con : un nombre entier de −10 à 10/);
      await ic.fill('-2');
      await attendre(p, /Maintenance : 1\b/);
      assert.equal(await ic.inputValue(), '−2'); // the typographic minus
      await sansDebordement(p);
      await p.screenshot({ path: `/tmp/shots/mods-${largeur}.png`, fullPage: true });
  };
  it('Léa : installation, Maintenance, alerte, refonte, intégrées ≤ quantité, 1280 px', parcours(1280));
  it('Léa : installation, Maintenance, alerte, refonte, intégrées ≤ quantité, 390 px', parcours(390));

  it('enregistrement relu ; échec : message et valeurs gardées ; hors ligne : pas à pas verrouillés', async () => {
    await remettre();
    const p = await ouvrir('lea', orak, 1280);
    await ajouter(p, 'Refonte M');
    await plus(p, 'Refonte M', 2);
    await p.locator('input[aria-label="Compétence de réparation"]').fill('2');
    await integre(p).fill('2');
    await p.locator('input[aria-label="Modificateurs Int + Con"]').fill('1');
    await attendre(p, /Maintenance : 7\b/);
    await attendre(p, /Refonte\s*:?\s*200 000 cr, 12 composants/);
    // failure: the PUT answers 500
    await p.route('**/conceptions/*', (r: Any) => (r.request().method() === 'PUT' ? r.fulfill({ status: 500, body: '{}', contentType: 'application/json' }) : r.continue()));
    await p.getByRole('button', { name: 'Enregistrer' }).click();
    await attendre(p, /L['’]action n['’]a pas abouti\. Réessayez\./);
    assert.equal(await integre(p).inputValue(), '2');
    assert.equal(await p.locator('input[aria-label="Modificateurs Int + Con"]').inputValue(), '1');
    await p.unroute('**/conceptions/*');
    const rep = p.waitForResponse((r: Any) => r.request().method() === 'PUT' && r.url().includes('/conceptions/'));
    await p.getByRole('button', { name: 'Enregistrer' }).click();
    assert.equal((await rep).status(), 200);
    const v = (await api('antor', 'GET', `${B()}/conceptions/${orak}`)).json;
    assert.equal(v.modIntCon, 1);
    assert.equal(v.lignes.find((l: Any) => l.cle === 'refonte-m').integre, 2);
    // reopened
    const q = await ouvrir('lea', orak, 1280);
    assert.equal(await integre(q).inputValue(), '2');
    assert.equal(await q.locator('input[aria-label="Modificateurs Int + Con"]').inputValue(), '1');
    // offline
    await q.context().setOffline(true);
    await q.evaluate(() => window.dispatchEvent(new Event('offline')));
    await q.getByText('Connexion perdue.').first().waitFor();
    assert.equal(await integre(q).isDisabled(), true);
    assert.equal(await q.locator('input[aria-label="Modificateurs Int + Con"]').isDisabled(), true);
    await q.context().setOffline(false);
  });

  it('prétech par classe : une installation de 2 composants sur un rang 3 → 6', async () => {
    await remettre();
    const p = await ouvrir('lea', orak, 1280);
    await ajouter(p, 'Pretech M');
    await attendre(p, /Composants prétech\s*:?\s*6\b/);
  });

  it('Lecteur teo (lecture) : texte, aucun pas à pas ni « Enregistrer » ; rien quand integre vaut 0 ; ancienne conception : 0 partout', async () => {
    await remettre();
    const v = (await api('antor', 'GET', `${B()}/conceptions/${etoile}`)).json;
    const r = await api('antor', 'PUT', `${B()}/conceptions/${etoile}`, { coque: 'fregate-m', version: v.version, reparation: 1, choix: [{ nature: 'modifications', cle: 'refonte-m', quantite: 3, integre: 2 }] });
    assert.equal(r.statut, 200, JSON.stringify(r.json));
    await api('antor', 'POST', `/api/univers/${E}/membres`, { username: 'teo', role: 'joueur' });
    const p = await ouvrir('teo', etoile, 1280);
    await attendre(p, /Intégrées à la coque : 2 sur 3/);
    const t = await corps(p);
    assert.match(t, /Modificateurs Int \+ Con : 0/);
    assert.match(t, /Maintenance : 3\b/);
    assert.equal(await p.getByRole('button', { name: 'Enregistrer' }).count(), 0);
    assert.equal(await p.locator('input').count(), 0);
    assert.equal(await p.getByRole('button', { name: /Augmenter|Diminuer/ }).count(), 0);
    await p.screenshot({ path: '/tmp/shots/mods-lecteur.png', fullPage: true });
    // integre 0: nothing about the refit
    const v2 = (await api('antor', 'GET', `${B()}/conceptions/${etoile}`)).json;
    await api('antor', 'PUT', `${B()}/conceptions/${etoile}`, { coque: 'fregate-m', version: v2.version, reparation: 1, choix: [{ nature: 'modifications', cle: 'refonte-m', quantite: 3 }] });
    const q = await ouvrir('teo', etoile, 1280);
    await attendre(q, /Maintenance : 3\b/);
    assert.doesNotMatch(norm(await q.locator('.vx-resultats').innerText()), /Refonte/);
    assert.doesNotMatch(await corps(q), /Intégrées à la coque/);
  });
});

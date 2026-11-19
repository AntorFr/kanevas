// ecrans: acces-api
// E-18 (« Accès API », lots d'import) : ce que le MJ lit quand une écriture du script est refusée par empreinte
// (kanevas-synchro-ecriture, B-110, E-18 : « modifiée depuis la lecture »), et que « modifié dans Kanevas : non écrasé »
// n'existe plus (B-48 retiré). L'effet (412, rien d'écrit) est prouvé à la porte dans
// src/routes/synchro-ecriture-ensemble.test.ts ; ici, le nominal d'affichage seulement.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { type Any, attendre, launch, rx, skipBrowser } from './harnais.test.js';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
process.env.FRONTEND_DIR = process.cwd() + '/dist/public';
delete process.env.DB_PATH;
delete process.env.KANEVAS_SANS_SEMIS;

const { buildApp } = await import('../app.js');
const { semerBouchon } = await import('../bouchon/depart.js');
const { renommerFiche } = await import('../services/fiches.js');

const opts = { skip: skipBrowser };
const CAP = process.env.SYNCHRO_ECRITURE_CAPTURES ?? '/tmp/synchro-ecriture-captures';

let browser: Any;
const ouverts: Array<{ close: () => Promise<unknown> }> = [];
before(async () => {
  mkdirSync(CAP, { recursive: true });
  if (!skipBrowser) browser = await launch();
});
after(async () => {
  await browser?.close();
  for (const a of ouverts) await a.close().catch(() => {});
});

const norm = (s: string) => s.replace(/[  ]/g, ' ').replace(/’/g, "'");

test('E-18 : un PATCH refusé par empreinte périmée se lit « Fiches : 1 refusée », déplié « lieu:port » et « modifiée depuis la lecture »', opts, async () => {
  const app = await buildApp();
  assert.ok(semerBouchon(app.db));
  ouverts.push(app);
  await app.listen({ host: '127.0.0.1', port: 0 });
  const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  const essai = (app.db.prepare('SELECT id FROM univers WHERE nom = ?').get('Essai Kanka') as { id: number }).id;
  const antor = (app.db.prepare("SELECT id FROM comptes WHERE username = 'antor'").get() as { id: number }).id;

  const c = await fetch(`${base}/connexion-bouchon`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'compte=antor' });
  const cookie = /kanevas_session=[^;]+/.exec(c.headers.get('set-cookie') ?? '')![0];
  const jt = await fetch(`${base}/api/compte/jetons`, {
    method: 'POST', headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ nom: 'Script de test', dureeJours: 30, acces: { tous: false, univers: [{ universId: essai, niveau: 'ecriture' }] } }),
  });
  assert.equal(jt.status, 201);
  const jeton = ((await jt.json()) as Any).valeur as string;
  const imp = (m: string, chemin: string, corps?: unknown, h: Record<string, string> = {}) =>
    fetch(`${base}/api/import/v1/univers/${essai}${chemin}`, {
      method: m, headers: { authorization: `Bearer ${jeton}`, ...(corps ? { 'content-type': 'application/json' } : {}), ...h }, body: corps ? JSON.stringify(corps) : undefined,
    });

  const lot = ((await (await imp('POST', '/lots')).json()) as Any).lotId as number;
  const mis = await imp('PUT', `/fiches/${encodeURIComponent('lieu:port')}?lot=${lot}`, { type: 'lieu', titre: 'Port', sections: [{ cle: 'a', titre: 'A', contenu: 'x', joueursLisent: true }] });
  assert.equal(mis.status, 200);
  const lu = (await (await imp('GET', `/fiches/${encodeURIComponent('lieu:port')}`)).json()) as Any;
  renommerFiche(app.db, antor, essai, lu.id, 'Port-au-Large'); // le MJ renomme dans Kanevas
  const refus = await imp('PATCH', `/fiches/${encodeURIComponent('lieu:port')}?lot=${lot}`, { titre: 'Du script' }, { 'if-match': `"${lu.empreinteEntete}"` });
  assert.equal(refus.status, 412);
  assert.equal((await imp('POST', `/lots/${lot}/clore`)).status, 200);

  const ctx = await browser.newContext({ baseURL: base, locale: 'fr-FR' });
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  try {
    await page.goto('/connexion-bouchon');
    await page.getByRole('button', { name: /^Se connecter en tant que antor$/i }).click();
    await attendre(page);
    await page.goto(`/univers/${essai}/acces-api`);
    await attendre(page);
    await page.getByText(rx('Fiches : 1 créée')).first().waitFor();
    const t = norm(await page.locator('body').innerText());
    assert.match(t, /Fiches : 1 créée · 1 refusée/);
    await page.getByText(rx('Fiches : 1 créée')).first().click();
    await page.getByText(rx('lieu:port')).first().waitFor();
    const d = norm(await page.locator('body').innerText());
    assert.match(d, /lieu:port/);
    assert.match(d, /modifiée depuis la lecture/);
    assert.doesNotMatch(d, /non écrasé/);
    await page.screenshot({ path: `${CAP}/e18-refus-empreinte.png`, fullPage: true });
  } finally {
    await ctx.close();
    await app.close();
  }
});

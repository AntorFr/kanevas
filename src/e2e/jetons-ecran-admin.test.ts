// ecrans: administration, jetons
// E-5 panel « Jetons d'API » (B-95, P-25), written from the task's critère de sortie and docs/ecrans.md, not from the code.
// The real app runs in this process in stub mode on an in-memory SQLite, driven by a real Chromium.
// Captures go to $JETONS_ADMIN_CAPTURES (default /tmp/jetons-admin-captures), outside the tree.
//
// TEST PLAN (need → cases; expectations are literals)
//   parcours  : Léa creates « Tous sauf Essai »(Tous mes univers) ; Admin sees it (owner Léa, no value), adds the exception
//               « Essai Kanka : — » → Léa's E-23 reads « Modifié par l'admin », Lame d'Ébène still 200, Essai 404; Admin revokes
//               (confirmation names token and Léa) → Léa reads « Révoqué par l'admin », token 401, line without actions
//   exclusion : Antor (GM, not admin) has no panel, /administration reads « Page introuvable. », GET /api/instance/jetons is 404
//   filtre    : filter « Propriétaire » narrows to one owner, the other owners stay offered
//   bords     : 360 px → blocks (no table header), actions in reach; revoked meanwhile → « Ce jeton est révoqué. »
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { type Any, attendre, connecte, launch, skipBrowser } from './harnais.test.js';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
process.env.FRONTEND_DIR = process.cwd() + '/dist/public';
delete process.env.DB_PATH;
delete process.env.KANEVAS_SANS_SEMIS;

const { buildApp } = await import('../app.js');
const { semerBouchon } = await import('../bouchon/depart.js');

const opts = { skip: skipBrowser };
const CAP = process.env.JETONS_ADMIN_CAPTURES ?? '/tmp/jetons-admin-captures';
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

async function monde() {
  const app = await buildApp();
  assert.ok(semerBouchon(app.db));
  ouverts.push(app);
  await app.listen({ host: '127.0.0.1', port: 0 });
  const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  const cle = (nom: string) => (app.db.prepare('SELECT cle FROM univers WHERE nom = ?').get(nom) as { cle: string }).cle;
  return { app, base, essai: cle('Essai Kanka'), lame: cle("Lame d'Ébène") };
}
async function api(base: string, jeton: string, chemin: string) {
  const r = await fetch(`${base}/api/v1/univers/${chemin}`, { headers: { authorization: `Bearer ${jeton}` } });
  return r.status;
}
const ligneUnivers = (page: Any, nom: string) => page.getByRole('list', { name: /par univers/ }).getByRole('listitem').filter({ hasText: nom });

/** Léa creates a « Tous mes univers » token with Essai Kanka at « — »: returns its value. */
async function jetonDeLea(base: string, nom: string, exception = false): Promise<string> {
  const { ctx, page } = await connecte(browser, base, 'Léa');
  await page.goto('/compte/jetons');
  await attendre(page);
  await page.getByRole('button', { name: 'Créer un jeton' }).first().click();
  await page.getByLabel('Nom').fill(nom);
  if (exception) await ligneUnivers(page, 'Essai Kanka').getByRole('radio', { name: '—' }).click();
  await page.getByRole('button', { name: 'Créer le jeton' }).click();
  const code = page.locator('code').first();
  await code.waitFor();
  const valeur = (await code.textContent()) as string;
  await page.getByRole('button', { name: 'J’ai copié le jeton' }).click();
  await ctx.close();
  return valeur;
}
async function ouvrirAdmin(page: Any) {
  await page.goto('/administration');
  await attendre(page);
  await page.getByRole('table', { name: 'Jetons de l’instance' }).waitFor();
}
const ligne = (page: Any, nom: string) => page.getByRole('row').filter({ hasText: nom });

test('parcours_admin_modifie_puis_revoque_et_lea_le_lit', opts, async () => {
  const m = await monde();
  const valeur = await jetonDeLea(m.base, 'Tous sauf Essai');
  assert.equal(await api(m.base, valeur, m.essai), 200);
  const admin = await connecte(browser, m.base, 'Admin');
  await ouvrirAdmin(admin.page);
  const l = ligne(admin.page, 'Tous sauf Essai');
  const texteLigne = (await l.textContent()) ?? '';
  assert.match(texteLigne, /lea/i);
  assert.match(texteLigne, /Tous les univers du compte/);
  assert.equal(texteLigne.includes(valeur), false, 'jamais la valeur');
  assert.equal((await admin.page.content()).includes(valeur), false);
  await admin.page.screenshot({ path: `${CAP}/liste.png` });

  await l.getByRole('button', { name: /Modifier les accès/ }).click();
  await ligneUnivers(admin.page, 'Essai Kanka').getByRole('radio', { name: '—' }).click();
  await admin.page.getByRole('dialog').getByRole('button', { name: 'Enregistrer' }).click();
  await admin.page.getByText('Accès enregistrés.').waitFor();
  await attendre(admin.page);
  assert.equal(await api(m.base, valeur, m.essai), 404, 'l’exception s’applique');
  assert.equal(await api(m.base, valeur, m.lame), 200, 'les autres univers inchangés');
  assert.match((await ligne(admin.page, 'Tous sauf Essai').textContent()) ?? '', /Essai Kanka : —/);

  const lea = await connecte(browser, m.base, 'Léa');
  await lea.page.goto('/compte/jetons');
  await attendre(lea.page);
  await lea.page.getByText('Modifié par l’admin').waitFor();
  await lea.page.screenshot({ path: `${CAP}/lea-modifie.png` });

  await ligne(admin.page, 'Tous sauf Essai').getByRole('button', { name: /Révoquer/ }).click();
  const conf = admin.page.getByRole('alertdialog');
  await conf.getByText(/Tous sauf Essai/).waitFor();
  assert.match((await conf.textContent()) ?? '', /lea/i);
  await admin.page.screenshot({ path: `${CAP}/confirmation.png` });
  await conf.getByRole('button', { name: 'Révoquer le jeton' }).click();
  await admin.page.getByText('Jeton révoqué.').waitFor();
  assert.equal(await api(m.base, valeur, m.lame), 401);
  await admin.page.getByText('Révoqué par l’admin').waitFor();
  assert.equal(await ligne(admin.page, 'Tous sauf Essai').getByRole('button').count(), 0, 'plus d’action');

  await lea.page.reload();
  await attendre(lea.page);
  await lea.page.getByText('Révoqué par l’admin').waitFor();
  await lea.page.screenshot({ path: `${CAP}/lea-revoque.png` });
  await admin.ctx.close();
  await lea.ctx.close();
});

test('exclusion_mj_non_admin_sans_panneau_et_route_introuvable', opts, async () => {
  const m = await monde();
  await jetonDeLea(m.base, 'Secret de Léa');
  const { ctx, page } = await connecte(browser, m.base, 'Antor');
  await page.goto('/administration');
  await attendre(page);
  await page.getByText('Page introuvable.').waitFor();
  assert.equal(await page.getByText('Jetons d’API').count(), 0);
  assert.equal(await page.getByText('Secret de Léa').count(), 0);
  const statuts = await page.evaluate(async () => {
    const r1 = await fetch('/api/instance/jetons');
    const r2 = await fetch('/api/instance/jetons/1', { method: 'DELETE' });
    return [r1.status, r2.status, await r1.text()];
  });
  assert.equal(statuts[0], 404);
  assert.equal(statuts[1], 404);
  assert.equal(String(statuts[2]).includes('Secret de Léa'), false);
  await ctx.close();
});

test('filtre_proprietaire_et_jeton_revoque_entre_temps', opts, async () => {
  const m = await monde();
  await jetonDeLea(m.base, 'Jeton de Léa');
  const admin = await connecte(browser, m.base, 'Admin');
  await ouvrirAdmin(admin.page);
  const proprios = await admin.page.getByLabel('Propriétaire').locator('option').allTextContents();
  assert.ok(proprios.includes('Tous les comptes') && proprios.includes('lea'), proprios.join('|'));
  // Antor owns the stub token; Léa the new one.
  await admin.page.getByLabel('Propriétaire').selectOption({ label: 'lea' });
  await admin.page.getByText('Jeton de Léa').waitFor();
  await attendre(admin.page);
  assert.equal(await admin.page.getByRole('row').filter({ hasText: 'antor' }).count(), 0, 'seul Léa');
  assert.equal(await admin.page.getByLabel('Propriétaire').inputValue() !== '', true, 'le filtre reste');
  const comptes = proprios.filter((p) => p !== 'Tous les comptes' && p !== 'lea');
  assert.ok(comptes.length >= 1, 'les autres comptes restent proposés sous filtre');
  const autres = await admin.page.getByLabel('Propriétaire').locator('option').allTextContents();
  assert.deepEqual(autres, proprios, 'les propriétaires ne se réduisent pas avec le filtre');

  // The owner revokes while the admin's box is open: saving answers « Ce jeton est révoqué. » (409) and the list shows the pill.
  await ligne(admin.page, 'Jeton de Léa').getByRole('button', { name: /Modifier les accès/ }).click();
  await admin.page.getByRole('radio', { name: 'Une liste d’univers' }).click();
  await ligneUnivers(admin.page, 'Essai Kanka').getByRole('radio', { name: 'Lecture', exact: true }).click();
  m.app.db.prepare("UPDATE jetons_api SET revoque_le = ?, revoque_par = compte_id WHERE nom = 'Jeton de Léa'").run(new Date().toISOString());
  await admin.page.getByRole('dialog').getByRole('button', { name: 'Enregistrer' }).click();
  await admin.page.getByText('Ce jeton est révoqué.').first().waitFor();
  await admin.page.getByRole('button', { name: 'Fermer' }).click();
  await admin.page.getByText('Révoqué', { exact: true }).waitFor();
  assert.equal(await ligne(admin.page, 'Jeton de Léa').getByRole('button').count(), 0, 'plus d’action');
  assert.equal(await admin.page.getByText('Révoqué par l’admin').count(), 0, 'révoqué par son propriétaire');
  await ctx_close(admin);
});
async function ctx_close(c: { ctx: Any }) {
  await c.ctx.close();
}

test('largeur_360_blocs_sans_debordement', opts, async () => {
  const m = await monde();
  await jetonDeLea(m.base, 'Jeton mobile');
  const admin = await connecte(browser, m.base, 'Admin');
  await ouvrirAdmin(admin.page);
  const options = await admin.page.getByLabel('Propriétaire').locator('option').allTextContents();
  assert.ok(options.length >= 3);
  // 360 px: blocks, no header, actions reachable without horizontal scroll.
  await admin.page.setViewportSize({ width: 360, height: 800 });
  await attendre(admin.page);
  await ligne(admin.page, 'Jeton mobile').waitFor();
  assert.equal(await admin.page.getByRole('columnheader', { name: 'Nom' }).isVisible(), false);
  const debord = await admin.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert.equal(debord, false, 'pas de défilement horizontal à 360 px');
  const b = await ligne(admin.page, 'Jeton mobile').getByRole('button', { name: /Révoquer/ }).boundingBox();
  assert.ok(b && b.x >= 0 && b.x + b.width <= 360, 'bouton Révoquer dans la fenêtre');
  await admin.page.screenshot({ path: `${CAP}/360.png`, fullPage: true });
  await admin.page.emulateMedia({ colorScheme: 'dark' });
  await admin.page.screenshot({ path: `${CAP}/360-sombre.png`, fullPage: true });
  await admin.ctx.close();
});

test('nom_long_non_tronque_a_cote_de_la_pastille_revoque', opts, async () => {
  const m = await monde();
  const nom = 'Synchronisation nocturne du grimoire des campagnes pour la table du vendredi';
  await jetonDeLea(m.base, nom);
  const admin = await connecte(browser, m.base, 'Admin');
  await ouvrirAdmin(admin.page);
  await ligne(admin.page, nom).getByRole('button', { name: /Révoquer/ }).click();
  await admin.page.getByRole('alertdialog').getByRole('button', { name: 'Révoquer le jeton' }).click();
  await admin.page.getByText('Révoqué par l’admin').first().waitFor();
  for (const largeur of [1280, 360]) {
    await admin.page.setViewportSize({ width: largeur, height: 800 });
    await attendre(admin.page);
    const mesure = await admin.page.evaluate((n: string) => {
      const b = [...document.querySelectorAll('.ligne-table-jeton .cel-nom b')].find((e) => e.textContent === n) as HTMLElement;
      const pastille = b.parentElement!.lastElementChild as HTMLElement;
      const cs = getComputedStyle(b);
      const p = pastille.getBoundingClientRect();
      return { coupe: b.scrollWidth > b.clientWidth, ellipse: cs.textOverflow === 'ellipsis', pastilleLarge: pastille.scrollWidth > pastille.clientWidth, droite: p.right, texte: pastille.textContent };
    }, nom);
    assert.equal(mesure.coupe, false, `${largeur}: nom entier`);
    assert.equal(mesure.ellipse, false, `${largeur}: pas de points de suspension`);
    assert.equal(mesure.pastilleLarge, false, `${largeur}: pastille entière`);
    assert.ok(mesure.droite <= largeur, `${largeur}: pastille dans la fenêtre`);
    assert.match(String(mesure.texte), /Révoqué par l’admin/);
  }
  await admin.ctx.close();
});

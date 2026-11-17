// ecrans: jetons
// E-23 « Mes jetons d'API » (B-94, P-25), written from the task's critère de sortie and docs/ecrans.md, not from the code.
// The real app runs in this process in stub mode on an in-memory SQLite, driven by a real Chromium.
// Captures go to $JETONS_CAPTURES (default /tmp/jetons-captures), outside the tree.
//
// TEST PLAN (need → cases; expectations are literals)
//   nominal   : Léa creates « Script de Léa » (list: Essai Kanka read) → value shown once, Esc and the veil do not close,
//               « J'ai copié le jeton » closes, line first; GET 200, PUT /fichiers 403 lecture_seule, other universe 404
//   exclusion : « Tous mes univers » with Essai Kanka at « — » → 404 there, 200 on Lame d'Ébène
//   modifier  : « Modifier les accès » saves (« Accès enregistrés. »), « Modifié par l'admin » cleared
//   révoquer  : confirmation, then 401 « Révoqué »
//   vide      : « Aucun jeton. »;  bords : empty name, empty list; offline: write buttons disabled
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
const CAP = process.env.JETONS_CAPTURES ?? '/tmp/jetons-captures';
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
async function api(base: string, jeton: string, methode: string, chemin: string, corps?: unknown) {
  const r = await fetch(`${base}/api/v1/univers/${chemin}`, {
    method: methode,
    headers: { authorization: `Bearer ${jeton}`, ...(corps ? { 'content-type': 'application/json' } : {}) },
    body: corps ? JSON.stringify(corps) : undefined,
  });
  const t = await r.text();
  return { statut: r.status, txt: t };
}
async function ouvrir(page: Any) {
  await page.goto('/compte/jetons');
  await attendre(page);
}
async function creer(page: Any, nom: string, regler?: () => Promise<void>): Promise<string> {
  await page.getByRole('button', { name: 'Créer un jeton' }).first().click();
  await page.getByLabel('Nom').fill(nom);
  if (regler) await regler();
  await page.getByRole('button', { name: 'Créer le jeton' }).click();
  const code = page.locator('code').first();
  await code.waitFor();
  return (await code.textContent()) as string;
}
const ligneUnivers = (page: Any, nom: string) => page.getByRole('list', { name: /par univers/ }).getByRole('listitem').filter({ hasText: nom });

test('jeton_liste_valeur_une_fois_puis_api', opts, async () => {
  const m = await monde();
  const { ctx, page } = await connecte(browser, m.base, 'Léa');
  await ouvrir(page);
  await page.getByText('Aucun jeton.').waitFor();
  await page.screenshot({ path: `${CAP}/vide.png` });
  const valeur = await creer(page, 'Script de Léa', async () => {
    await page.getByRole('radio', { name: 'Une liste d’univers' }).click();
    await ligneUnivers(page, 'Essai Kanka').getByRole('radio', { name: 'Lecture', exact: true }).click();
  });
  assert.match(valeur, /^kvs_[A-Za-z0-9_-]{43}$/);
  await page.getByText('Il ne sera plus affiché.').waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('code').first().isVisible(), true, 'Échap ne ferme pas');
  await page.mouse.click(5, 5);
  assert.equal(await page.locator('code').first().isVisible(), true, 'le voile ne ferme pas');
  await page.screenshot({ path: `${CAP}/valeur.png` });
  await page.getByRole('button', { name: 'J’ai copié le jeton' }).click();
  await page.getByText('Script de Léa').first().waitFor();
  assert.equal(await page.getByText(valeur).count(), 0, 'la valeur n’est plus nulle part');
  assert.match((await page.locator('.ligne-jeton').first().textContent()) ?? '', /Script de Léa/);
  assert.match((await page.locator('.ligne-jeton').first().textContent()) ?? '', /Essai Kanka : lecture/);
  await page.screenshot({ path: `${CAP}/liste.png` });
  assert.equal((await api(m.base, valeur, 'GET', `${m.essai}`)).statut, 200);
  const put = await api(m.base, valeur, 'PUT', `${m.essai}/fichiers/x`, {});
  assert.equal(put.statut, 403);
  assert.match(put.txt, /lecture_seule/);
  assert.equal((await api(m.base, valeur, 'GET', `${m.lame}`)).statut, 404);
  await ctx.close();
});

test('tous_avec_exception_tiret_puis_modifier_et_revoquer', opts, async () => {
  const m = await monde();
  const { ctx, page } = await connecte(browser, m.base, 'Léa');
  await ouvrir(page);
  const valeur = await creer(page, 'Tout sauf Essai', async () => {
    await ligneUnivers(page, 'Essai Kanka').getByRole('radio', { name: '—' }).click();
  });
  await page.getByRole('button', { name: 'J’ai copié le jeton' }).click();
  await page.getByText('Tous mes univers').first().waitFor();
  assert.equal((await api(m.base, valeur, 'GET', `${m.essai}`)).statut, 404);
  assert.equal((await api(m.base, valeur, 'GET', `${m.lame}`)).statut, 200);

  // The admin changes the token: the pill shows, then the owner's save clears it.
  const id = (m.app.db.prepare('SELECT id FROM jetons_api WHERE nom = ?').get('Tout sauf Essai') as { id: number }).id;
  assert.ok(id);
  await page.getByRole('button', { name: 'Modifier les accès de Tout sauf Essai' }).click();
  await ligneUnivers(page, 'Essai Kanka').getByRole('radio', { name: 'Lecture', exact: true }).click();
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await page.getByText('Accès enregistrés.').waitFor();
  await attendre(page);
  assert.equal((await api(m.base, valeur, 'GET', `${m.essai}`)).statut, 200);

  await page.getByRole('button', { name: 'Révoquer Tout sauf Essai' }).click();
  await page.getByText(/Révoquer « Tout sauf Essai » \? Le script ou l.agent qui l.utilise ne pourra plus rien lire ni écrire\./).waitFor();
  await page.screenshot({ path: `${CAP}/revoquer.png` });
  await page.getByRole('button', { name: 'Révoquer le jeton' }).click();
  await page.getByText('Jeton révoqué.').waitFor();
  await page.getByText('Révoqué', { exact: true }).waitFor();
  assert.equal((await api(m.base, valeur, 'GET', `${m.lame}`)).statut, 401);
  await ctx.close();
});

test('bords_nom_vide_liste_vide_et_connexion_coupee', opts, async () => {
  const m = await monde();
  const { ctx, page } = await connecte(browser, m.base, 'Léa');
  await ouvrir(page);
  await page.getByRole('button', { name: 'Créer un jeton' }).first().click();
  await page.getByRole('button', { name: 'Créer le jeton' }).click();
  await page.getByText('Erreur : le nom est obligatoire.').waitFor();
  await page.getByLabel('Nom').fill('N');
  await page.getByRole('radio', { name: 'Une liste d’univers' }).click();
  await page.getByRole('button', { name: 'Créer le jeton' }).click();
  await page.getByText('Choisissez au moins un univers.').waitFor();
  assert.equal(await page.getByRole('button', { name: 'Créer le jeton' }).isDisabled(), false);
  assert.equal((m.app.db.prepare('SELECT COUNT(*) n FROM jetons_api').get() as { n: number }).n, 1, 'seul le jeton du bouchon');
  await page.getByRole('button', { name: 'Annuler' }).click();
  await ctx.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await page.getByText(/Connexion perdue/).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Créer un jeton' }).first().isDisabled(), true);
  await ctx.close();
});

test('modifie_par_admin_pastille_effacee_et_acces_changes_pendant_la_boite', opts, async () => {
  const m = await monde();
  const { ctx, page } = await connecte(browser, m.base, 'Léa');
  await ouvrir(page);
  const valeur = await creer(page, 'Jeton surveillé', async () => {
    await page.getByRole('radio', { name: 'Une liste d’univers' }).click();
    await ligneUnivers(page, 'Essai Kanka').getByRole('radio', { name: 'Lecture', exact: true }).click();
  });
  await page.getByRole('button', { name: 'J’ai copié le jeton' }).click();
  await page.getByText('Jeton surveillé').first().waitFor();
  const admin = (m.app.db.prepare("SELECT id FROM comptes WHERE username = 'admin'").get() as { id: number }).id;
  let decalage = 0;
  // Each mark gets a later date (no real delay needed): the box compares against the last mark it saw.
  const marque = () =>
    m.app.db.prepare('UPDATE jetons_api SET modifie_par_admin_par = ?, modifie_par_admin_le = ? WHERE nom = ?').run(admin, new Date(Date.now() + 60_000 * ++decalage).toISOString(), 'Jeton surveillé');
  marque();
  await page.reload();
  await attendre(page);
  await page.getByText('Modifié par l’admin').waitFor();
  // The admin changes the token again while the box is open: saving reloads, overwrites nothing.
  await page.getByRole('button', { name: 'Modifier les accès de Jeton surveillé' }).click();
  await page.getByRole('radio', { name: 'Une liste d’univers' }).waitFor();
  marque();
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await page.getByText('Les accès ont changé.').waitFor();
  await page.screenshot({ path: `${CAP}/acces-changes.png` });
  assert.equal((m.app.db.prepare('SELECT modifie_par_admin_par p FROM jetons_api WHERE nom = ?').get('Jeton surveillé') as { p: number | null }).p, admin, 'rien n’est écrasé');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await page.getByText('Accès enregistrés.').waitFor({ timeout: 5000 }).catch(async (e: Error) => {
    throw new Error(e.message + ' | boîte: ' + (await page.locator('form').textContent()));
  });
  await attendre(page);
  assert.equal(await page.getByText('Modifié par l’admin').count(), 0, 'la pastille s’efface');
  assert.equal((await api(m.base, valeur, 'GET', `${m.essai}`)).statut, 200);
  await ctx.close();
});

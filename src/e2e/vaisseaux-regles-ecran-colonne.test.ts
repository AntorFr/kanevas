// Revérification de kanevas-outils-vaisseaux-regles (E-22) : où se tient la bande « périmée » et comment s'intitule la colonne
// des résultats. Écrit depuis docs/ecrans.md (« Stale design (workshop) ») : la bande est dans la colonne de droite, au-dessus de
// « Résultats », « Recalculer » dans la bande ; l'étiquette « Résultat enregistré » apparaît une seule fois, sous le titre
// « Résultats » ; un brouillon retire l'étiquette.
//
// PLAN
//   écart 1 : Léa, conception périmée, bureau : la bande partage la colonne des résultats (même bord gauche, même largeur), au-dessus
//             du titre ; « Recalculer » est dans la bande ; la bande n'est pas dans la colonne de gauche (catalogue/choix)
//   écart 2 : périmée et non modifiée : titre « Résultats » seul, aucun « Résultats enregistrés », une seule étiquette « Résultat enregistré »
//   bord    : modifiée (brouillon) : titre « Résultats », zéro étiquette ; recalculée : plus de bande, zéro étiquette
//   trou    : le texte dit « Résultat enregistré » (étiquette), la maquette n'en a pas : on n'exige que l'absence du double
//   390 px  : la bande reste au-dessus du titre des résultats, « Recalculer » dedans, même colonne
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { connecte, launch, skipBrowser, startServer, texte, type Any, type Server } from './harnais.test.ts';

const txt = async (page: Any): Promise<string> => (await texte(page)).replace(/[\u00a0\u202f]/g, ' ');
mkdirSync('/tmp/shots', { recursive: true });
const SHOTS = '/tmp/shots/vaisseaux-regles-colonne';
const BANDE = 'Calculée avec d’anciens réglages.';

let srv: Server;
let browser: Any;
const ctxs: Any[] = [];
before(async () => { if (!skipBrowser) browser = await launch(); });
after(async () => { for (const c of ctxs) await c.close().catch(() => {}); await browser?.close(); srv?.stop(); });

async function monde() {
  srv?.stop();
  srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
  const cookies: Record<string, string> = {};
  const api = async (compte: string, methode: string, chemin: string, corps?: unknown) => {
    if (!cookies[compte]) {
      const r = await fetch(`${srv.base}/connexion-bouchon`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `compte=${compte}` });
      cookies[compte] = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
    }
    const r = await fetch(srv.base + chemin, { method: methode, headers: { cookie: cookies[compte], ...(corps === undefined ? {} : { 'content-type': 'application/json' }) }, body: corps === undefined ? undefined : JSON.stringify(corps) });
    const t = await r.text();
    let json: Any = null;
    try { json = JSON.parse(t); } catch { /* not json */ }
    return { status: r.status, json };
  };
  const E = ((await api('antor', 'GET', '/api/univers')).json as Any[]).find((u) => u.nom === "Éneria d'essai").id as number;
  const B = `/api/univers/${E}/outils/swn/vaisseaux`;
  const liste = (await api('antor', 'GET', `${B}/conceptions`)).json;
  const orak = liste.conceptions.find((c: Any) => c.titre === "Vent d'Orak").ficheId as number;
  const r = await api('antor', 'PUT', `/api/univers/${E}/outils/swn/reglages`, { version: 0, valeurs: { portee_saut: 6 } });
  assert.equal(r.status, 204);
  return { E, orak };
}
type Monde = Awaited<ReturnType<typeof monde>>;

async function ouvrir(m: Monde, largeur?: number): Promise<Any> {
  const { ctx, page } = await connecte(browser, srv.base, 'Léa');
  ctxs.push(ctx);
  if (largeur) await page.setViewportSize({ width: largeur, height: 900 });
  await page.goto(`/univers/${m.E}/outils/swn/vaisseaux?fiche=${m.orak}`);
  await page.getByText(BANDE).waitFor();
  return page;
}

/** Boîte du titre « Résultats » (exact), de la bande, du bouton, de la colonne des résultats. */
async function boites(page: Any) {
  const bande = page.getByRole('status').filter({ hasText: BANDE });
  const titre = page.getByRole('heading', { name: 'Résultats', exact: true });
  assert.equal(await titre.count(), 1, 'un seul titre « Résultats »');
  return {
    bande: await bande.boundingBox(),
    bouton: await bande.getByRole('button', { name: 'Recalculer' }).boundingBox(),
    titre: await titre.boundingBox(),
    colonne: await page.locator('aside.vx-resultats').boundingBox(),
  };
}

describe('E-22 : bande périmée dans la colonne de droite, titre « Résultats »', { skip: skipBrowser, timeout: 240000 }, () => {
  it('bureau : la bande partage la colonne des résultats, au-dessus du titre, « Recalculer » dedans', async () => {
    const m = await monde();
    const page = await ouvrir(m);
    const b = await boites(page);
    assert.ok(b.bande && b.bouton && b.titre && b.colonne, 'bande, bouton, titre et colonne visibles');
    assert.ok(b.bande.y + b.bande.height <= b.titre.y + 1, 'bande au-dessus du titre « Résultats »');
    assert.ok(Math.abs(b.bande.x - b.colonne.x) <= 4, `bande au bord gauche de la colonne de droite (${b.bande.x} / ${b.colonne.x})`);
    assert.ok(Math.abs(b.bande.width - b.colonne.width) <= 8, `bande aussi large que la colonne de droite (${b.bande.width} / ${b.colonne.width})`);
    assert.ok(b.colonne.x > 400, 'la colonne de droite est à droite de l’écran');
    // « Recalculer » est dans la bande, pas à côté
    assert.ok(b.bouton.x >= b.bande.x - 1 && b.bouton.x + b.bouton.width <= b.bande.x + b.bande.width + 1, 'bouton dans la bande (horizontal)');
    assert.ok(b.bouton.y >= b.bande.y - 1 && b.bouton.y + b.bouton.height <= b.bande.y + b.bande.height + 1, 'bouton dans la bande (vertical)');
    // la deuxième ligne de la bande
    await page.getByText('Le texte de la fiche n’a pas changé. Enregistrer ou recalculer le met à jour.').waitFor();
    await page.screenshot({ path: `${SHOTS}-bureau.png`, fullPage: true });
  });

  it('périmée et non modifiée : titre « Résultats » seul, jamais « Résultats enregistrés » + « Résultat enregistré » en double', async () => {
    const m = await monde();
    const page = await ouvrir(m);
    await page.getByText('685 000 cr').first().waitFor();
    await page.getByText('Calcul…').waitFor({ state: 'detached' });
    assert.ok(await page.getByText('Résultat enregistré', { exact: true }).count() <= 1, 'jamais l’étiquette en double');
    assert.equal(await page.getByText('Résultats enregistrés').count(), 0, 'pas de titre « Résultats enregistrés »');
    assert.equal(await page.getByRole('heading', { name: 'Résultats', exact: true }).count(), 1);
    const t = await txt(page);
    assert.ok((t.match(/Résultats? enregistrés?/g) ?? []).length <= 1, 'le texte de la page ne dit pas « enregistré » en double');
    assert.match(t, /685 000 cr/);
    await page.screenshot({ path: `${SHOTS}-titre.png`, fullPage: true });
  });

  it('modifiée : brouillon : titre « Résultats », plus d’étiquette ; recalculée : plus de bande', async () => {
    const m = await monde();
    const page = await ouvrir(m);
    await page.getByRole('button', { name: "Augmenter la quantité : Lance d'essai" }).click();
    await page.getByText('Résultat enregistré', { exact: true }).waitFor({ state: 'detached' });
    assert.equal(await page.getByText('Résultats enregistrés').count(), 0);
    assert.equal(await page.getByRole('heading', { name: 'Résultats', exact: true }).count(), 1);
    await page.getByRole('button', { name: 'Recalculer' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Recalculer' }).click();
    await page.getByText('Conception recalculée.').waitFor();
    await page.getByText(BANDE).waitFor({ state: 'detached' });
    assert.equal(await page.getByText('Résultat enregistré', { exact: true }).count(), 0);
    await page.screenshot({ path: `${SHOTS}-recalcule.png`, fullPage: true });
  });

  it('390 px : bande au-dessus du titre « Résultats », même colonne, « Recalculer » dedans', async () => {
    const m = await monde();
    const page = await ouvrir(m, 390);
    const b = await boites(page);
    assert.ok(b.bande && b.bouton && b.titre && b.colonne);
    assert.ok(b.bande.y + b.bande.height <= b.titre.y + 1, 'bande au-dessus du titre');
    assert.ok(Math.abs(b.bande.x - b.colonne.x) <= 4 && Math.abs(b.bande.width - b.colonne.width) <= 8, 'même colonne que les résultats');
    assert.ok(b.bouton.y >= b.bande.y - 1 && b.bouton.y + b.bouton.height <= b.bande.y + b.bande.height + 1, 'bouton dans la bande');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'pas de défilement horizontal');
    assert.equal(await page.getByText('Résultats enregistrés').count(), 0);
    await page.screenshot({ path: `${SHOTS}-390.png`, fullPage: true });
  });
});

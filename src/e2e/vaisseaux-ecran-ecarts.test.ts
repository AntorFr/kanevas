// Review tests of kanevas-outils-vaisseaux-ecran, from docs/ecrans.md (E-22, E-9): the motive and buttons of a blocked save stay
// visible at 390 px, « Caractéristiques » is a horizontal framed table, a catalogue row carries « Univers » and its figures.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { connecte, launch, skipBrowser, startServer, texte, type Any, type Server } from './harnais.test.ts';

let srv: Server;
let browser: Any;
const ctxs: Any[] = [];
before(async () => {
  if (skipBrowser) return;
  browser = await launch();
  srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
});
after(async () => { for (const c of ctxs) await c.close().catch(() => {}); await browser?.close(); srv?.stop(); });

async function api(compte: string, chemin: string): Promise<Any> {
  const r = await fetch(`${srv.base}/connexion-bouchon`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `compte=${compte}` });
  const cookie = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
  return (await fetch(srv.base + chemin, { headers: { cookie } })).json();
}
async function ids(): Promise<{ E: number; orak: number }> {
  const E = ((await api('antor', '/api/univers')) as Any[]).find((u) => u.nom === "Éneria d'essai").id as number;
  const l = await api('antor', `/api/univers/${E}/outils/swn/vaisseaux/conceptions`);
  return { E, orak: l.conceptions.find((c: Any) => c.titre === "Vent d'Orak").ficheId };
}
async function page(compte: string, url: string, largeur: number): Promise<Any> {
  const { ctx, page: p } = await connecte(browser, srv.base, compte === 'lea' ? 'Léa' : compte);
  ctxs.push(ctx);
  await p.setViewportSize({ width: largeur, height: 640 });
  await p.goto(url);
  return p;
}
const dansVue = async (loc: Any): Promise<boolean> => loc.evaluate((e: Element) => {
  const r = e.getBoundingClientRect();
  if (!(r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth)) return false;
  const sur = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); // not clipped by a scrolling parent nor covered
  return !!sur && e.contains(sur);
});

describe('E-22 à 390 px, alerte bloquante', { skip: skipBrowser }, () => {
  it('« Enregistrer », « Annuler » et le motif sont visibles sans défiler', async () => {
    const { E, orak } = await ids();
    const p = await page('lea', `/univers/${E}/outils/swn/vaisseaux?fiche=${orak}`, 390);
    await p.getByText('Résultats enregistrés').waitFor();
    await p.getByRole('button', { name: "Augmenter la quantité : Lance d'essai" }).click();
    await p.getByText('Puissance insuffisante : −2').first().waitFor();
    await p.getByText('Enregistrement refusé : Puissance insuffisante (−2).').waitFor();
    await p.screenshot({ path: '/tmp/shots/ecarts-390-alerte.png' });
    assert.equal(await dansVue(p.getByRole('button', { name: 'Enregistrer' })), true, 'Enregistrer in view');
    assert.equal(await dansVue(p.getByRole('button', { name: 'Annuler' })), true, 'Annuler in view');
    assert.equal(await dansVue(p.getByText('Enregistrement refusé : Puissance insuffisante (−2).')), true, 'motive in view');
  });
});

describe('E-9 « Caractéristiques »', { skip: skipBrowser }, () => {
  it('est un tableau horizontal : les mesures en en-têtes, une seule ligne de valeurs, 685 000 cr', async () => {
    const { E, orak } = await ids();
    const p = await page('lea', `/univers/${E}/fiche/${orak}`, 1100);
    await p.getByText(/Générée par/).waitFor();
    const t = p.locator('[data-testid="composant-caracteristiques"] table');
    await t.waitFor();
    assert.equal(await t.locator('tbody tr').count(), 1, 'one row of values');
    assert.ok(await t.locator('thead th').count() >= 4, 'one header per measure');
    assert.match((await t.innerText()).replace(/[  ]/g, ' '), /685 000 cr/);
    await p.screenshot({ path: '/tmp/shots/ecarts-e9-tableau.png' });
  });
});

describe('E-22 lignes de choix', { skip: skipBrowser }, () => {
  it('« Lance d’essai » (élément d’univers) porte « Univers » dans sa ligne, « Canon léger » (système) non', async () => {
    const { E, orak } = await ids();
    const p = await page('lea', `/univers/${E}/outils/swn/vaisseaux?fiche=${orak}`, 1100);
    await p.getByText('Résultats enregistrés').waitFor();
    await p.getByRole('button', { name: 'Ajouter : Armes' }).click();
    await p.getByText('Canon léger').first().waitFor();
    await p.screenshot({ path: '/tmp/shots/ecarts-lignes.png' });
    const ligne = (nom: string) => p.locator('li').filter({ has: p.getByRole('button', { name: new RegExp(`^Ajouter\\s*${nom}`) }) }).last();
    const lance = (await ligne("Lance d'essai").innerText()).replace(/[  ]/g, ' ');
    const canon = (await ligne('Canon léger').innerText()).replace(/[  ]/g, ' ');
    assert.match(lance, /Univers/);
    assert.doesNotMatch(canon, /Univers/);
    assert.match(canon, /\d/, 'figures on the row');
    await p.screenshot({ path: '/tmp/shots/ecarts-lignes.png' });
  });
});

describe('E-22 / E-9 : le haut du panneau de résultats et la largeur du tableau', { skip: skipBrowser }, () => {
  it('à 390 px, en défilant, le titre « Résultats » et l’alerte restent visibles sous les barres du cadre', async () => {
    const { E, orak } = await ids();
    const p = await page('lea', `/univers/${E}/outils/swn/vaisseaux?fiche=${orak}`, 390);
    await p.getByText('Résultats enregistrés').waitFor();
    await p.getByRole('button', { name: "Augmenter la quantité : Lance d'essai" }).click();
    await p.getByText('Puissance insuffisante : −2').first().waitFor();
    await p.mouse.move(195, 500);
    await p.mouse.wheel(0, 600);
    await p.evaluate(() => window.scrollBy(0, 600));
    await p.screenshot({ path: '/tmp/shots/ecarts-390-colle.png' });
    const barres = await p.evaluate(() => Math.max(...[...document.querySelectorAll('.bandeau, .haute')].map((e) => e.getBoundingClientRect().bottom)));
    const titre = p.locator('.vx-resultats h2').first();
    const haut = await titre.evaluate((e: Element) => e.getBoundingClientRect().top);
    assert.ok(haut >= barres - 0.5, `titre sous les barres (${haut} >= ${barres})`);
    assert.equal(await dansVue(titre), true, 'titre « Résultats » non couvert');
    assert.equal(await dansVue(p.getByText('Enregistrement refusé : Puissance insuffisante (−2).')), true, 'motif (alerte répétée sous le bouton) non couvert');
  });

  it('« Caractéristiques » tient dans la largeur de la fiche à 1440 px, bordure droite visible', async () => {
    const { E, orak } = await ids();
    const p = await page('lea', `/univers/${E}/fiche/${orak}`, 1440);
    await p.getByText(/Générée par/).waitFor();
    const t = p.locator('[data-testid="composant-caracteristiques"] table');
    await t.waitFor();
    const m = await t.evaluate((e: Element) => {
      const r = e.getBoundingClientRect();
      const conteneur = (e.closest('.vx-section') ?? e.parentElement!).getBoundingClientRect();
      return { droite: r.right, conteneurDroite: conteneur.right, largeur: r.width, conteneurLargeur: conteneur.width, defile: (e.closest('.vx-section') as HTMLElement | null)?.scrollWidth ?? 0, client: (e.closest('.vx-section') as HTMLElement | null)?.clientWidth ?? 0 };
    });
    assert.ok(m.droite <= m.conteneurDroite + 0.5, `tableau dans son conteneur ${JSON.stringify(m)}`);
    assert.ok(m.defile <= m.client + 1, `aucun défilement horizontal à 1440 px ${JSON.stringify(m)}`);
    assert.equal(await t.locator('thead th').last().evaluate((e: Element) => e.getBoundingClientRect().right <= window.innerWidth), true);
    await p.screenshot({ path: '/tmp/shots/ecarts-e9-1440.png' });
  });

  it('« Caractéristiques » à 390 px : défilement horizontal dans un cadre, la page ne déborde pas', async () => {
    const { E, orak } = await ids();
    const p = await page('lea', `/univers/${E}/fiche/${orak}`, 390);
    await p.getByText(/Générée par/).waitFor();
    await p.locator('[data-testid="composant-caracteristiques"] table').waitFor();
    const d = await p.evaluate(() => ({ page: document.documentElement.scrollWidth, vue: window.innerWidth }));
    assert.ok(d.page <= d.vue + 1, `la page ne défile pas horizontalement ${JSON.stringify(d)}`);
    await p.screenshot({ path: '/tmp/shots/ecarts-e9-390.png' });
  });
});

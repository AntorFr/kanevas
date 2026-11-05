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
    // from 390 px the panel is whole in the flow (arbitration 22:44): the blocking alert, then the save row, are reached by scrolling the page
    await p.getByText('Bloquante').first().scrollIntoViewIfNeeded();
    assert.equal(await dansVue(p.getByText('Bloquante').first()), true, 'alerte Bloquante visible');
    await p.getByRole('button', { name: 'Enregistrer' }).scrollIntoViewIfNeeded();
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
  it('à 390 px le panneau « Résultats » est entier dans le flux : ni collant, ni plafonné, ni zone interne qui défile, au-dessus du catalogue', async () => {
    const { E, orak } = await ids();
    const p = await page('lea', `/univers/${E}/outils/swn/vaisseaux?fiche=${orak}`, 390);
    await p.getByText('Résultats enregistrés').waitFor();
    await p.getByRole('button', { name: "Augmenter la quantité : Lance d'essai" }).click();
    await p.getByText('Puissance insuffisante : −2').first().waitFor();
    const m = await p.locator('.vx-resultats').evaluate((e: Element) => {
      const d = e.querySelector('.vx-defile') as HTMLElement | null;
      const r = e.getBoundingClientRect();
      const choix = document.querySelector('.vx-choix')!.getBoundingClientRect();
      return { position: getComputedStyle(e).position, maxHeight: getComputedStyle(e).maxHeight, interne: d ? d.scrollHeight - d.clientHeight : 0, bas: r.bottom + window.scrollY, hautChoix: choix.top + window.scrollY, sous: r.height >= e.scrollHeight - 1 };
    });
    assert.notEqual(m.position, 'sticky');
    assert.equal(m.maxHeight, 'none');
    assert.ok(m.interne <= 1, `aucune zone interne qui défile ${JSON.stringify(m)}`);
    assert.ok(m.sous, 'panneau entier');
    assert.ok(m.bas <= m.hautChoix + 2, `résultats au-dessus du catalogue ${JSON.stringify(m)}`);
    // page scrolled: the panel leaves with the page (not pinned under the frame bars)
    await p.evaluate(() => window.scrollBy(0, 600));
    const haut = await p.locator('.vx-resultats').evaluate((e: Element) => e.getBoundingClientRect().top);
    assert.ok(haut < 88 || (await p.evaluate(() => window.scrollY)) === 0, 'non collé sous les barres');
    await p.locator('.vx-resultats').scrollIntoViewIfNeeded();
    await p.getByText('Bloquante').first().scrollIntoViewIfNeeded();
    assert.equal(await dansVue(p.getByText('Bloquante').first()), true, 'alerte Bloquante visible');
    await p.screenshot({ path: '/tmp/shots/ecarts-390-flux.png' });
  });

  it('à 760 px et plus le panneau « Résultats » est collant sous les barres du cadre', async () => {
    const { E, orak } = await ids();
    const p = await page('lea', `/univers/${E}/outils/swn/vaisseaux?fiche=${orak}`, 1100);
    await p.getByText('Résultats enregistrés').waitFor();
    assert.equal(await p.locator('.vx-resultats').evaluate((e: Element) => getComputedStyle(e).position), 'sticky');
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
    const sec = await p.locator('.vx-section').first().evaluate((e: Element) => ({ defile: e.scrollWidth > e.clientWidth + 1, fonds: getComputedStyle(e).backgroundImage.split('linear-gradient').length - 1, dernier: (e.querySelector('th:last-child') as HTMLElement).getBoundingClientRect().right > e.getBoundingClientRect().right }));
    assert.ok(sec.defile, 'le cadre défile horizontalement');
    assert.ok(sec.fonds >= 4, 'dégradés de bord (indice de défilement)');
    assert.ok(sec.dernier, 'des colonnes restent cachées au départ');
    await p.screenshot({ path: '/tmp/shots/ecarts-e9-390.png' });
  });
});

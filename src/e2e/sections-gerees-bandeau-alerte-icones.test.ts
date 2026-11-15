// Revérification of kanevas-outils-sections-gerees, written from docs/charte.md (Icons: « an icon beside each
// navigation item and each action »; error = --danger-fond / --danger with an icon) and docs/ecrans.md E-9
// (error and conflict texts) — not from the code. Screenshots: /tmp/cap-gere-icones (outside the tracked tree).
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { connecte, launch, section, skipBrowser, startServer, type Any, type Server } from './harnais.test.ts';

const SHOTS = '/tmp/cap-gere-icones';
const DANGER = ['rgb(236, 123, 111)', 'rgb(180, 53, 43)'];

describe('bandeau d’une section gérée : une icône à chaque action, erreurs et conflit en alerte de la charte', { skip: skipBrowser, timeout: 300000 }, () => {
  let srv: Server;
  let browser: Any;
  let U = 0;
  let S = 0;
  let ficheId = 0;
  let leaId = 0;
  const api = (u: string) => `/api/univers/${U}${u}`;
  const ok = async (r: Any, statut: number, quoi: string) => assert.equal(r.status(), statut, `${quoi}: ${await r.text()}`);
  const aller = async (page: Any) => {
    await page.goto(`/univers/${U}/fiche/${ficheId}`);
    await section(page, 'Caractéristiques').waitFor();
  };
  /** An action carries a Lucide icon: an svg inside the control, hidden from assistive technology. */
  const icone = async (controle: Any, quoi: string) => {
    await controle.waitFor();
    assert.equal(await controle.locator('svg').count(), 1, `${quoi}: une icône`);
    assert.equal(await controle.locator('svg').first().getAttribute('aria-hidden'), 'true', `${quoi}: icône décorative`);
  };
  /** The alert is the red block of the charte: icon beside the text, --danger on --danger-fond. */
  const verifierAlerte = async (texte: Any, quoi: string) => {
    await texte.waitFor();
    const r = await texte.evaluate((el: Element) => {
      let bloc: Element | null = el;
      while (bloc && !bloc.querySelector(':scope > svg') && !bloc.parentElement?.querySelector(':scope > svg')) bloc = bloc.parentElement;
      const parent = (bloc?.querySelector(':scope > svg') ? bloc : bloc?.parentElement) as HTMLElement;
      const svg = parent.querySelector(':scope > svg') as SVGElement;
      return { icone: !!svg, couleur: getComputedStyle(svg).color, fond: getComputedStyle(parent).backgroundColor, role: el.getAttribute('role') };
    });
    assert.ok(r.icone, `${quoi}: icône à côté du message`);
    assert.ok(DANGER.includes(r.couleur), `${quoi}: icône en --danger, obtenu ${r.couleur}`);
    assert.match(r.fond, /^rgba\(\d+, \d+, \d+, 0\.1\d*\)$/, `${quoi}: fond --danger-fond, obtenu ${r.fond}`);
    assert.equal(r.role, 'alert', `${quoi}: role=alert`);
  };

  before(async () => {
    mkdirSync(SHOTS, { recursive: true });
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
    const a = await connecte(browser, srv.base, 'Antor');
    const us = (await (await a.page.request.get('/api/univers')).json()) as Any[];
    const u = us.find((x) => x.nom === "Éneria d'essai");
    U = u.id; S = u.systemeId ?? u.systeme_id ?? u.systeme?.id;
    const ms = (await (await a.page.request.get(api('/membres'))).json()) as Any;
    const lea = (ms.membres ?? ms).find((m: Any) => /^l[ée]a$/i.test(m.username ?? ''));
    leaId = lea.compteId ?? lea.id;
    await ok(await a.page.request.put(`/api/systemes/${S}/outils/essai/g/activation`, { data: { active: true } }), 204, 'activation');
    await ok(await a.page.request.put(`/api/systemes/${S}/outils/essai/g/visibilite`, { data: { mj: true, joueur: true } }), 204, 'visibilite');
    const f = await a.page.request.post(api('/fiches'), { data: { type: 'objet', titre: "Vaisseau d'icônes" } });
    await ok(f, 201, 'fiche');
    ficheId = ((await f.json()) as Any).id;
    for (const type of ['caracteristiques', 'notes']) {
      await ok(await a.page.request.post(api('/outils/essai/g/sections'), { data: { ficheId, type, auteurId: leaId } }), 201, type);
    }
    await ok(await a.page.request.put(api('/outils/essai/g/reglages'), { data: { version: 0, valeurs: { marge: 20 } } }), 204, 'marge');
    await a.ctx.close();
  });
  after(async () => { await browser?.close(); srv?.stop(); });

  it('chaque action du bandeau porte une icône : Ouvrir, Recalculer, Voir la proposition, Proposer un recalcul', async () => {
    const a = await connecte(browser, srv.base, 'Antor');
    await aller(a.page);
    const car = section(a.page, 'Caractéristiques');
    await car.getByText('Calculée avec d’anciens réglages.').waitFor();
    await icone(car.getByRole('link', { name: 'Ouvrir dans l’outil' }), 'Ouvrir dans l’outil');
    await icone(car.getByRole('button', { name: 'Recalculer' }), 'Recalculer');
    const notes = section(a.page, 'Notes');
    await icone(notes.getByRole('link', { name: 'Ouvrir dans l’outil' }), 'Ouvrir (Notes)');
    await icone(notes.getByRole('button', { name: 'Voir la proposition' }), 'Voir la proposition');
    await a.page.screenshot({ path: `${SHOTS}/icones.png`, fullPage: true });
    // abandon the proposal: « Proposer un recalcul » replaces it
    await notes.getByRole('button', { name: 'Voir la proposition' }).click();
    await a.page.getByRole('button', { name: 'Ignorer' }).click();
    await a.page.getByRole('button', { name: 'Ignorer' }).waitFor({ state: 'detached' });
    await aller(a.page);
    await icone(section(a.page, 'Notes').getByRole('button', { name: 'Proposer un recalcul' }), 'Proposer un recalcul');
    await a.ctx.close();
  });

  it('échec du recalcul : « Le recalcul n’a pas abouti. Réessayez. » est l’alerte de la charte (icône, danger), le bouton revient', async () => {
    const a = await connecte(browser, srv.base, 'Antor');
    await ok(await a.page.request.put(api('/outils/essai/g/reglages'), { data: { version: 1, valeurs: { marge: 30 } } }), 204, 'marge 30');
    await aller(a.page);
    const car = section(a.page, 'Caractéristiques');
    await car.getByText('Calculée avec d’anciens réglages.').waitFor();
    await a.page.route('**/sections/*/recalcul', (route: Any) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"code":"erreur"}' }));
    await car.getByRole('button', { name: 'Recalculer' }).click();
    await verifierAlerte(car.getByText('Le recalcul n’a pas abouti. Réessayez.'), 'erreur de recalcul');
    await car.getByRole('button', { name: 'Recalculer' }).waitFor();
    await a.page.screenshot({ path: `${SHOTS}/erreur.png`, fullPage: true });
    await a.page.unroute('**/sections/*/recalcul');
    await a.ctx.close();
  });

  it('conflit : « La section a changé… » est l’alerte de la charte avec « Recharger la section » (icône)', async () => {
    const a = await connecte(browser, srv.base, 'Antor');
    await aller(a.page);
    const car = section(a.page, 'Caractéristiques');
    await a.page.route('**/sections/*/recalcul', (route: Any) => route.fulfill({ status: 409, contentType: 'application/json', body: '{"code":"conflit"}' }));
    await car.getByRole('button', { name: 'Recalculer' }).click();
    await verifierAlerte(car.getByText(/La section a changé depuis que vous l.avez ouverte\. Rechargez-la pour voir la nouvelle version\./), 'conflit');
    await icone(car.getByRole('button', { name: 'Recharger la section' }), 'Recharger la section');
    await a.page.screenshot({ path: `${SHOTS}/conflit.png`, fullPage: true });
    await a.page.unroute('**/sections/*/recalcul');
    await a.ctx.close();
  });
});

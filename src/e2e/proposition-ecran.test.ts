// Black-box tests of kanevas-mo-ecran: the « Mise à jour proposée » block of E-12
// (docs/ecrans.md § `kanevas-monde`, docs/charte.md « Proposition de mise à jour »), real server in
// stub mode (AD-55, script AD-78) + real Chromium. Expected texts are literals from the docs.
//
// TEST PLAN
//   nominal    : Antor asks → block with « Actuel » / « Proposé », the section is unchanged; « Appliquer »
//                → « Appliquée : la section « … » est à jour. », the sheet shows the proposed content
//   périmée    : section edited after the proposal; click « Appliquer » → alert, aria-disabled, nothing
//                written, « Abandonner » still active; « Abandonner » → « Proposition abandonnée. »
//   exclusion  : Léa asks → no block; an applied block stays « appliquée » when the section changes later
//   états      : loading, read error + « Réessayer », gesture error, connection lost (gestes disabled),
//                « Cette proposition n'existe plus. », 19 900 characters in focusable scrolling zones,
//                raw text (no HTML), 390 px stacked zones
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { type Any, attendre, connecte, launch, skipBrowser, startServer } from './harnais.test.js';

const opts = { skip: skipBrowser };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let antor: Any;
let lea: Any;
let U = 0;
let fiche = 0;
let sec = 0;
const DEMANDE = "Mets à jour la section « Vérité » de « Maître Aldric » d'après le compte-rendu « Séance 3 »";

async function api(page: Any, method: string, url: string, data?: unknown): Promise<Any> {
  const r = await page.request.fetch(srv.base + url, { method, data });
  const t = await r.text();
  return { status: r.status(), json: t ? JSON.parse(t) : null };
}

/** Puts the section back to a known content (through the API, as the sheet would). */
async function poser(contenu: string): Promise<void> {
  const url = `/api/univers/${U}/fiches/${fiche}/sections/${sec}`;
  const cur = (await api(antor, 'GET', url)).json;
  const r = await api(antor, 'PUT', `${url}/contenu`, { contenu, version: cur.version });
  assert.equal(r.status, 200);
}
const lireSection = async (): Promise<string> =>
  (await api(antor, 'GET', `/api/univers/${U}/fiches/${fiche}/sections/${sec}`)).json.contenu;

before(async () => {
  if (skipBrowser) return;
  srv = await startServer();
  browser = await launch();
  antor = (await connecte(browser, srv.base, 'Antor')).page;
  lea = (await connecte(browser, srv.base, 'Léa')).page;
  U = (await api(antor, 'POST', '/api/univers', { nom: 'Lame d’Ébène' })).json.id;
  await api(antor, 'POST', `/api/univers/${U}/membres`, { username: 'lea', role: 'joueur' });
  const camp = (await api(antor, 'POST', `/api/univers/${U}/campagnes`, { nom: 'La Couronne brisée' })).json;
  await api(antor, 'POST', `/api/univers/${U}/comptes-rendus`, { campagneId: camp.id, titre: 'Séance 3', texte: 'Aldric trahit.' });
  fiche = (await api(antor, 'POST', `/api/univers/${U}/fiches`, { type: 'personnage', titre: 'Maître Aldric', charge: { pj: false } })).json.id;
  sec = (await api(antor, 'POST', `/api/univers/${U}/fiches/${fiche}/sections`, { titre: 'Vérité', contenu: 'Il sert la Couronne' })).json.id;
});

after(async () => {
  if (skipBrowser) return;
  await browser?.close();
  srv?.stop();
});

const panneau = (p: Any) => p.getByRole('complementary', { name: /Kanevas — assistant/ });
const bloc = (p: Any) => panneau(p).locator('.asst-prop').last();

async function demander(p: Any, avant?: (p: Any) => Promise<void>): Promise<void> {
  if (avant) await avant(p);
  await p.goto(`/univers/${U}/fiche/${fiche}`);
  await attendre(p);
  await p.getByRole('button', { name: 'Demander à Kanevas' }).click();
  await panneau(p).getByRole('textbox', { name: 'Demander à Kanevas' }).fill(DEMANDE);
  await panneau(p).getByRole('button', { name: 'Envoyer' }).click();
}
const appliquer = (p: Any) => bloc(p).getByRole('button', { name: 'Appliquer' });
const abandonner = (p: Any) => bloc(p).getByRole('button', { name: 'Abandonner' });
const attendreBloc = async (p: Any) => {
  await appliquer(p).waitFor();
  await attendre(p);
};

test('nominal : Actuel / Proposé, section inchangée, Appliquer → Appliquée et la fiche montre le proposé', opts, async () => {
  await poser('Il sert la Couronne');
  await demander(antor);
  await attendreBloc(antor);
  const b = bloc(antor);
  await b.getByText('Mise à jour proposée').waitFor();
  assert.match(await b.innerText(), /Section « Vérité » de « Maître Aldric » · d’après « Séance 3 »/);
  assert.equal(await b.getByRole('region', { name: 'Actuel' }).innerText(), 'Actuel\nIl sert la Couronne');
  assert.equal(
    await b.getByRole('region', { name: 'Proposé' }).innerText(),
    "Proposé\nIl sert la Couronne\n\nMise à jour d'après « Séance 3 ».",
  );
  assert.equal(await lireSection(), 'Il sert la Couronne');
  await appliquer(antor).click();
  await b.getByRole('status').filter({ hasText: 'Appliquée : la section « Vérité » est à jour.' }).waitFor();
  assert.equal(await lireSection(), "Il sert la Couronne\n\nMise à jour d'après « Séance 3 ».");
  assert.equal(await b.getByRole('button', { name: 'Appliquer' }).count(), 0);
  assert.equal(await b.getByRole('region', { name: 'Proposé' }).count(), 0);
  assert.match(await b.getByRole('region', { name: 'Actuel' }).innerText(), /Mise à jour d'après « Séance 3 »\./);
  assert.equal(await antor.evaluate(() => document.activeElement?.getAttribute('role')), 'status');
  // an applied proposal stays applied when the section changes afterwards
  await poser('Encore autre chose');
  await antor.getByRole('button', { name: 'Fermer' }).first().click();
  await antor.getByRole('button', { name: 'Demander à Kanevas' }).click();
  await b.getByText(/Appliquée :/).waitFor();
  assert.equal(await b.getByRole('alert').count(), 0);
});

test('périmée : la modification de la section est découverte au clic, rien n’est écrit, Abandonner reste actif', opts, async () => {
  await poser('Il sert la Couronne');
  await demander(antor);
  await attendreBloc(antor);
  await poser('Modifié par Antor');
  await appliquer(antor).click();
  const b = bloc(antor);
  await b.getByRole('alert').filter({ hasText: 'La section a changé depuis la proposition. Demandez-en une nouvelle.' }).waitFor();
  assert.equal(await appliquer(antor).getAttribute('aria-disabled'), 'true');
  assert.equal(await abandonner(antor).getAttribute('aria-disabled'), null);
  assert.equal(await lireSection(), 'Modifié par Antor');
  assert.equal(await b.getByRole('region', { name: 'Actuel' }).innerText(), 'Actuel\nModifié par Antor');
  await abandonner(antor).click();
  await b.getByRole('status').filter({ hasText: 'Proposition abandonnée.' }).waitFor();
  assert.equal(await b.getByRole('region', { name: 'Actuel' }).count(), 0);
  assert.equal(await b.getByRole('button', { name: 'Appliquer' }).count(), 0);
  assert.equal(await lireSection(), 'Modifié par Antor');
});

test('exclusion : Léa fait la même demande et n’obtient aucun bloc', opts, async () => {
  await poser('Il sert la Couronne');
  await demander(lea);
  await panneau(lea).getByText(/ne fait pas partie de ceux dont vous disposez/).waitFor();
  assert.equal(await lea.locator('.asst-prop').count(), 0);
  assert.equal(await lea.getByText('Mise à jour proposée').count(), 0);
  assert.equal(await lireSection(), 'Il sert la Couronne');
});

test('erreur de lecture : message et « Réessayer » qui relit', opts, async () => {
  await poser('Il sert la Couronne');
  let panne = true;
  await antor.route(/\/propositions\/\d+$/, (r: Any) =>
    panne && r.request().method() === 'GET' ? r.fulfill({ status: 500, contentType: 'application/json', body: '{}' }) : r.continue(),
  );
  await demander(antor);
  await bloc(antor).getByRole('alert').filter({ hasText: 'Je n’ai pas pu afficher la proposition — réessayer' }).waitFor();
  assert.equal(await bloc(antor).getByRole('region').count(), 0);
  panne = false;
  await bloc(antor).getByRole('button', { name: 'Réessayer' }).click();
  await attendreBloc(antor);
  await antor.unroute(/\/propositions\/\d+$/);
});

test('chargement : « Chargement de la proposition… » sans zones ni gestes', opts, async () => {
  await poser('Il sert la Couronne');
  await antor.route(/\/propositions\/\d+$/, async (r: Any) => {
    if (r.request().method() === 'GET') await new Promise((s) => setTimeout(s, 2000));
    await r.continue();
  });
  await demander(antor);
  const b = bloc(antor);
  await b.getByRole('status').filter({ hasText: 'Chargement de la proposition…' }).waitFor();
  assert.equal(await b.getByRole('button').count(), 0);
  assert.equal(await b.getByRole('region').count(), 0);
  await attendreBloc(antor);
  await antor.unroute(/\/propositions\/\d+$/);
});

test('erreur d’un geste : « L’action n’a pas abouti. Réessayez. », gestes réactivés, proposition en attente', opts, async () => {
  await poser('Il sert la Couronne');
  let panne = true;
  await antor.route(/\/propositions\/\d+\/appliquer$/, (r: Any) =>
    panne ? r.fulfill({ status: 500, contentType: 'application/json', body: '{}' }) : r.continue(),
  );
  await demander(antor);
  await attendreBloc(antor);
  await appliquer(antor).click();
  await bloc(antor).getByRole('alert').filter({ hasText: 'L’action n’a pas abouti. Réessayez.' }).waitFor();
  assert.equal(await appliquer(antor).getAttribute('aria-disabled'), null);
  assert.equal(await abandonner(antor).getAttribute('aria-disabled'), null);
  assert.equal(await lireSection(), 'Il sert la Couronne');
  panne = false;
  await appliquer(antor).click();
  await bloc(antor).getByText(/Appliquée :/).waitFor();
  await antor.unroute(/\/propositions\/\d+\/appliquer$/);
});

test('connexion perdue : bandeau, zones lisibles, gestes aria-disabled, réactivés au retour', opts, async () => {
  await poser('Il sert la Couronne');
  await demander(antor);
  await attendreBloc(antor);
  await antor.context().setOffline(true);
  await antor.evaluate(() => window.dispatchEvent(new Event('offline')));
  await bloc(antor).getByText(/Connexion perdue\. Ce que vous voyez peut être dépassé/).waitFor();
  assert.equal(await appliquer(antor).getAttribute('aria-disabled'), 'true');
  assert.equal(await abandonner(antor).getAttribute('aria-disabled'), 'true');
  assert.equal(await bloc(antor).getByRole('region', { name: 'Actuel' }).count(), 1);
  await antor.context().setOffline(false);
  await antor.evaluate(() => window.dispatchEvent(new Event('online')));
  await antor.waitForFunction(() => document.querySelector('.asst-prop button')?.getAttribute('aria-disabled') === null);
});

test('proposition disparue : « Cette proposition n’existe plus. », plus de zones ni de geste', opts, async () => {
  await poser('Il sert la Couronne');
  await demander(antor);
  await attendreBloc(antor);
  await antor.route(/\/propositions\/\d+\/appliquer$/, (r: Any) =>
    r.fulfill({ status: 404, contentType: 'application/json', body: '{"erreur":"Introuvable."}' }),
  );
  await appliquer(antor).click();
  await bloc(antor).getByText('Cette proposition n’existe plus.').waitFor();
  assert.equal(await bloc(antor).getByRole('region').count(), 0);
  assert.equal(await bloc(antor).getByRole('button', { name: 'Abandonner' }).count(), 0);
  await antor.unroute(/\/propositions\/\d+\/appliquer$/);
});

test('contenu long : zones de 15 lignes au plus, défilables au clavier, paragraphes conservés', opts, async () => {
  let long = '';
  for (let i = 0; long.length < 19900; i++) long += `Paragraphe ${i} ${'mot '.repeat(30)}\n\n`;
  await poser(long.slice(0, 19900));
  await demander(antor);
  await attendreBloc(antor);
  for (const nom of ['Actuel', 'Proposé']) {
    const z = bloc(antor).getByRole('region', { name: nom });
    assert.equal(await z.getAttribute('tabindex'), '0');
    const m = await z.evaluate((e: Element) => ({ sh: e.scrollHeight, ch: e.clientHeight }));
    assert.ok(m.sh > m.ch, `${nom} défile`);
    assert.ok(m.ch <= 15 * 24 + 40, `${nom} borné (${m.ch}px)`);
  }
  const actuel = bloc(antor).getByRole('region', { name: 'Actuel' });
  await actuel.focus();
  await antor.keyboard.press('PageDown');
  await antor.waitForFunction(() => (document.querySelector('.asst-prop-zone') as Element).scrollTop > 0);
  assert.equal(await actuel.locator('.asst-prop-texte').evaluate((e: Element) => getComputedStyle(e).whiteSpace), 'pre-wrap');
  await poser('Il sert la Couronne');
});

test('texte brut : du HTML dans la section s’affiche tel quel', opts, async () => {
  await poser('<img src=x onerror="window.__x=1"><b>gras</b>');
  await demander(antor);
  await attendreBloc(antor);
  assert.equal(await bloc(antor).locator('.asst-prop-texte img, .asst-prop-texte b').count(), 0);
  assert.match(await bloc(antor).getByRole('region', { name: 'Actuel' }).innerText(), /<img src=x onerror="window\.__x=1"><b>gras<\/b>/);
  assert.equal(await antor.evaluate(() => (window as Any).__x), undefined);
  await poser('Il sert la Couronne');
});

test('390 px : les zones s’empilent, « Actuel » d’abord', opts, async () => {
  await poser('Il sert la Couronne');
  await antor.setViewportSize({ width: 390, height: 800 });
  try {
    await demander(antor);
    await attendreBloc(antor);
    const zs = await bloc(antor).locator('.asst-prop-zone').evaluateAll((l: Element[]) =>
      l.map((e) => ({ x: Math.round(e.getBoundingClientRect().x), y: e.getBoundingClientRect().y, n: e.getAttribute('aria-label') })),
    );
    assert.deepEqual(zs.map((z: Any) => z.n), ['Actuel', 'Proposé']);
    assert.equal(zs[0].x, zs[1].x);
    assert.ok(zs[1].y > zs[0].y);
  } finally {
    await antor.setViewportSize({ width: 1280, height: 720 });
  }
});

test('défilement : à l’arrivée de la réponse, le bloc et ses gestes sont visibles dans le fil', opts, async () => {
  await poser('Il sert la Couronne');
  await antor.setViewportSize({ width: 390, height: 600 });
  try {
    await demander(antor);
    await attendreBloc(antor);
    await antor.waitForFunction(() => {
      const fil = document.querySelector('.asst-fil') as Element;
      const b = Array.from(document.querySelectorAll('.asst-prop-gestes button')).pop() as Element;
      const f = fil.getBoundingClientRect();
      const r = b.getBoundingClientRect();
      return r.top >= f.top && r.bottom <= f.bottom + 1;
    });
  } finally {
    await antor.setViewportSize({ width: 1280, height: 720 });
  }
});

test('défilement : au téléphone, le refus « section changée » garde les gestes visibles dans le fil', opts, async () => {
  await poser('Il sert la Couronne');
  await antor.setViewportSize({ width: 390, height: 600 });
  try {
    await demander(antor);
    await attendreBloc(antor);
    await poser('Modifié par Antor');
    // a DOM click: Playwright's own click would scroll the button into view and hide the bug
    await appliquer(antor).evaluate((el) => (el as HTMLElement).click());
    await bloc(antor).getByRole('alert').filter({ hasText: 'La section a changé depuis la proposition.' }).waitFor();
    await antor.waitForFunction(() => {
      const fil = document.querySelector('.asst-fil') as Element;
      const b = Array.from(document.querySelectorAll('.asst-prop-gestes button, .asst-prop-gestes a')).pop() as Element;
      const f = fil.getBoundingClientRect();
      const r = b.getBoundingClientRect();
      return r.top >= f.top && r.bottom <= f.bottom + 1;
    });
  } finally {
    await antor.setViewportSize({ width: 1280, height: 720 });
  }
});

// Independent re-check of E-12 « périmée … découverte au clic » on a phone: the fil already holds an earlier
// block (so it is long and scrolled), a second proposal arrives, the section changes, then « Appliquer ».
// Fails if the fil is only scrolled once (on arrival) and not again when the refusal makes the block taller.
test('défilement : au téléphone, avec deux blocs dans le fil, le refus « section changée » garde les gestes du dernier bloc visibles', opts, async () => {
  await poser('Il sert la Couronne');
  await antor.setViewportSize({ width: 390, height: 600 });
  try {
    await demander(antor);
    await attendreBloc(antor);
    await panneau(antor).getByRole('textbox', { name: 'Demander à Kanevas' }).fill(DEMANDE);
    await panneau(antor).getByRole('button', { name: 'Envoyer' }).click();
    await panneau(antor).locator('.asst-prop').nth(1).getByRole('button', { name: 'Appliquer' }).waitFor();
    await attendre(antor);
    assert.equal(await panneau(antor).locator('.asst-prop').count(), 2);
    await poser('Modifié par Antor');
    assert.equal(await lireSection(), 'Modifié par Antor');
    await appliquer(antor).evaluate((el) => (el as HTMLElement).click());
    await bloc(antor).getByRole('alert').filter({ hasText: 'La section a changé depuis la proposition.' }).waitFor();
    assert.equal(await lireSection(), 'Modifié par Antor', 'rien n’est écrit');
    await antor.waitForFunction(() => {
      const fil = document.querySelector('.asst-fil') as Element;
      const blocs = document.querySelectorAll('.asst-prop');
      const dernier = blocs[blocs.length - 1] as Element;
      const b = Array.from(dernier.querySelectorAll('.asst-prop-gestes button, .asst-prop-gestes a')).pop() as Element;
      const f = fil.getBoundingClientRect();
      const r = b.getBoundingClientRect();
      return r.top >= f.top && r.bottom <= f.bottom + 1;
    }, undefined, { timeout: 3000 });
  } finally {
    await antor.setViewportSize({ width: 1280, height: 720 });
  }
});

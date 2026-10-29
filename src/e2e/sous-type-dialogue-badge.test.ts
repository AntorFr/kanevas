// Browser tests of kanevas-sous-type-dialogue-badge, from its exit criterion (B-52, E-9): the GM's sub-type in the
// type badge shows on hover and focus that it edits in place (--surface-3 background, 12 px pencil, focus ring),
// without moving the badge; a player / player mode sees plain text; a lost connection disables it.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { type Any, attendre, connecte, launch, skipBrowser, startServer, type Server } from './harnais.test.js';

const CAPTURES = process.env.CAPTURES_DIR ?? '/tmp/caps';
let srv: Server;
let browser: Any;

describe('kanevas-sous-type-dialogue-badge, au navigateur', { skip: skipBrowser }, () => {
  let antor: Any;
  let lame = 0;
  let pnj = 0;
  let sans = 0;
  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'Antor')).page;
    const api = async (method: string, url: string, data?: unknown): Promise<Any> => {
      const r = await antor.request.fetch(srv.base + url, { method, data });
      assert.ok(r.status() < 300, `${method} ${url} -> ${r.status()}`);
      return r.json();
    };
    lame = ((await api('GET', '/api/univers')) as { id: number; nom: string }[]).find((u) => u.nom === "Lame d'Ébène")!.id;
    pnj = (await api('POST', `/api/univers/${lame}/fiches`, { type: 'personnage', titre: 'Hesk', sousType: 'Capitaine', charge: { pj: false }, sections: [{ titre: 'Portrait', joueursLisent: true }] })).id;
    sans = (await api('POST', `/api/univers/${lame}/fiches`, { type: 'personnage', titre: 'Orrin', charge: { pj: false } })).id;
  });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  const ouvrir = async (page: Any, id: number) => {
    await page.goto(`/univers/${lame}/fiche/${id}`);
    await attendre(page);
    await page.locator('.type').first().waitFor();
  };
  const bouton = (page: Any) => page.locator('.type .sous-type-bouton');
  const style = (loc: Any, sel: string | null, prop: string) =>
    loc.evaluate((e: Element, [s, p]: [string | null, string]) => getComputedStyle(s ? e.querySelector(s)! : e).getPropertyValue(p), [sel, prop]);
  const largeur = (page: Any) => page.locator('.type').first().evaluate((e: Element) => e.getBoundingClientRect().width);
  const fond = (loc: Any) => style(loc, null, 'background-color');
  const surface3 = async (page: Any) =>
    page.evaluate(() => {
      const d = document.createElement('div');
      d.style.background = 'var(--surface-3)';
      document.body.appendChild(d);
      const c = getComputedStyle(d).backgroundColor;
      d.remove();
      return c;
    });

  test('MJ : au survol, fond --surface-3 et crayon 12 px visibles, largeur du badge inchangée', async () => {
    await ouvrir(antor, pnj);
    const b = bouton(antor);
    assert.equal(await b.count(), 1);
    const s3 = await surface3(antor);
    const avant = await largeur(antor);
    assert.equal(await style(b, '.crayon', 'opacity'), '0');
    assert.notEqual(await fond(b), s3);
    assert.equal(await b.locator('.crayon').evaluate((e: Element) => e.getBoundingClientRect().width), 12);
    await b.hover();
    assert.equal(await fond(b), s3);
    assert.equal(await style(b, '.crayon', 'opacity'), '1');
    assert.equal(await largeur(antor), avant, 'le badge ne bouge pas');
    assert.equal(await style(b, null, 'cursor'), 'text');
    await antor.screenshot({ path: `${CAPTURES}/sous-type-badge-survol.png` });
  });

  test('MJ : à la tabulation, fond, crayon et anneau 2 px --focus décalé de 2 px ; Entrée ouvre l’édition en place', async () => {
    await ouvrir(antor, pnj);
    const b = bouton(antor);
    const avant = await largeur(antor);
    await antor.mouse.move(0, 0);
    let n = 0;
    while (!(await b.evaluate((e: Element) => e === document.activeElement)) && n++ < 40) await antor.keyboard.press('Tab');
    assert.ok(n < 40, 'atteint à la tabulation');
    assert.equal(await fond(b), await surface3(antor));
    assert.equal(await style(b, '.crayon', 'opacity'), '1');
    assert.equal(await style(b, null, 'outline-width'), '2px');
    assert.equal(await style(b, null, 'outline-offset'), '2px');
    assert.notEqual(await style(b, null, 'outline-style'), 'none');
    const focus = await antor.evaluate(() => {
      const d = document.createElement('div');
      d.style.color = 'var(--focus)';
      document.body.appendChild(d);
      const c = getComputedStyle(d).color;
      d.remove();
      return c;
    });
    assert.equal(await style(b, null, 'outline-color'), focus);
    assert.equal(await largeur(antor), avant);
    await antor.screenshot({ path: `${CAPTURES}/sous-type-badge-focus.png` });
    await antor.keyboard.press('Enter');
    await antor.locator('.type .sous-type-edition input').waitFor();
  });

  test('nom accessible : « Sous-type : Capitaine. Modifier le sous-type » et « Ajouter un sous-type » ; libellé vide en --texte-2 au survol', async () => {
    await ouvrir(antor, pnj);
    assert.equal(await antor.getByRole('button', { name: 'Sous-type : Capitaine. Modifier le sous-type' }).count(), 1);
    await ouvrir(antor, sans);
    const b = antor.getByRole('button', { name: 'Ajouter un sous-type' });
    assert.equal(await b.count(), 1);
    assert.equal(await b.innerText(), 'Sous-type');
    const t3 = () => antor.evaluate((v: string) => {
      const d = document.createElement('div');
      d.style.color = `var(${v})`;
      document.body.appendChild(d);
      const c = getComputedStyle(d).color;
      d.remove();
      return c;
    }, '--texte-3');
    const t2 = await antor.evaluate(() => {
      const d = document.createElement('div');
      d.style.color = 'var(--texte-2)';
      document.body.appendChild(d);
      const c = getComputedStyle(d).color;
      d.remove();
      return c;
    });
    assert.equal(await style(b, null, 'color'), await t3(), 'au repos : --texte-3');
    const avant = await largeur(antor);
    await b.hover();
    assert.equal(await style(b, null, 'color'), t2);
    assert.equal(await style(b, '.crayon', 'color'), t2);
    assert.equal(await fond(b), await surface3(antor));
    assert.equal(await largeur(antor), avant);
  });

  test('émulation tactile (hover: none) : crayon visible sans survol', async () => {
    const ctx = await browser.newContext({ baseURL: srv.base, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await page.goto('/connexion-bouchon');
    await page.getByRole('button', { name: /^Se connecter en tant que Antor$/i }).click();
    await page.waitForLoadState('networkidle');
    await page.emulateMedia({ media: 'screen' });
    await ouvrir(page, pnj);
    const aucun = await page.evaluate(() => matchMedia('(hover: none)').matches);
    if (aucun) {
      assert.equal(await style(bouton(page), '.crayon', 'opacity'), '1');
      await page.screenshot({ path: `${CAPTURES}/sous-type-badge-tactile.png` });
    } else {
      // Chromium of this image does not report hover: none for the emulated device: the rule is checked in the stylesheet.
      const regle = await page.evaluate(() =>
        [...document.styleSheets].flatMap((s) => [...s.cssRules]).some((r) => r instanceof CSSMediaRule && r.conditionText.includes('hover: none') && r.cssText.includes('.crayon') && r.cssText.includes('opacity: 1')),
      );
      assert.ok(regle, 'règle (hover: none) → crayon opacity 1');
    }
    await ctx.close();
  });

  test('Joueuse et mode Joueur : texte seul, ni bouton, ni fond, ni crayon, ni arrêt de tabulation', async () => {
    const lecteur = (await connecte(browser, srv.base, 'Léa')).page;
    const r = await lecteur.request.fetch(`${srv.base}/api/univers/${lame}/fiches/${pnj}`);
    if (r.status() === 200) {
      await ouvrir(lecteur, pnj);
      assert.match(await lecteur.locator('.type').first().innerText(), /Capitaine/);
      assert.equal(await lecteur.locator('.type button, .type .crayon, .type svg.lucide-pencil').count(), 0, await lecteur.locator('.type').first().innerHTML());
      await lecteur.locator('.type').getByText('Capitaine').hover();
      assert.notEqual(await fond(lecteur.locator('.type').getByText('Capitaine')), await surface3(lecteur));
      for (let i = 0; i < 30; i++) {
        await lecteur.keyboard.press('Tab');
        assert.equal(await lecteur.evaluate(() => !!document.activeElement?.closest('.type')), false);
      }
    } else {
      assert.fail(`Léa ne lit pas la fiche : ${r.status()}`);
    }
    // GM in player mode.
    await ouvrir(antor, pnj);
    await antor.getByRole('radio', { name: 'Mode Joueur' }).check();
    await antor.getByText(/Mode Joueur : vous voyez ce que voit un joueur\./).waitFor();
    await antor.locator('.type').first().waitFor();
    assert.match(await antor.locator('.type').first().innerText(), /Capitaine/);
    assert.equal(await antor.locator('.type button, .type svg.lucide-pencil').count(), 0, await antor.locator('.type').first().innerHTML());
    for (let i = 0; i < 30; i++) {
      await antor.keyboard.press('Tab');
      assert.equal(await antor.evaluate(() => !!document.activeElement?.closest('.type')), false);
    }
  });

  // Gaps measured on the rendered text (Range), in px: type text → dot, dot → sub-type text, and the dot's right edge → the focus ring's outer edge.
  const ecarts = async (page: Any) => {
    await page.evaluate(() => {
      (globalThis as Any).__name = (f: unknown) => f; // tsx's keepNames helper, absent from the page
    });
    return page.locator('.type').first().evaluate((badge: Element) => {
      const rect = (n: Node) => {
        const r = document.createRange();
        r.selectNodeContents(n);
        return r.getBoundingClientRect();
      };
      const texte = (n: Node): Node[] => (n.nodeType === 3 ? ((n.textContent ?? '').trim() ? [n] : []) : [...n.childNodes].flatMap(texte));
      const point = badge.querySelector('.point-type')!;
      const bouton = badge.querySelector('.sous-type-bouton');
      const st = bouton ?? badge.querySelector('.sous-type')!;
      const nom = texte(badge).find((n) => !point.contains(n) && !st.contains(n))!;
      const pr = rect(point.firstChild!);
      const sr = rect(texte(st)[0]!);
      return { avant: pr.left - rect(nom).right, apres: sr.left - pr.right, point: pr.right, bouton: bouton ? bouton.getBoundingClientRect().left : null, texte: sr.left };
    });
  };

  test('le point « · » est à égale distance du type et du sous-type (MJ, Joueuse, mode Joueur) et l’anneau de focus ne le touche pas', async () => {
    const egal = (e: { avant: number; apres: number }, qui: string) => {
      assert.ok(Math.abs(e.avant - e.apres) <= 1, `${qui} : ${e.avant} px avant le point, ${e.apres} px après`);
      assert.ok(e.avant >= 8, `${qui} : point trop collé (${e.avant} px)`);
    };
    await ouvrir(antor, pnj);
    const mj = await ecarts(antor);
    egal(mj, 'MJ');
    // Focus ring: 2 px outline at 2 px offset, around the button's box → outer edge at button.left - 4; the dot must stay clear of it.
    assert.ok(mj.bouton! - 4 - mj.point >= 1, `l’anneau (bord ${mj.bouton! - 4}) touche le point (bord droit ${mj.point})`);
    const b = bouton(antor);
    await antor.mouse.move(0, 0);
    let n = 0;
    while (!(await b.evaluate((e: Element) => e === document.activeElement)) && n++ < 40) await antor.keyboard.press('Tab');
    const focus = await ecarts(antor);
    assert.deepEqual([focus.avant, focus.apres], [mj.avant, mj.apres], 'le focus ne déplace pas le point');
    const lecteur = (await connecte(browser, srv.base, 'Léa')).page;
    await ouvrir(lecteur, pnj);
    const lea = await ecarts(lecteur);
    egal(lea, 'Joueuse');
    await antor.mouse.move(0, 0);
    await antor.getByRole('radio', { name: 'Mode Joueur' }).check();
    await antor.getByText(/Mode Joueur : vous voyez ce que voit un joueur\./).waitFor();
    await antor.locator('.type .sous-type').first().waitFor();
    egal(await ecarts(antor), 'mode Joueur');
    assert.ok(Math.abs(lea.avant - mj.avant) <= 1 && Math.abs(lea.apres - mj.apres) <= 1, 'même écart en lecture et en gestion');
  });

  test('connexion perdue : sous-type désactivé, sans fond ni crayon, hors de la tabulation', async () => {
    const { ctx, page } = await connecte(browser, srv.base, 'Antor');
    await ouvrir(page, pnj);
    await ctx.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    const b = bouton(page);
    await page.waitForFunction(() => (document.querySelector('.type .sous-type-bouton') as HTMLButtonElement | null)?.disabled === true);
    await b.hover({ force: true });
    assert.notEqual(await fond(b), await surface3(page));
    assert.equal(await style(b, '.crayon', 'display'), 'none');
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Tab');
      assert.equal(await b.evaluate((e: Element) => e === document.activeElement), false);
    }
    await ctx.setOffline(false);
    await ctx.close();
  });
});

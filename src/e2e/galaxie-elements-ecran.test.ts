// ecrans: cartes
// Browser test of kanevas-carte-spatiale-elements-ecran (E-23 « elements », B-96, P-22.4, P-22.5, P-26), written from the exit criterion and
// docs/ecrans.md « E-23 — elements », not from the code. The systems are seeded straight into the stub database (defined systems, so no anchoring).
// The effect of the routes has its door (src/services/swn/ecriture-elements.test.ts); here: what the user does and sees.
// Screenshots go to /tmp/cap-elements-r (never into the workspace).
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import Database from 'better-sqlite3';
import { connecte, launch, skipBrowser, startServer, type Any, type Server } from './harnais.test.ts';

const SHOTS = '/tmp/cap-elements-r';
const A = { q: 70, r: 71 }; // Vael: the star, Vael II, a moon; the GM's gestures
const B = { q: 72, r: 71 }; // Brume: bodies and a station « Réservé au MJ »
const C = { q: 74, r: 71 }; // Foule: 12 bodies, moons, a belt, 8 elements
const D = { q: 76, r: 71 }; // Éphémère: deleted while the add dialog is open

describe('E-23 éléments : le MJ place, déplace et réserve ; la joueuse ne voit que ce qu’il lui laisse', { skip: skipBrowser, timeout: 900000 }, () => {
  let srv: Server;
  let browser: Any;
  let dbPath = '';
  let univers = 0;
  let gid = 0;
  const adr = (p: { q: number; r: number }) => `/univers/${univers}/outils/swn/galaxie/${gid}/interieur/${p.q}/${p.r}`;
  const hors = async (page: Any, nom: string) => page.screenshot({ path: `${SHOTS}/${nom}.png`, fullPage: true });
  const sql = <T>(fn: (db: Any) => T): T => { const db = new Database(dbPath); try { return fn(db); } finally { db.close(); } };
  const ouvrir = async (compte: string, p: { q: number; r: number }, l = 1280, h = 900) => {
    const c = await connecte(browser, srv.base, compte);
    await c.page.setViewportSize({ width: l, height: h });
    await c.page.goto(adr(p));
    await c.page.getByRole('heading', { name: /^Corps \(\d+\)$/ }).waitFor();
    return c;
  };
  const elementsDe = (cle: string) => sql((db) => db.prepare(
    'SELECT e.cle, e.nom, e.secret, e.orbite, e.heure, a.cle AS sur FROM swn_elements e JOIN swn_systemes s ON s.id = e.systeme_id LEFT JOIN swn_astres a ON a.id = e.astre_id WHERE s.cle = ? ORDER BY e.id').all(cle));
  const marque = (page: Any, nom: string) => page.locator('button.cs-element').filter({ hasText: '' }).and(page.locator(`[aria-label^="${nom},"]`));

  before(async () => {
    mkdirSync(SHOTS, { recursive: true });
    dbPath = join(mkdtempSync(join(tmpdir(), 'kanevas-elements-')), 'k.db');
    srv = await startServer({ KANEVAS_SANS_SEMIS: '', DB_PATH: dbPath });
    browser = await launch();
    const a = await connecte(browser, srv.base, 'Antor');
    const us = (await (await a.page.request.get('/api/univers')).json()) as Any;
    univers = (us.univers ?? us).find((u: Any) => u.nom === "Éneria d'essai").id;
    const cartes = (await (await a.page.request.get(`/api/univers/${univers}/cartes`)).json()) as Any;
    gid = Number(String(cartes.cartes.find((c: Any) => c.titre === "Galaxie d'essai").adresse).split('/').pop());
    await a.ctx.close();
    sql((db) => {
      const sys = db.prepare("INSERT INTO swn_systemes (galaxie_id, univers_id, cle, nom, q, r, taille, couleur, notes, secret, promu) VALUES (?,?,?,?,?,?,0.75,'#8b9bf0','',0,1)");
      const ast = db.prepare('INSERT INTO swn_astres (systeme_id, cle, genre, parent_id, etoile_rang, type, nom, orbite, heure, taille) VALUES (?,?,?,?,?,?,?,?,?,?)');
      const el = db.prepare('INSERT INTO swn_elements (systeme_id, cle, genre, nom, astre_id, orbite, heure, aspect, secret) VALUES (?,?,?,?,?,?,?,?,?)');
      const aspect = (icone: string, couleur: string) => JSON.stringify({ icone, couleur });
      const nouveau = (cle: string, nom: string, p: { q: number; r: number }) => Number(sys.run(gid, univers, cle, nom, p.q, p.r).lastInsertRowid);

      const va = nouveau('el-vael', 'Vael', A);
      ast.run(va, 'v-etoile', 'etoile', null, 0, 'jaune', 'Soleil de Vael', 0, 0, 0.3);
      ast.run(va, 'v-vael2', 'planete', null, 0, 'tellurique', 'Vael II', 3, 2, 0.3);
      ast.run(va, 'v-vael3', 'planete', null, 0, 'gazeuse', 'Vael III', 6, 8, 0.3);

      const br = nouveau('el-brume', 'Brume', B);
      ast.run(br, 'b-etoile', 'etoile', null, 0, 'jaune', 'Soleil de Brume', 0, 0, 0.3);
      ast.run(br, 'b-p', 'planete', null, 0, 'tellurique', 'Brume I', 3, 2, 0.3);
      el.run(br, 'lyre', 'station', 'Station Lyre', null, 5, 6, aspect('station', 'accent'), 1);
      el.run(br, 'cargo', 'vaisseau', 'Cargo Public', null, 2, 9, aspect('vaisseau', 'accent'), 0);

      const fo = nouveau('el-foule', 'Foule', C);
      ast.run(fo, 'f-etoile', 'etoile', null, 0, 'jaune', 'Soleil de Foule', 0, 0, 0.3);
      for (let i = 0; i < 12; i++) {
        const id = Number(ast.run(fo, `f-p${i}`, 'planete', null, 0, 'tellurique', `Planète ${i}`, 1 + (i % 6) * 0.9, (i * 5) % 12, 0.3).lastInsertRowid);
        if (i % 3 === 0) ast.run(fo, `f-l${i}`, 'lune', id, 0, 'rocheux', `Lune ${i}`, null, (i + 3) % 12, 0.15);
      }
      const prem = Number(db.prepare("SELECT id FROM swn_astres WHERE cle = 'f-p0'").get().id);
      db.prepare("INSERT INTO swn_formations (systeme_id, cle, forme, nom, parametres, etoile_rang) VALUES (?,?,?,?,?,?)")
        .run(fo, 'f-ceinture', 'anneau', 'Ceinture de Kral', JSON.stringify({ orbite_min: 3, orbite_max: 3.4 }), 0);
      for (let i = 0; i < 8; i++) {
        el.run(fo, `f-e${i}`, 'vaisseau', `Navire ${i}`, i < 2 ? prem : null, i < 2 ? null : 1 + i * 0.7, i < 2 ? null : (i * 3) % 12, aspect('vaisseau', 'accent'), i === 7 ? 1 : 0);
      }

      const ep = nouveau('el-ephemere', 'Éphémère', D);
      ast.run(ep, 'e-etoile', 'etoile', null, 0, 'jaune', 'Soleil éphémère', 0, 0, 0.3);
      ast.run(ep, 'e-p', 'planete', null, 0, 'tellurique', 'Éphémère I', 3, 2, 0.3);
    });
  }, { timeout: 180000 });
  after(async () => { await browser?.close(); srv?.stop(); });

  it('Antor ajoute « Aube-Brisée » sur Vael II : « Sur Vael II », ligne en base sans orbite ni heure', async () => {
    const { page, ctx } = await ouvrir('Antor', A);
    await page.getByRole('button', { name: /^Système/ }).click();
    await page.getByRole('menuitem', { name: 'Ajouter un élément…' }).click();
    const dialogue = page.getByRole('dialog', { name: 'Ajouter un élément' });
    await dialogue.waitFor();
    // empty name: refused, nothing written
    assert.equal(await dialogue.getByRole('button', { name: 'Ajouter', exact: true }).isDisabled(), true);
    await dialogue.getByLabel('Nom').fill('Aube-Brisée');
    await dialogue.getByRole('radio', { name: 'Sur un astre' }).click();
    await dialogue.getByLabel('Astre').selectOption({ label: 'Vael II — Tellurique' }).catch(async () => dialogue.getByLabel('Astre').selectOption('v-vael2'));
    await hors(page, '01-ajouter');
    const reponse = page.waitForResponse((r: Any) => r.url().endsWith('/elements') && r.request().method() === 'POST');
    await dialogue.getByRole('button', { name: 'Ajouter', exact: true }).click();
    assert.equal((await reponse).status(), 201);
    const panneau = page.getByRole('region', { name: 'Élément sélectionné' });
    await panneau.getByRole('heading', { name: 'Aube-Brisée' }).waitFor();
    assert.match(await panneau.innerText(), /Sur Vael II/);
    assert.deepEqual(await elementsDe('el-vael'), [{ cle: (await elementsDe('el-vael'))[0].cle, nom: 'Aube-Brisée', secret: 0, orbite: null, heure: null, sur: 'v-vael2' }]);
    await hors(page, '02-aube-brisee');
    await ctx.close();
  });

  it('Vael II déplacée : le vaisseau la suit après rechargement (même lieu « Sur Vael II », marque déplacée)', async () => {
    const { page, ctx } = await ouvrir('Antor', A);
    const avant = await page.locator('button.cs-element').first().boundingBox();
    sql((db) => db.prepare("UPDATE swn_astres SET orbite = 5, heure = 10 WHERE cle = 'v-vael2'").run());
    await page.reload();
    await page.getByRole('heading', { name: /^Corps \(\d+\)$/ }).waitFor();
    const apres = await page.locator('button.cs-element').first().boundingBox();
    assert.ok(Math.hypot(apres.x - avant.x, apres.y - avant.y) > 30, 'la marque a suivi la planète');
    await page.locator('button.cs-element').first().click();
    assert.match(await page.getByRole('region', { name: 'Élément sélectionné' }).innerText(), /Sur Vael II/);
    await ctx.close();
  });

  it('Antor : « Réservé au MJ » écrit, « MJ seul » au panneau et à la liste ; « Modifier… » sans nom refusé ; « Retirer Aube-Brisée ? »', async () => {
    const { page, ctx } = await ouvrir('Antor', A);
    await page.locator('button.cs-element').first().click();
    const panneau = page.getByRole('region', { name: 'Élément sélectionné' });
    const interrupteur = panneau.getByRole('switch', { name: 'Réservé au MJ' });
    assert.equal(await page.getByRole('switch').count(), 1, 'seul commutateur de l’écran');
    const rep = page.waitForResponse((r: Any) => r.url().endsWith('/secret') && r.request().method() === 'PUT');
    await interrupteur.click();
    assert.equal((await rep).status(), 200);
    await panneau.getByText('MJ seul', { exact: true }).waitFor();
    assert.equal((await elementsDe('el-vael'))[0].secret, 1);
    await page.getByRole('list', { name: 'Éléments du système' }).getByText('MJ seul').waitFor();
    await hors(page, '03-reserve');
    await interrupteur.click();
    await page.waitForFunction(() => document.querySelector('[role=switch][aria-checked=true]') === null);
    assert.equal((await elementsDe('el-vael'))[0].secret, 0);

    await panneau.getByRole('button', { name: 'Modifier…' }).click();
    const nom = page.getByLabel('Nom');
    await nom.fill('');
    assert.equal(await page.getByRole('button', { name: /^Enregistrer/ }).isDisabled(), true, 'nom vide : pas d’enregistrement');
    await page.getByText('Donnez un nom à cet élément.').waitFor();
    await nom.fill('Aube-Brisée II');
    await page.getByRole('button', { name: /^Enregistrer/ }).click();
    await page.getByRole('region', { name: 'Élément sélectionné' }).getByRole('heading', { name: 'Aube-Brisée II' }).waitFor();
    assert.equal((await elementsDe('el-vael'))[0].nom, 'Aube-Brisée II');
    await ctx.close();
  });

  it('retirer Vael II demande « Retirer Vael II ? Son élément (1) sera retiré. » ; Annuler ne retire rien ; Retirer retire les deux', async () => {
    const { page, ctx } = await ouvrir('Antor', A);
    await page.locator('.cs-corps[data-cle="v-vael2"]').click();
    await page.getByRole('region', { name: 'Corps sélectionné' }).getByRole('button', { name: 'Retirer' }).click();
    const d = page.getByRole('alertdialog', { name: 'Retirer Vael II ?' });
    await d.waitFor();
    assert.match(await d.innerText(), /Son élément \(1\) sera retiré\./);
    await hors(page, '04-retrait-corps');
    await d.getByRole('button', { name: 'Annuler' }).click();
    assert.equal((await elementsDe('el-vael')).length, 1, 'Annuler ne retire rien');
    await page.getByRole('region', { name: 'Corps sélectionné' }).getByRole('button', { name: 'Retirer' }).click();
    await d.waitFor();
    await d.getByRole('button', { name: /^Retirer/ }).last().click();
    await d.waitFor({ state: 'detached' });
    assert.equal((await elementsDe('el-vael')).length, 0, 'l’élément part avec son corps');
    assert.equal(sql((db) => db.prepare("SELECT COUNT(*) n FROM swn_astres WHERE cle = 'v-vael2'").get().n), 0);
    await ctx.close();
  });

  it('station « Réservé au MJ » : Léa lit tous les corps et ni la station, ni un trou, ni un compte ; Antor en Mode Joueur de même ; Antor la voit marquée', async () => {
    const lea = await ouvrir('Léa', B);
    await lea.page.locator('button.cs-element').first().waitFor();
    assert.equal(await lea.page.locator('button.cs-element').count(), 1, 'seul le cargo public');
    assert.equal(await lea.page.getByText('Station Lyre').count(), 0);
    assert.equal(await lea.page.locator('[aria-label*="Station Lyre"]').count(), 0);
    assert.equal(await lea.page.getByText('MJ seul').count(), 0);
    assert.equal(await lea.page.getByRole('heading', { name: 'Éléments (1)' }).count(), 1, 'le compte est celui des éléments lus');
    assert.equal(await lea.page.getByRole('heading', { name: /^Corps \(2\)$/ }).count(), 1);
    const api = await lea.page.request.get(`/api/univers/${univers}/outils/swn/galaxie/galaxies/${gid}/interieur/${B.q}/${B.r}`);
    const texte = await api.text();
    assert.ok(!texte.includes('Station Lyre') && !texte.includes('lyre'), 'la réponse du serveur ne porte pas la station');
    await hors(lea.page, '05-lea');
    await lea.ctx.close();

    const mj = await ouvrir('Antor', B);
    await mj.page.locator('button.cs-element').first().waitFor();
    await mj.page.waitForFunction(() => document.querySelectorAll('button.cs-element').length === 2);
    assert.equal(await mj.page.locator('button.cs-element.reserve').count(), 1, 'anneau en tirets + cadenas : classe réservé');
    await mj.page.getByRole('list', { name: 'Éléments du système' }).getByText('MJ seul').waitFor();
    await hors(mj.page, '06-mj');
    await mj.page.getByRole('radio', { name: /Joueur/ }).click();
    await mj.page.getByText('Mode Joueur : vous voyez ce que voit un joueur.').waitFor();
    await mj.page.waitForFunction(() => document.querySelectorAll('button.cs-element').length === 1);
    assert.equal(await mj.page.getByText('Station Lyre').count(), 0);
    assert.equal(await mj.page.getByText('MJ seul').count(), 0);
    assert.equal(await mj.page.getByRole('heading', { name: 'Éléments (1)' }).count(), 1);
    await mj.page.locator('button.cs-element').click();
    const p = mj.page.getByRole('region', { name: 'Élément sélectionné' });
    await p.waitFor();
    for (const m of ['Déplacer', 'Poser sur un astre', 'Modifier', 'Lier', 'Retirer']) assert.equal(await p.getByRole('button', { name: new RegExp(m) }).count(), 0, m);
    assert.equal(await mj.page.getByRole('switch').count(), 0, 'pas de commutateur en Mode Joueur');
    await hors(mj.page, '07-mode-joueur');
    await mj.ctx.close();
  });

  it('12 corps, lunes, ceinture et 8 éléments, à 1280 px et à 390 px : aucune étiquette ne chevauche un corps, un élément ou une autre étiquette', async () => {
    for (const [l, h] of [[1280, 900], [390, 780]] as const) {
      const { page, ctx } = await ouvrir('Antor', C, l, h);
      await page.locator('button.cs-element').first().waitFor();
      assert.equal(await page.locator('button.cs-element').count(), 8);
      await page.locator('.cs-etiquette').first().waitFor();
      await page.waitForFunction(() => document.querySelectorAll('.cs-etiquette').length >= 8);
      const rects = await page.evaluate(`(() => {
        var r = function (e) { var b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, id: e.getAttribute('data-cle') || e.getAttribute('aria-label') || '' }; };
        var tous = function (q) { return Array.prototype.slice.call(document.querySelectorAll(q)).map(r); };
        return { etiquettes: tous('.cs-etiquette'), corps: tous('.cs-corps'), marques: tous('button.cs-element') };
      })()`);
      // The drawn disc of each body: the map's hook gives its centre (relative to the map) and its screen radius; the offset of the map comes from the centre of the hit button.
      const disques = await page.evaluate(`(() => {
        var cr = window.__carteSysteme();
        return cr.corps.filter(function (k) { return k.rayon > 0 && document.querySelector('.cs-corps[data-cle="' + k.cle + '"]'); }).map(function (k) {
          var b = document.querySelector('.cs-corps[data-cle="' + k.cle + '"]').getBoundingClientRect();
          return { id: k.cle, cx: b.x + b.width / 2, cy: b.y + b.height / 2, r: k.rayon };
        });
      })()`);
      const surDisque = (e: Any, d: Any) => {
        const px = Math.max(e.x, Math.min(d.cx, e.x + e.w)), py = Math.max(e.y, Math.min(d.cy, e.y + e.h));
        return Math.hypot(px - d.cx, py - d.cy) < d.r - 0.5;
      };

      const cognent = (a: Any, b: Any) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;
      assert.ok(rects.etiquettes.length > 0);
      for (const e of rects.etiquettes) {
        // judged against the drawn disc (the hook's screen radius), never the 22 px hit button, which is wider than the body at 390 px
        if (l === 390) for (const d of disques) assert.ok(!surDisque(e, d), `l’étiquette ${e.id} chevauche le corps ${d.id}`);
        for (const m of rects.marques) assert.ok(!cognent(e, m), `l’étiquette ${e.id} chevauche la marque ${m.id}`);
      }
      for (let i = 0; i < rects.etiquettes.length; i++) for (let j = i + 1; j < rects.etiquettes.length; j++) {
        assert.ok(!cognent(rects.etiquettes[i], rects.etiquettes[j]), `${rects.etiquettes[i].id} chevauche ${rects.etiquettes[j].id}`);
      }
      await hors(page, `08-foule-${l}`);
      await ctx.close();
    }
  });

  it('élément ajouté sur un système supprimé entre-temps : « Ce système n’existe plus. », rien n’est écrit', async () => {
    const { page, ctx } = await ouvrir('Antor', D);
    await page.getByRole('button', { name: /^Système/ }).click();
    await page.getByRole('menuitem', { name: 'Ajouter un élément…' }).click();
    const dialogue = page.getByRole('dialog', { name: 'Ajouter un élément' });
    await dialogue.waitFor();
    await dialogue.getByLabel('Nom').fill('Fantôme');
    sql((db) => { db.prepare("DELETE FROM swn_systemes WHERE cle = 'el-ephemere'").run(); });
    await dialogue.getByRole('button', { name: 'Ajouter', exact: true }).click();
    await page.getByText('Ce système n’existe plus.').waitFor();
    await hors(page, '09-systeme-supprime');
    assert.equal(sql((db) => db.prepare("SELECT COUNT(*) n FROM swn_elements WHERE nom = 'Fantôme'").get().n), 0);
    await ctx.close();
  });
});

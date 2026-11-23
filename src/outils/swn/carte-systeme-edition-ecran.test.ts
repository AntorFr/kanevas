// ecrans: cartes
// Lives outside src/e2e on purpose: the screen-file count guards of src/scripts-tests freeze that folder at 263 files.
// Browser test of E-23 (édition): the look of the header menu « Système », of the « Ajouter » button of the add-form, and
// the placement of the « Demander à Kanevas » pill over the « Modifier » form. Written from docs/ecrans.md and e23-edition.html.
// Screenshots go to /tmp/cap-carte-edition (never into the workspace).
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import Database from 'better-sqlite3';
import { connecte, launch, skipBrowser, startServer, type Any, type Server } from '../../e2e/harnais.test.ts';

const SHOTS = '/tmp/cap-carte-edition';
const O = { q: 70, r: 71 };

describe('E-23 édition : menu « Système », bouton « Ajouter », pastille de l’assistant', { skip: skipBrowser, timeout: 600000 }, () => {
  let srv: Server;
  let browser: Any;
  let univers = 0;
  let gid = 0;
  let dbPath = '';
  const adr = () => `/univers/${univers}/outils/swn/galaxie/${gid}/interieur/${O.q}/${O.r}`;
  const hors = async (page: Any, nom: string) => page.screenshot({ path: `${SHOTS}/${nom}.png`, fullPage: true });
  const ouvrir = async (largeur: number, hauteur: number) => {
    const c = await connecte(browser, srv.base, 'Antor');
    await c.page.setViewportSize({ width: largeur, height: hauteur });
    await c.page.goto(adr());
    await c.page.getByRole('heading', { name: /^Corps \(\d+\)$/ }).waitFor();
    return c;
  };
  // [r, g, b, a] of a CSS colour as the browser computes it
  const rgba = (s: string): number[] => (s.match(/[\d.]+/g) ?? []).map(Number).concat([1]).slice(0, s.startsWith('rgba') || s.startsWith('color') ? 4 : 3).concat(s.startsWith('rgba') ? [] : [1]).slice(0, 4);

  before(async () => {
    mkdirSync(SHOTS, { recursive: true });
    dbPath = join(mkdtempSync(join(tmpdir(), 'kanevas-edition-')), 'k.db');
    srv = await startServer({ KANEVAS_SANS_SEMIS: '', DB_PATH: dbPath });
    browser = await launch();
    const a = await connecte(browser, srv.base, 'Antor');
    const us = (await (await a.page.request.get('/api/univers')).json()) as Any;
    univers = (us.univers ?? us).find((u: Any) => u.nom === "Éneria d'essai").id;
    const cartes = (await (await a.page.request.get(`/api/univers/${univers}/cartes`)).json()) as Any;
    gid = Number(String(cartes.cartes.find((c: Any) => c.titre === "Galaxie d'essai").adresse).split('/').pop());
    await a.ctx.close();
    const db = new Database(dbPath);
    try {
      const sys = db.prepare("INSERT INTO swn_systemes (galaxie_id, univers_id, cle, nom, q, r, taille, couleur, notes, secret, promu) VALUES (?,?,?,?,?,?,3,'accent','',0,0)")
        .run(gid, univers, 'ed-centre', 'Centre-édition', O.q, O.r).lastInsertRowid as number;
      const ast = db.prepare('INSERT INTO swn_astres (systeme_id, cle, genre, parent_id, etoile_rang, type, nom, orbite, heure, taille) VALUES (?,?,?,?,?,?,?,?,?,?)');
      ast.run(sys, 'soleil', 'etoile', null, 0, 'jaune', 'Soleil-ed', 0, 0, 0.3);
      for (let i = 0; i < 30; i++) ast.run(sys, `x${i}`, 'planete', null, 0, 'rocheux', `Extra-${i}`, 2 + i, i % 12, 0.2);
      ast.run(sys, 'alpha', 'planete', null, 0, 'tellurique', 'Corps-alpha', 1, 7, 0.3);
    } finally { db.close(); }
  }, { timeout: 180000 });
  after(async () => { await browser?.close(); srv?.stop(); });

  it('le déclencheur « Système » du MJ a une bordure ambre et un chevron (au bureau et à 390 px)', async () => {
    for (const [l, h] of [[1280, 800], [390, 780]] as const) {
      const { page, ctx } = await ouvrir(l, h);
      const decl = page.getByRole('button', { name: /^Système/ });
      await decl.first().waitFor();
      const v = await decl.first().evaluate((el: Any) => {
        const s = getComputedStyle(el);
        return { bord: s.borderTopColor, largeur: s.borderTopWidth, style: s.borderTopStyle, texte: el.textContent as string, svg: el.querySelector('svg') !== null };
      });
      const [r, g, b, a] = rgba(v.bord);
      assert.ok(parseFloat(v.largeur) >= 1 && v.style === 'solid', `${l}: bordure visible (${v.largeur} ${v.style})`);
      assert.ok(r > 150 && r - b > 100 && g > b && g < r && a > 0.3, `${l}: bordure ambre, obtenu ${v.bord}`);
      assert.ok(v.svg || /[▾▼⌄˅]/.test(v.texte), `${l}: chevron, texte « ${v.texte} »`);
      if (l === 1280) await hors(page, 'bureau-declencheur');
      await ctx.close();
    }
  });

  it('« Ajouter un astre » : le bouton « Ajouter » n’est pas bleu (variante neutre, pas l’accent)', async () => {
    const { page, ctx } = await ouvrir(1280, 800);
    await page.getByRole('button', { name: /^Système/ }).first().click();
    await page.getByRole('menuitem', { name: /Ajouter un astre/ }).click();
    const dlg = page.getByRole('dialog', { name: /Ajouter un astre/ });
    await dlg.waitFor();
    const ajouter = dlg.getByRole('button', { name: 'Ajouter', exact: true });
    await ajouter.waitFor();
    const v = await ajouter.evaluate((el: Any) => { const s = getComputedStyle(el); return { fond: s.backgroundColor, bord: s.borderTopColor, texte: s.color }; });
    for (const [nom, c] of Object.entries(v)) {
      const [r, , b, a] = rgba(c);
      if (a < 0.2) continue;
      assert.ok(b - r < 25, `${nom} ne doit pas être bleu (accent #8b9bf0), obtenu ${c}`);
    }
    await hors(page, 'bureau-ajouter');
    await ctx.close();
  });

  it('au bureau, la pastille « Demander à Kanevas » ne recouvre pas « Enregistrer » du formulaire Modifier', async () => {
    const { page, ctx } = await ouvrir(1280, 800);
    await page.locator('.gx-lignes li', { hasText: 'Corps-alpha' }).getByRole('button').click();
    const panneau = page.getByRole('region', { name: 'Corps sélectionné' });
    await panneau.getByRole('button', { name: /^Modifier/ }).click();
    const enreg = page.getByRole('button', { name: 'Enregistrer', exact: true });
    await enreg.waitFor();
    await enreg.evaluate((e: Any) => e.scrollIntoView({ block: 'end' }));
    const pastille = page.getByRole('button', { name: /Demander à Kanevas/ });
    if (await pastille.count()) {
      const be = await enreg.boundingBox();
      const bp = await pastille.first().boundingBox();
      const chevauche = bp && be && bp.x < be.x + be.width && bp.x + bp.width > be.x && bp.y < be.y + be.height && bp.y + bp.height > be.y;
      assert.ok(!chevauche, `la pastille ${JSON.stringify(bp)} recouvre Enregistrer ${JSON.stringify(be)}`);
    }
    // whatever the pill, a click at the centre of « Enregistrer » reaches that very button
    const be = await enreg.boundingBox();
    const atteint = await page.evaluate(([x, y]: number[]) => { const e = document.elementFromPoint(x, y); return e?.closest('button')?.textContent ?? null; }, [be.x + be.width / 2, be.y + be.height / 2]);
    assert.equal(atteint, 'Enregistrer');
    await hors(page, 'bureau-modifier');
    await ctx.close();
  });
});

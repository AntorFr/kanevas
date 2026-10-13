// Independent black-box tests of the re-check of `kanevas-recours-admin` (E-5), written from the need only
// (docs/ecrans.md E-5, docs/charte.md, docs/maquettes/e05-administration.html). Real server in stub mode,
// real Chromium. Expected colours are the charte's literals, not read back from the product.
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { type Any, attendre, connecte, launch, rx, skipBrowser, startServer } from './harnais.test.ts';

const aFermer: Array<() => Promise<void> | void> = [];
after(async () => {
  for (const f of aFermer.reverse()) await f();
});

async function monde() {
  const s = await startServer();
  const browser = await launch();
  aFermer.push(async () => {
    await browser.close();
    s.stop();
  });
  const antor = await connecte(browser, s.base, 'Antor');
  await connecte(browser, s.base, 'Léa');
  await connecte(browser, s.base, 'Mira');
  const admin = await connecte(browser, s.base, 'Admin');
  const ids: Record<string, number> = {};
  for (const nom of ['Brume', "Lame d'Ébène", 'Solo']) {
    const r = await antor.ctx.request.post('/api/univers', { data: { nom, description: 'd' } });
    assert.equal(r.status(), 201);
    ids[nom] = (await r.json()).id;
  }
  for (const u of [ids['Brume'], ids["Lame d'Ébène"]]) {
    for (const [username, role] of [['lea', 'joueur'], ['mira', 'joueur']]) {
      const a = await antor.ctx.request.post(`/api/univers/${u}/membres`, { data: { username, role } });
      assert.equal(a.status(), 201);
    }
  }
  return { s, browser, admin, ids };
}

async function ouvrir(page: Any, univers: string, largeur: number): Promise<void> {
  await page.setViewportSize({ width: largeur, height: 900 });
  await page.goto('/administration');
  await page.getByRole('heading', { name: 'Administration', level: 1 }).waitFor();
  await attendre(page);
  await page.getByRole('link', { name: rx(univers) }).first().click();
  await page.getByRole('heading', { name: `Membres — ${univers}` }).waitFor();
  await attendre(page);
}

describe('E-5 revérification : badge « Sélectionné » et en-tête « Rôle » (navigateur)', { skip: skipBrowser }, () => {
  // Panne visée : le badge repasse en vert « lu par la table » (--table) au lieu de l'accent de la charte.
  it('badge_selectionne_est_en_accent_clair_et_sombre_pas_en_vert_table', async () => {
    const m = await monde();
    const attendus: Array<['dark' | 'light', string, string]> = [
      ['dark', 'rgb(154, 166, 245)', 'rgb(63, 199, 154)'],
      ['light', 'rgb(58, 76, 192)', 'rgb(8, 105, 74)'],
    ];
    for (const [schema, accent, vert] of attendus) {
      await m.admin.page.emulateMedia({ colorScheme: schema });
      await ouvrir(m.admin.page, 'Brume', 1280);
      const badge = m.admin.page.getByText('Sélectionné', { exact: true });
      assert.equal(await badge.count(), 1, 'un seul univers porte le badge');
      const couleur = await badge.evaluate((n: Element) => getComputedStyle(n).color);
      assert.notEqual(couleur, vert, `${schema}: le badge n'est pas en vert --table`);
      assert.equal(couleur, accent, `${schema}: texte du badge`);
    }
  });

  // Panne visée : le badge reste sur l'ancien univers ou se duplique après un autre choix.
  it('badge_suit_l_univers_choisi', async () => {
    const m = await monde();
    await ouvrir(m.admin.page, 'Brume', 1280);
    await m.admin.page.getByRole('link', { name: rx("Lame d'Ébène") }).first().click();
    await m.admin.page.getByRole('heading', { name: "Membres — Lame d'Ébène" }).waitFor();
    await attendre(m.admin.page);
    const badge = m.admin.page.getByText('Sélectionné', { exact: true });
    assert.equal(await badge.count(), 1);
    const ligne = m.admin.page.getByRole('link', { name: rx("Lame d'Ébène") }).first().locator('xpath=ancestor::*[contains(., "Sélectionné")][1]');
    assert.match(await ligne.innerText(), /Lame d.Ébène/);
    assert.ok(!/Brume/.test(await ligne.innerText()), 'le badge est dans la ligne de Lame d\'Ébène seule');
  });

  // Panne visée : l'en-tête « Rôle » est décalé de la colonne des pastilles (13-17 px à 390 px), posé sous
  // une ligne, ou « Identifiant » ne coiffe plus les identifiants. Une liste de 3 membres puis d'un seul.
  for (const largeur of [1280, 390]) {
    for (const [univers, nb] of [['Brume', 3], ['Solo', 1]] as const) {
      it(`entete_role_coiffe_les_pastilles_${univers}_${largeur}px`, async () => {
        const m = await monde();
        await ouvrir(m.admin.page, univers, largeur);
        const mesures = await m.admin.page.evaluate(`(() => {
          const g = (e) => (e ? e.getBoundingClientRect() : null);
          const texteG = (e) => { const r = document.createRange(); r.selectNodeContents(e); return r.getBoundingClientRect(); };
          const feuilles = (t) => Array.from(document.querySelectorAll('*')).filter(
            (e) => e.children.length === 0 && (e.textContent || '').trim() === t && e.tagName !== 'LABEL');
          const pastilles = Array.from(document.querySelectorAll('select[aria-label^="Rôle de "]'));
          const premier = Array.from(document.querySelectorAll('*')).filter(
            (e) => e.children.length === 0 && (e.textContent || '').trim() === 'antor')[0];
          return {
            nbRole: feuilles('Rôle').length,
            nbIdentifiant: feuilles('Identifiant').length,
            role: texteG(feuilles('Rôle')[0]),
            identifiant: texteG(feuilles('Identifiant')[0]),
            antor: texteG(premier),
            pastilles: pastilles.map((p) => g(p)),
            scroll: document.documentElement.scrollWidth,
            fenetre: window.innerWidth,
          };
        })()`);
        await m.admin.page.screenshot({ path: `/tmp/sonde/entete-${univers}-${largeur}.png` });
        assert.equal(mesures.nbRole, 1, 'un seul en-tête « Rôle »');
        assert.equal(mesures.nbIdentifiant, 1, 'un seul en-tête « Identifiant »');
        assert.equal(mesures.pastilles.length, nb, 'une pastille de rôle par membre');
        for (const p of mesures.pastilles) {
          assert.ok(Math.abs(p.left - mesures.role.left) <= 2, `${largeur}px: « Rôle » à ${mesures.role.left}, pastille à ${p.left}`);
        }
        assert.ok(Math.abs(mesures.antor.left - mesures.identifiant.left) <= 2, `${largeur}px: « Identifiant » à ${mesures.identifiant.left}, antor à ${mesures.antor.left}`);
        // l'en-tête est au-dessus de la première ligne, tout près, et d'une hauteur de ligne de texte
        assert.ok(mesures.role.bottom <= mesures.pastilles[0].top, 'l\'en-tête est au-dessus de la première ligne');
        assert.ok(mesures.pastilles[0].top - mesures.role.bottom <= 24, `en-tête à ${mesures.pastilles[0].top - mesures.role.bottom}px de la première ligne`);
        assert.ok(mesures.role.height <= 24, `en-tête haut de ${mesures.role.height}px`);
        assert.equal(Math.round(mesures.role.top), Math.round(mesures.identifiant.top), 'les deux en-têtes sont sur la même ligne');
        assert.equal(mesures.scroll, mesures.fenetre, 'pas de débordement horizontal');
      });
    }
  }
});

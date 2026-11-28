// ecrans: fiche, recherche, systeme, parametres, historique
// Tests d'écran de kanevas-systemes-jeu-surcharge, écrits depuis le critère de la fiche et docs/ecrans.md (E-9, E-14, E-15, E-17,
// E-24) : ce que l'utilisateur voit. Les effets (copie, droits, détachement, codes) ont leur porte dans
// src/routes/systemes-surcharge-ensemble-besoin.test.ts. Mise en place par les routes ; chaque geste attend la réponse de sa porte.
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { type Any, attendre, connecte, launch, startServer } from './harnais.test.ts';

const aFermer: Array<() => Promise<void> | void> = [];
after(async () => {
  for (const f of aFermer.reverse()) await f();
});

// Antor est MJ de « Lame » (Léa y est joueuse) et de « Brume », tous deux rattachés au système « Zeta » dont Mira est MJ.
async function monde() {
  const s = await startServer();
  const browser = await launch();
  aFermer.push(async () => {
    await browser.close();
    s.stop();
  });
  const antor = await connecte(browser, s.base, 'Antor');
  const lea = await connecte(browser, s.base, 'Léa');
  const mira = await connecte(browser, s.base, 'Mira');
  const admin = await connecte(browser, s.base, 'Admin');
  for (const c of [antor, lea, mira, admin]) c.page.setDefaultTimeout(60000);
  const mk = async (nom: string) => {
    const r = await antor.ctx.request.post('/api/univers', { data: { nom, description: 'd' } });
    assert.equal(r.status(), 201);
    return (await r.json()).id as number;
  };
  const lame = await mk('Lame');
  assert.equal((await antor.ctx.request.post(`/api/univers/${lame}/membres`, { data: { username: 'lea' } })).status(), 201);
  const sys = await antor.ctx.request.post(`/api/univers/${lame}/systeme-nouveau`, { data: { nom: 'Zeta' } });
  assert.equal(sys.status(), 201);
  const sid = (await sys.json()).id as number;
  const brume = await mk('Brume');
  assert.equal((await antor.ctx.request.put(`/api/univers/${brume}/systeme`, { data: { systemeId: sid } })).status(), 204);
  assert.equal((await admin.ctx.request.post(`/api/instance/systemes/${sid}/membres`, { data: { username: 'mira' } })).status(), 201);
  const cree = await mira.ctx.request.post(`/api/systemes/${sid}/fiches`, {
    data: { type: 'objet', titre: 'Pistolet laser', sections: [{ titre: 'Description', joueursLisent: true }] },
  });
  assert.equal(cree.status(), 201);
  const elId = (await cree.json()).id as number;
  const v = await (await mira.ctx.request.get(`/api/systemes/${sid}/fiches/${elId}`)).json();
  const r = await mira.ctx.request.put(`/api/systemes/${sid}/fiches/${elId}/sections/${v.sections[0].id}/contenu`, { data: { contenu: 'Dégâts 1d8', version: v.sections[0].version } });
  assert.equal(r.status(), 200);
  return { antor, lea, mira, lame, brume, sid, elId };
}

describe('kanevas-systemes-jeu-surcharge : écrans E-9, E-14, E-15, E-17, E-24', () => {
  it('E-9 + E-17 : Antor personnalise le pistolet, modifie les dégâts, voit « Personnalisé » après enregistrement et ailleurs l’original ; en revenant, la marque disparaît', { timeout: 300000 }, async () => {
    const w = await monde();
    const p: Any = w.antor.page;
    await p.goto(`/univers/${w.lame}/recherche`);
    await attendre(p);
    await p.getByRole('searchbox').or(p.getByRole('textbox')).first().fill('pistolet');
    await p.getByRole('link', { name: /Pistolet laser/ }).first().click();
    await p.getByRole('heading', { level: 1, name: 'Pistolet laser' }).waitFor();
    await p.getByText('Élément de Zeta', { exact: false }).first().waitFor();
    assert.equal(await p.getByText('Personnalisé', { exact: true }).count(), 0, 'pas de marque avant la copie');

    const creation = p.waitForResponse((r: Any) => r.request().method() === 'POST' && r.url().endsWith('/personnaliser'));
    await p.getByRole('button', { name: 'Personnaliser pour cet univers' }).click();
    assert.equal((await creation).status(), 201);
    await p.getByText('Personnalisé', { exact: true }).waitFor();
    assert.equal(await p.getByText('Élément de Zeta', { exact: false }).count(), 0, 'le rappel « Élément de … » a disparu sur la copie');
    assert.equal(await p.getByRole('button', { name: 'Personnaliser pour cet univers' }).count(), 0);

    await p.getByRole('button', { name: 'Modifier', exact: true }).first().click();
    await p.locator('main textarea').first().fill('Dégâts 2d6');
    const ecriture = p.waitForResponse((r: Any) => r.request().method() === 'PUT' && r.url().includes('/sections/'));
    await p.getByRole('button', { name: 'Enregistrer' }).click();
    assert.equal((await ecriture).status(), 200);
    await p.getByText('Dégâts 2d6').waitFor();
    await p.getByText('Personnalisé', { exact: true }).waitFor();
    await p.screenshot({ path: '/tmp/kanevas-ensemble-surcharge-copie.png' });

    // l'entrée de la recherche est la copie, une fois, marquée ; l'univers voisin montre l'original sans marque
    await p.goto(`/univers/${w.lame}/recherche`);
    await attendre(p);
    await p.getByRole('searchbox').or(p.getByRole('textbox')).first().fill('pistolet');
    await p.getByRole('link', { name: /Pistolet laser/ }).first().waitFor();
    assert.equal(await p.getByRole('link', { name: /Pistolet laser/ }).count(), 1, 'une seule entrée');
    await p.getByText('Personnalisé', { exact: true }).first().waitFor();
    await p.goto(`/univers/${w.brume}/recherche`);
    await attendre(p);
    await p.getByRole('searchbox').or(p.getByRole('textbox')).first().fill('pistolet');
    await p.getByRole('link', { name: /Pistolet laser/ }).first().click();
    await p.getByText('Dégâts 1d8').waitFor();
    assert.equal(await p.getByText('Personnalisé', { exact: true }).count(), 0, 'Brume lit l’original');

    // Léa lit la copie de Lame, marquée, sans bouton de personnalisation ni de retour
    const pl: Any = w.lea.page;
    await pl.goto(`/univers/${w.lame}/recherche`);
    await attendre(pl);
    await pl.getByRole('searchbox').or(pl.getByRole('textbox')).first().fill('pistolet');
    await pl.getByRole('link', { name: /Pistolet laser/ }).first().click();
    await pl.getByText('Dégâts 2d6').waitFor();
    await pl.getByText('Personnalisé', { exact: true }).waitFor();
    assert.equal(await pl.getByRole('button', { name: /Personnaliser|Revenir/ }).count(), 0);

    // retour à l'élément : confirmation, puis plus de marque, l'original lu sous son rappel
    await p.goto(`/univers/${w.lame}/recherche`);
    await attendre(p);
    await p.getByRole('searchbox').or(p.getByRole('textbox')).first().fill('pistolet');
    await p.getByRole('link', { name: /Pistolet laser/ }).first().click();
    await p.getByText('Dégâts 2d6').waitFor();
    await p.getByRole('button', { name: /^Autres actions sur « (?!Description)/ }).click();
    await p.getByRole('menuitem', { name: 'Revenir à l’élément du système' }).click();
    const fenetre = p.getByRole('alertdialog');
    await fenetre.getByText('Revenir à l’élément du système ?').waitFor();
    const retour = p.waitForResponse((r: Any) => r.request().method() === 'DELETE' && r.url().endsWith('/personnalisation'));
    await fenetre.getByRole('button', { name: 'Revenir à l’élément' }).click();
    assert.ok([200, 204].includes((await retour).status()));
    await p.getByText('Élément de Zeta', { exact: false }).first().waitFor();
    await p.getByText('Dégâts 1d8').waitFor();
    assert.equal(await p.getByText('Personnalisé', { exact: true }).count(), 0, 'la marque est perdue');
    await p.screenshot({ path: '/tmp/kanevas-ensemble-surcharge-retour.png' });
  });

  it('E-15 + E-9 + E-24 : Mira supprime l’élément, la fenêtre compte les copies sans nommer Lame ; la copie reste, sans marque, avec « devenue fiche ordinaire » dans son historique', { timeout: 300000 }, async () => {
    const w = await monde();
    const c = await w.antor.ctx.request.post(`/api/univers/${w.lame}/fiches/${w.elId}/personnaliser`);
    assert.equal(c.status(), 201);
    const copieId = (await c.json()).id as number;
    const pm: Any = w.mira.page;
    await pm.goto(`/systemes/${w.sid}/fiches/${w.elId}`);
    await pm.getByRole('heading', { level: 1, name: 'Pistolet laser' }).waitFor();
    await pm.getByRole('button', { name: 'Supprimer l’élément' }).click();
    const fenetre = pm.getByRole('alertdialog');
    await fenetre.getByText('1 univers l’a personnalisé.').waitFor();
    assert.equal(await fenetre.getByText(/Lame/).count(), 0, 'Mira n’a aucun rôle dans Lame : elle n’est pas nommée');
    const sup = pm.waitForResponse((r: Any) => r.request().method() === 'DELETE' && r.url().endsWith(`/api/systemes/${w.sid}/fiches/${w.elId}`));
    await fenetre.getByRole('button', { name: 'Supprimer l’élément' }).click();
    assert.equal((await sup).status(), 204);

    const pa: Any = w.antor.page;
    await pa.goto(`/univers/${w.lame}/fiche/${copieId}`);
    await pa.getByRole('heading', { level: 1, name: 'Pistolet laser' }).waitFor();
    await pa.getByText('Dégâts 1d8').waitFor();
    assert.equal(await pa.getByText('Personnalisé', { exact: true }).count(), 0, 'plus de marque');
    assert.equal(await pa.getByText('Élément de Zeta', { exact: false }).count(), 0, 'plus de rappel d’élément');
    await pa.goto(`/univers/${w.lame}/historique?fiche=${copieId}`);
    await pa.getByRole('list', { name: 'Modifications de l’univers' }).waitFor();
    await pa.getByText(/devenue fiche ordinaire/i).first().waitFor();
    await pa.screenshot({ path: '/tmp/kanevas-ensemble-surcharge-historique.png' });
  });

  it('E-14 : détacher Lame de Zeta annonce « 1 fiche personnalisée reste », « Annuler » ne détache rien, « Détacher » laisse la fiche ordinaire ; Brume, sans copie, se détache sans fenêtre', { timeout: 300000 }, async () => {
    const w = await monde();
    assert.equal((await w.antor.ctx.request.post(`/api/univers/${w.lame}/fiches/${w.elId}/personnaliser`)).status(), 201);
    const p: Any = w.antor.page;
    // Brume : aucune copie, le geste est celui d'avant, sans fenêtre
    await p.goto(`/univers/${w.brume}/parametres`);
    await attendre(p);
    await p.getByLabel('Système du catalogue').selectOption({ label: 'Aucun système' });
    const geste = p.waitForResponse((r: Any) => r.request().method() === 'PUT' && /\/api\/univers\/[^/]+\/systeme$/.test(r.url()));
    await p.getByRole('button', { name: 'Rattacher', exact: true }).click();
    assert.equal((await geste).status(), 204);
    assert.equal(await p.getByRole('alertdialog').count(), 0, 'aucune fenêtre sans copie');

    await p.goto(`/univers/${w.lame}/parametres`);
    await p.getByLabel('Système du catalogue').selectOption({ label: 'Aucun système' });
    await p.getByRole('button', { name: 'Rattacher', exact: true }).click();
    const fenetre = p.getByRole('alertdialog');
    await fenetre.getByText('Détacher cet univers de « Zeta » ?').waitFor();
    await fenetre.getByText('1 fiche personnalisée reste dans l’univers, comme fiche ordinaire.').waitFor();
    await p.screenshot({ path: '/tmp/kanevas-ensemble-surcharge-detacher.png' });
    await fenetre.getByRole('button', { name: 'Annuler' }).click();
    assert.equal(await p.getByRole('alertdialog').count(), 0);
    assert.equal((await (await w.antor.ctx.request.get(`/api/univers/${w.lame}`)).json()).systeme.nom, 'Zeta', 'Annuler ne détache rien');
    await p.getByRole('button', { name: 'Rattacher', exact: true }).click();
    const envoi = p.waitForResponse((r: Any) => r.request().method() === 'PUT' && /\/api\/univers\/[^/]+\/systeme$/.test(r.url()));
    await p.getByRole('alertdialog').getByRole('button', { name: 'Détacher' }).click();
    assert.equal((await envoi).status(), 204);
    await p.goto(`/univers/${w.lame}/recherche`);
    await attendre(p);
    await p.getByRole('searchbox').or(p.getByRole('textbox')).first().fill('pistolet');
    await p.getByRole('link', { name: /Pistolet laser/ }).first().waitFor();
    assert.equal(await p.getByText('Personnalisé', { exact: true }).count(), 0, 'la fiche est ordinaire');
  });
});

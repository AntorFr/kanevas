// ecrans: fiche, parametres, systeme
// Écrans de la surcharge (kanevas-systemes-jeu-surcharge-ecrans), écrits depuis le critère de la fiche : le MJ d'un univers voit
// « Personnaliser pour cet univers » sur un élément du système, obtient la marque « Personnalisé » et la perd en revenant à
// l'élément ; une joueuse ne voit aucun bouton ; les fenêtres d'E-15 et d'E-14 annoncent le nombre de copies et les seuls noms
// d'univers du compte. Les effets (copie, droits, détachement) ont leur porte dans src/routes/surcharge-*.test.ts.
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { type Any, attendre, connecte, launch, skipBrowser, startServer } from './harnais.test.ts';

const aFermer: Array<() => Promise<void> | void> = [];
after(async () => {
  for (const f of aFermer.reverse()) await f();
});

describe('kanevas-systemes-jeu-surcharge-ecrans : personnaliser et revenir', { skip: skipBrowser }, () => {
  it('Antor personnalise, voit la marque, la perd en revenant ; Léa n’a aucun bouton ; E-15 et E-14 annoncent les copies et les seuls noms du compte', { timeout: 300000 }, async () => {
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

    // Setup by the doors: Lame (Antor GM, Léa player) and Aube (Mira GM) share the system Zeta, whose GM is Mira.
    const u = await antor.ctx.request.post('/api/univers', { data: { nom: 'Lame', description: 'd' } });
    assert.equal(u.status(), 201);
    const uid = (await u.json()).id;
    assert.ok((await antor.ctx.request.post(`/api/univers/${uid}/membres`, { data: { username: 'lea' } })).status() < 300);
    const sys = await antor.ctx.request.post(`/api/univers/${uid}/systeme-nouveau`, { data: { nom: 'Zeta' } });
    assert.equal(sys.status(), 201);
    const sid = (await sys.json()).id;
    assert.ok((await admin.ctx.request.post(`/api/instance/systemes/${sid}/membres`, { data: { username: 'mira' } })).status() < 300);
    const a = await mira.ctx.request.post('/api/univers', { data: { nom: 'Aube', description: 'd' } });
    assert.equal(a.status(), 201);
    const aube = (await a.json()).id;
    assert.equal((await mira.ctx.request.put(`/api/univers/${aube}/systeme`, { data: { systemeId: sid } })).status(), 204);
    const el = await mira.ctx.request.post(`/api/systemes/${sid}/fiches`, {
      data: { type: 'objet', titre: 'Épée runique', sections: [{ titre: 'Description', joueursLisent: true }] },
    });
    assert.equal(el.status(), 201);
    const elId = (await el.json()).id;

    // --- Léa : l'élément, sans aucun bouton de la tranche
    const pl: Any = lea.page;
    await pl.goto(`/univers/${uid}/fiche/${elId}`);
    await pl.getByRole('heading', { level: 1, name: 'Épée runique' }).waitFor();
    await pl.getByText('lecture seule').first().waitFor();
    assert.equal(await pl.getByRole('button', { name: /Personnaliser/ }).count(), 0, 'la joueuse n’a pas « Personnaliser »');
    assert.equal(await pl.getByText('Personnalisé', { exact: true }).count(), 0);

    // --- Antor : le bouton, la copie, la marque
    const pa: Any = antor.page;
    await pa.goto(`/univers/${uid}/fiche/${elId}`);
    await pa.getByRole('heading', { level: 1, name: 'Épée runique' }).waitFor();
    assert.equal(await pa.getByText('Personnalisé', { exact: true }).count(), 0, 'pas de marque avant la copie');
    const reponse = pa.waitForResponse((r: Any) => r.url().endsWith('/personnaliser') && r.request().method() === 'POST');
    await pa.getByRole('button', { name: 'Personnaliser pour cet univers' }).click();
    const copieId = String((await (await reponse).json()).id);
    await pa.getByText('Fiche personnalisée pour cet univers').waitFor();
    await pa.getByText('Personnalisé', { exact: true }).waitFor();
    assert.equal(await pa.getByRole('button', { name: 'Personnaliser pour cet univers' }).count(), 0, 'le bouton disparaît sur la copie');
    const lien = pa.getByRole('link', { name: 'Voir l’élément du système' });
    assert.match((await lien.getAttribute('href'))!, new RegExp(`^/systemes/${sid}/fiches/${elId}$`));
    assert.notEqual(copieId, String(elId), 'la copie a son propre id');
    await pa.screenshot({ path: '/tmp/kanevas-surcharge-copie.png' });

    // La copie s'édite : renommer
    await pa.getByRole('button', { name: 'Renommer « Épée runique »' }).click();
    await pa.getByLabel('Titre de la fiche').fill('Épée de Lame');
    await pa.getByLabel('Titre de la fiche').press('Enter');
    await pa.getByRole('heading', { level: 1, name: 'Épée de Lame' }).waitFor();
    await pa.getByText('Personnalisé', { exact: true }).waitFor();

    // La joueuse voit la marque, sans bouton, et le lien vers l'élément
    await pl.goto(`/univers/${uid}/fiche/${copieId}`);
    await pl.getByRole('heading', { level: 1 }).waitFor();
    await pl.getByRole('heading', { level: 1, name: 'Épée de Lame' }).waitFor();
    await pl.getByText('Personnalisé', { exact: true }).waitFor();
    await pl.getByRole('button', { name: /^Autres actions sur « (?!Description)/ }).count().then((n: number) => assert.equal(n, 0));
    assert.equal(await pl.getByRole('button', { name: /Revenir/ }).count(), 0);

    // La recherche porte la marque
    await pl.goto(`/univers/${uid}/recherche`);
    await attendre(pl);
    await pl.getByRole('searchbox').or(pl.getByRole('textbox')).first().fill('Épée');
    await pl.getByRole('link', { name: /Épée de Lame/ }).first().waitFor();
    assert.equal(await pl.getByRole('link', { name: /Épée runique/ }).count(), 0, 'l’original n’est plus listé');
    await pl.getByText('Personnalisé', { exact: true }).first().waitFor();

    // --- E-14 : détacher annonce 1 copie ; « Annuler » n'envoie rien
    await pa.goto(`/univers/${uid}/parametres`);
    await pa.getByLabel('Système du catalogue').selectOption({ label: 'Aucun système' });
    await pa.getByRole('button', { name: 'Rattacher', exact: true }).click();
    const dlg = pa.getByRole('alertdialog');
    await dlg.waitFor();
    await dlg.getByText('Détacher cet univers de « Zeta » ?').waitFor();
    await dlg.getByText('1 fiche personnalisée reste dans l’univers, comme fiche ordinaire.').waitFor();
    await pa.screenshot({ path: '/tmp/kanevas-surcharge-e14.png' });
    await dlg.getByRole('button', { name: 'Annuler' }).click();
    assert.equal(await pa.getByRole('alertdialog').count(), 0);
    const toujours = await antor.ctx.request.get(`/api/univers/${uid}`);
    assert.equal((await toujours.json()).systeme?.id, sid, 'annuler ne détache rien');

    // --- E-15 : Mira (MJ du système) voit 1 copie nommée « Aube »... et la copie de Lame (2 univers) sans nommer Lame
    const cm = await mira.ctx.request.post(`/api/univers/${aube}/fiches/${elId}/personnaliser`);
    assert.equal(cm.status(), 201);
    const pm: Any = mira.page;
    await pm.goto(`/systemes/${sid}/fiches/${elId}`);
    await pm.getByRole('button', { name: 'Supprimer l’élément' }).click();
    const dm = pm.getByRole('alertdialog');
    await dm.getByText('2 univers l’ont personnalisé.').waitFor();
    await dm.getByText('Votre univers « Aube » garde sa version, qui devient une fiche ordinaire.').waitFor();
    assert.equal(await dm.getByText(/Lame/).count(), 0, 'un univers où le compte n’a pas de rôle n’est jamais nommé');
    await pm.screenshot({ path: '/tmp/kanevas-surcharge-e15.png' });
    await dm.getByRole('button', { name: 'Annuler' }).click();

    // --- Antor : revenir à l'élément, avec confirmation
    await pa.goto(`/univers/${uid}/fiche/${copieId}`);
    await pa.getByRole('heading', { level: 1, name: 'Épée de Lame' }).waitFor();
    await pa.getByRole('button', { name: /^Autres actions sur « (?!Description)/ }).click();
    await pa.getByRole('menuitem', { name: 'Revenir à l’élément du système' }).click();
    const rv = pa.getByRole('alertdialog');
    await rv.getByText('Revenir à l’élément du système ?').waitFor();
    await rv.getByRole('button', { name: 'Annuler' }).click();
    assert.equal(await pa.getByRole('alertdialog').count(), 0);
    await pa.getByText('Personnalisé', { exact: true }).waitFor();
    await pa.getByRole('button', { name: /^Autres actions sur « (?!Description)/ }).click();
    await pa.getByRole('menuitem', { name: 'Revenir à l’élément du système' }).click();
    await pa.getByRole('alertdialog').getByRole('button', { name: 'Revenir à l’élément' }).click();
    await pa.getByText('Retour à l’élément du système').waitFor();
    await pa.getByRole('heading', { level: 1, name: 'Épée runique' }).waitFor();
    assert.equal(await pa.getByText('Personnalisé', { exact: true }).count(), 0, 'la marque est perdue');
    await pa.getByRole('button', { name: 'Personnaliser pour cet univers' }).waitFor();
    // la copie n'existe plus, l'élément et la copie d'Aube restent
    assert.equal((await antor.ctx.request.get(`/api/univers/${uid}/fiches/${copieId}`)).status(), 404);
    assert.equal((await mira.ctx.request.get(`/api/univers/${aube}/fiches/${(await cm.json()).id}`)).status(), 200);
  });

  it('un MJ en mode joueur n’a ni « Personnaliser » ni « Revenir »', { timeout: 180000 }, async () => {
    const s = await startServer();
    const browser = await launch();
    aFermer.push(async () => {
      await browser.close();
      s.stop();
    });
    const antor = await connecte(browser, s.base, 'Antor');
    const mira = await connecte(browser, s.base, 'Mira');
    const admin = await connecte(browser, s.base, 'Admin');
    for (const c of [antor, mira, admin]) c.page.setDefaultTimeout(60000);
    const uid = (await (await antor.ctx.request.post('/api/univers', { data: { nom: 'Brume', description: 'd' } })).json()).id;
    const sid = (await (await antor.ctx.request.post(`/api/univers/${uid}/systeme-nouveau`, { data: { nom: 'Eta' } })).json()).id;
    assert.ok((await admin.ctx.request.post(`/api/instance/systemes/${sid}/membres`, { data: { username: 'mira' } })).status() < 300);
    const elId = (await (await mira.ctx.request.post(`/api/systemes/${sid}/fiches`, { data: { type: 'objet', titre: 'Bouclier', sections: [{ titre: 'D', joueursLisent: true }] } })).json()).id;
    const copie = (await (await antor.ctx.request.post(`/api/univers/${uid}/fiches/${elId}/personnaliser`)).json()).id;
    const pa: Any = antor.page;
    await pa.goto(`/univers/${uid}/fiche/${elId}`);
    await pa.getByRole('heading', { level: 1, name: 'Bouclier' }).waitFor();
    await pa.getByRole('radio', { name: /Joueur/ }).click();
    await pa.getByText('Mode Joueur : vous voyez ce que voit un joueur.').waitFor();
    assert.equal(await pa.getByRole('button', { name: 'Personnaliser pour cet univers' }).count(), 0, 'pas de « Personnaliser » en mode joueur');
    await pa.getByRole('link', { name: /Bouclier/ }).first().click().catch(() => undefined);
    await pa.goto(`/univers/${uid}/fiche/${copie}?mode=joueur`);
    await pa.getByRole('heading', { level: 1, name: 'Bouclier' }).waitFor();
    await pa.getByRole('radio', { name: /Joueur/ }).click();
    await pa.getByText('Personnalisé', { exact: true }).waitFor();
    assert.equal(await pa.getByRole('button', { name: /^Autres actions sur « Bouclier/ }).count(), 0, 'pas de menu, donc pas de « Revenir »');
  });
});

// ecrans: systeme, fiche, recherche
// Écrans des éléments de système (kanevas-systemes-jeu-elements-ecrans), écrits depuis le critère de la fiche :
// un MJ du système crée, modifie et supprime un élément depuis E-9 de l'espace ; une joueuse le trouve dans la
// recherche de son univers et l'ouvre sous le bandeau, sans bouton de modification ; l'admin voit les onglets d'E-15,
// un MJ ne voit pas « MJ du système ». Les effets (droits, lignes) ont leur porte dans src/routes/systemes-elements.test.ts.
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { type Any, attendre, connecte, launch, skipBrowser, startServer } from './harnais.test.ts';

const aFermer: Array<() => Promise<void> | void> = [];
after(async () => {
  for (const f of aFermer.reverse()) await f();
});

describe('kanevas-systemes-jeu-elements-ecrans : éléments de système à l’écran', { skip: skipBrowser }, () => {
  it('Mira (MJ du système) crée, modifie, ouvre aux joueurs puis supprime ; Léa le lit sous le bandeau ; onglets d’E-15 par rôle', { timeout: 240000 }, async () => {
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

    // Setup by the doors: a universe, a system attached to it, Léa a player, Mira a GM of the system only.
    const u = await antor.ctx.request.post('/api/univers', { data: { nom: 'Brume', description: 'd' } });
    assert.equal(u.status(), 201);
    const uid = (await u.json()).id;
    const m = await antor.ctx.request.post(`/api/univers/${uid}/membres`, { data: { username: 'lea' } });
    assert.ok(m.status() < 300, String(m.status()));
    const sys = await antor.ctx.request.post(`/api/univers/${uid}/systeme-nouveau`, { data: { nom: 'Zeta' } });
    assert.equal(sys.status(), 201);
    const sid = (await sys.json()).id;
    const g = await admin.ctx.request.post(`/api/instance/systemes/${sid}/membres`, { data: { username: 'mira' } });
    assert.ok(g.status() < 300, String(g.status()));

    // --- Mira : l'onglet Éléments, « Nouvel élément », création
    const pm: Any = mira.page;
    await pm.goto(`/systemes/${sid}`);
    await attendre(pm);
    assert.equal(await pm.getByRole('tab', { name: 'MJ du système' }).count(), 0, 'un MJ ne voit pas « MJ du système »');
    await pm.getByRole('tab', { name: 'Éléments' }).click();
    await pm.getByText('Ce système n’a encore aucun élément.').waitFor();
    await pm.getByRole('button', { name: 'Nouvel élément' }).click();
    const boite = pm.locator('form.formulaire-ligne');
    await boite.getByLabel('Nom').fill('');
    await boite.getByRole('button', { name: 'Créer l’élément' }).click();
    await boite.getByText('Erreur : le nom est obligatoire.').waitFor();
    await boite.getByLabel('Type').selectOption({ label: 'Objet' });
    await boite.getByLabel('Nom').fill('Épée runique');
    await boite.getByRole('button', { name: 'Créer l’élément' }).click();
    await pm.getByRole('heading', { level: 1, name: 'Épée runique' }).waitFor();
    assert.match(pm.url(), new RegExp(`/systemes/${sid}/fiches/\\d+$`));
    const fid = pm.url().split('/').pop();
    assert.match(await pm.locator('.sous-sys').innerText(), /Objet/, 'la pastille du type nomme le type');
    await pm.getByText('Cet élément n’a pas encore de section.').waitFor();

    // section, texte, ouverture aux joueurs
    await pm.getByRole('button', { name: /Ajouter une section/ }).click();
    await pm.getByLabel('Titre de la section').fill('Description');
    await pm.getByRole('button', { name: 'Ajouter la section' }).click();
    await pm.getByRole('region', { name: 'Description' }).waitFor();
    await pm.getByRole('button', { name: 'Modifier « Description »' }).click();
    await pm.getByLabel('Contenu de « Description »').fill('Lame bleutée visible');
    await pm.getByRole('button', { name: 'Enregistrer' }).click();
    await pm.getByText('Lame bleutée visible').waitFor();
    await pm.getByRole('switch', { name: 'Lue par les joueurs' }).click();
    await pm.locator('[role="switch"][aria-checked="true"]').waitFor();

    // renommer
    await pm.getByRole('button', { name: 'Renommer' }).click();
    await pm.getByLabel('Titre de l’élément').fill('');
    await pm.getByRole('button', { name: 'Renommer' }).last().click();
    await pm.getByText('le titre est obligatoire.').waitFor();
    await pm.getByLabel('Titre de l’élément').fill('Épée d’aube');
    await pm.getByRole('button', { name: 'Renommer' }).last().click();
    await pm.getByRole('heading', { level: 1, name: 'Épée d’aube' }).waitFor();
    await pm.screenshot({ path: '/tmp/kanevas-elements-espace.png' });

    // la liste de l'onglet porte l'élément, groupé par type
    await pm.goto(`/systemes/${sid}?type=elements`);
    await pm.getByRole('link', { name: 'Épée d’aube' }).waitFor();

    // --- Léa : recherche de son univers, bandeau, lecture seule
    const pl: Any = lea.page;
    await pl.goto(`/univers/${uid}/recherche`);
    await attendre(pl);
    await pl.getByRole('searchbox').or(pl.getByRole('textbox')).first().fill('Épée');
    await pl.getByRole('link', { name: /Épée d’aube/ }).first().click();
    await pl.getByRole('heading', { level: 1, name: 'Épée d’aube' }).waitFor();
    const bandeau = pl.getByRole('status').filter({ hasText: 'Élément de Zeta — lecture seule' });
    await bandeau.waitFor();
    await pl.getByText('Lame bleutée visible').waitFor();
    for (const nom of [/Modifier/, /Supprimer/, /Renommer/, /Ajouter une section/, /Retirer/]) {
      assert.equal(await pl.getByRole('button', { name: nom }).count(), 0, `aucun bouton ${nom}`);
    }
    await pl.screenshot({ path: '/tmp/kanevas-elements-lea.png' });
    await bandeau.getByRole('link', { name: 'Zeta' }).click();
    await pl.getByRole('heading', { level: 1, name: 'Zeta' }).waitFor();

    // --- Léa n'ouvre pas l'écriture de l'espace : lecture seule, aucun bouton
    await pl.goto(`/systemes/${sid}/fiches/${fid}`);
    await pl.getByRole('heading', { level: 1, name: 'Épée d’aube' }).waitFor();
    assert.equal(await pl.getByRole('button', { name: /Supprimer l’élément|Renommer|Modifier/ }).count(), 0);

    // --- Antor (GM de l'univers, pas du système) : pas d'écriture dans l'espace
    await antor.page.goto(`/systemes/${sid}/fiches/${fid}`);
    await antor.page.getByRole('heading', { level: 1, name: 'Épée d’aube' }).waitFor();
    assert.equal(await antor.page.getByRole('button', { name: /Supprimer l’élément|Renommer/ }).count(), 0);

    // --- Admin : onglets d'E-15
    await admin.page.goto(`/systemes/${sid}`);
    await admin.page.getByRole('tab', { name: 'MJ du système' }).waitFor();

    // --- Mira supprime, avec confirmation
    await pm.goto(`/systemes/${sid}/fiches/${fid}`);
    await pm.getByRole('button', { name: 'Supprimer l’élément' }).click();
    await pm.getByRole('alertdialog').filter({ hasText: /Supprimer.{1,3}Épée d.aube/ }).waitFor();
    await pm.getByRole('alertdialog').getByRole('button', { name: 'Annuler' }).click();
    assert.equal(await pm.getByRole('alertdialog').count(), 0);
    await pm.getByRole('button', { name: 'Supprimer l’élément' }).click();
    await pm.getByRole('alertdialog').getByRole('button', { name: 'Supprimer l’élément' }).click();
    await pm.getByRole('heading', { level: 1, name: 'Zeta' }).waitFor();
    await pm.goto(`/systemes/${sid}?type=elements`);
    await pm.getByText('Ce système n’a encore aucun élément.').waitFor();
    // Léa ne le trouve plus
    await pl.goto(`/univers/${uid}/fiches/${fid}`);
    await pl.getByText(/introuvable/i).first().waitFor();
  });

  it('le type proposé par défaut dans « Nouvel élément » aboutit à un élément ouvert', { timeout: 120000 }, async () => {
    const s = await startServer();
    const browser = await launch();
    aFermer.push(async () => {
      await browser.close();
      s.stop();
    });
    const antor = await connecte(browser, s.base, 'Antor');
    const admin = await connecte(browser, s.base, 'Admin');
    const mira = await connecte(browser, s.base, 'Mira');
    const u = await antor.ctx.request.post('/api/univers', { data: { nom: 'Brume', description: 'd' } });
    const sys = await antor.ctx.request.post(`/api/univers/${(await u.json()).id}/systeme-nouveau`, { data: { nom: 'Zeta' } });
    const sid = (await sys.json()).id;
    const g = await admin.ctx.request.post(`/api/instance/systemes/${sid}/membres`, { data: { username: 'mira' } });
    assert.ok(g.status() < 300);
    const pm: Any = mira.page;
    pm.setDefaultTimeout(30000);
    await pm.goto(`/systemes/${sid}?type=elements`);
    await attendre(pm);
    await pm.getByRole('button', { name: 'Nouvel élément' }).click();
    const boite = pm.locator('form.formulaire-ligne');
    const typeParDefaut = await boite.getByLabel('Type').inputValue();
    await boite.getByLabel('Nom').fill('Premier');
    await boite.getByRole('button', { name: 'Créer l’élément' }).click();
    await pm.getByRole('heading', { level: 1, name: 'Premier' }).waitFor();
    assert.ok(typeParDefaut.length > 0);
  });
});

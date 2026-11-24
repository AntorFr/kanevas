// ecrans: systeme, fiche, recherche, administration, systemes
// Tests d'écran de kanevas-systemes-jeu-elements, écrits depuis le besoin (critère de la fiche, docs/ecrans.md, P-27) : ce que
// l'utilisateur voit. Les effets (droits, lignes, codes) ont leur porte dans src/routes/systemes-elements-ensemble-besoin.test.ts.
// Mise en place par les routes ; chaque geste attend ce que l'écran affiche après lui.
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { type Any, attendre, connecte, launch, startServer } from './harnais.test.ts';

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
  const lea = await connecte(browser, s.base, 'Léa');
  const mira = await connecte(browser, s.base, 'Mira');
  const admin = await connecte(browser, s.base, 'Admin');
  for (const c of [antor, lea, mira, admin]) c.page.setDefaultTimeout(60000);
  const u = await antor.ctx.request.post('/api/univers', { data: { nom: 'Brume', description: 'd' } });
  assert.equal(u.status(), 201);
  const uid = (await u.json()).id;
  assert.equal((await antor.ctx.request.post(`/api/univers/${uid}/membres`, { data: { username: 'lea' } })).status(), 201);
  const sys = await antor.ctx.request.post(`/api/univers/${uid}/systeme-nouveau`, { data: { nom: 'Zeta' } });
  assert.equal(sys.status(), 201);
  const sid = (await sys.json()).id;
  return { s, browser, antor, lea, mira, admin, uid, sid };
}

// Un texte de la doc d'écran attendu : on le cherche pendant 6 s, on note ceux qui manquent, l'assertion les rend tous d'un coup.
async function manquants(attendus: Array<[string, () => Any]>): Promise<string[]> {
  const manques: string[] = [];
  for (const [nom, loc] of attendus) {
    if (!(await loc().waitFor({ timeout: 6000 }).then(() => true, () => false))) manques.push(nom);
  }
  return manques;
}

describe('kanevas-systemes-jeu-elements : écrans E-5, E-9, E-15, E-16, E-17', () => {
  it('E-17 + E-9 : Léa trouve « Pistolet laser » dans la recherche de son univers et l’ouvre sous le bandeau, sans bouton de modification, sans la section réservée', { timeout: 240000 }, async () => {
    const w = await monde();
    assert.equal((await w.admin.ctx.request.post(`/api/instance/systemes/${w.sid}/membres`, { data: { username: 'mira' } })).status(), 201);
    const cree = await w.mira.ctx.request.post(`/api/systemes/${w.sid}/fiches`, {
      data: { type: 'objet', titre: 'Pistolet laser', sections: [{ titre: 'Description', joueursLisent: true }, { titre: 'Forge secrète', joueursLisent: false }] },
    });
    assert.equal(cree.status(), 201);
    const fid = (await cree.json()).id;
    const v = await (await w.mira.ctx.request.get(`/api/systemes/${w.sid}/fiches/${fid}`)).json();
    for (const [i, texte] of ['Dégâts 1d8 à quarante mètres', 'Cristal de Vorsk'].entries()) {
      const r = await w.mira.ctx.request.put(`/api/systemes/${w.sid}/fiches/${fid}/sections/${v.sections[i].id}/contenu`, { data: { contenu: texte, version: v.sections[i].version } });
      assert.equal(r.status(), 200);
    }

    const p: Any = w.lea.page;
    await p.goto(`/univers/${w.uid}/recherche`);
    await attendre(p);
    await p.getByRole('searchbox').or(p.getByRole('textbox')).first().fill('pistolet');
    await p.getByRole('link', { name: /Pistolet laser/ }).first().click();
    await p.getByRole('heading', { level: 1, name: 'Pistolet laser' }).waitFor();
    await p.getByText('Élément de Zeta', { exact: false }).first().waitFor();
    await p.getByText('lecture seule', { exact: false }).first().waitFor();
    await p.getByText('Dégâts 1d8 à quarante mètres').waitFor();
    assert.equal(await p.getByText('Cristal de Vorsk').count(), 0, 'la section réservée est absente');
    assert.equal(await p.getByText('Forge secrète').count(), 0, 'son titre aussi');
    for (const nom of [/Modifier/, /Supprimer/, /Renommer/, /Ajouter une section/, /Personnaliser/]) {
      assert.equal(await p.getByRole('button', { name: nom }).count(), 0, `aucun bouton ${nom}`);
    }
    await p.screenshot({ path: '/tmp/kanevas-ensemble-lea-bandeau.png' });

    // la recherche d'un mot de la section réservée ne ramène rien (rien d'autre que « aucun résultat »)
    await p.goto(`/univers/${w.uid}/recherche`);
    await attendre(p);
    await p.getByRole('searchbox').or(p.getByRole('textbox')).first().fill('Vorsk');
    await attendre(p);
    assert.equal(await p.getByRole('link', { name: /Pistolet laser/ }).count(), 0);
  });

  it('E-15 + E-9 : Mira, MJ du système, crée « Pistolet laser » depuis « Nouvel élément », écrit sa section, puis le supprime après confirmation', { timeout: 300000 }, async () => {
    const w = await monde();
    assert.equal((await w.admin.ctx.request.post(`/api/instance/systemes/${w.sid}/membres`, { data: { username: 'mira' } })).status(), 201);
    const p: Any = w.mira.page;
    await p.goto(`/systemes/${w.sid}`);
    await attendre(p);
    await p.getByRole('tab', { name: 'Éléments' }).click();
    await p.getByText(/aucun élément/i).waitFor();
    assert.equal(await p.getByRole('tab', { name: 'MJ du système' }).count(), 0, 'un MJ du système non admin ne voit pas « MJ du système »');
    await p.getByRole('button', { name: 'Nouvel élément' }).click();
    // nom vide : refusé, rien créé
    await p.getByRole('button', { name: /Créer l.élément/ }).click();
    await p.getByText(/obligatoire/).waitFor();
    await p.getByLabel(/^(Nom|Titre)$/).fill('Pistolet laser');
    const reponse = p.waitForResponse((r: Any) => r.request().method() === 'POST' && r.url().endsWith(`/api/systemes/${w.sid}/fiches`));
    await p.getByRole('button', { name: /Créer l.élément/ }).click();
    assert.equal((await reponse).status(), 201);
    await p.getByRole('heading', { level: 1, name: 'Pistolet laser' }).waitFor();
    assert.match(p.url(), new RegExp(`/systemes/${w.sid}/fiches/\\d+$`));
    const fid = p.url().split('/').pop();

    await p.getByRole('button', { name: /Ajouter une section/ }).click();
    await p.getByLabel('Titre de la section').fill('Description');
    await p.getByRole('button', { name: 'Ajouter la section' }).click();
    await p.getByRole('button', { name: 'Modifier « Description »' }).click();
    await p.getByLabel('Contenu de « Description »').fill('Dégâts 1d8');
    await p.getByRole('button', { name: 'Enregistrer' }).click();
    await p.getByText('Dégâts 1d8').waitFor();
    await p.screenshot({ path: '/tmp/kanevas-ensemble-mira-edition.png' });
    // après rechargement, le texte est celui du serveur
    await p.reload();
    await p.getByText('Dégâts 1d8').waitFor();

    // suppression : la fenêtre annonce, « Annuler » ne supprime rien, le bouton danger supprime
    await p.getByRole('button', { name: 'Supprimer l’élément' }).click();
    const fenetre = p.getByRole('alertdialog').or(p.getByRole('dialog'));
    await fenetre.getByText(/Pistolet laser/).waitFor();
    await fenetre.getByRole('button', { name: 'Annuler' }).click();
    await p.getByRole('heading', { level: 1, name: 'Pistolet laser' }).waitFor();
    assert.equal((await w.mira.ctx.request.get(`/api/systemes/${w.sid}/fiches/${fid}`)).status(), 200);
    await p.getByRole('button', { name: 'Supprimer l’élément' }).click();
    const sup = p.waitForResponse((r: Any) => r.request().method() === 'DELETE' && r.url().endsWith(`/api/systemes/${w.sid}/fiches/${fid}`));
    await fenetre.getByRole('button', { name: 'Supprimer l’élément' }).click();
    assert.equal((await sup).status(), 204);
    assert.equal((await w.mira.ctx.request.get(`/api/systemes/${w.sid}/fiches/${fid}`)).status(), 404);
    await p.goto(`/systemes/${w.sid}`);
    await p.getByRole('tab', { name: 'Éléments' }).click();
    await p.getByText(/aucun élément/i).waitFor();
  });

  it('E-5 + E-15 : l’admin ouvre un système sans MJ depuis « Administration », voit les onglets, ajoute un compte puis le retire ', { timeout: 300000 }, async () => {
    const w = await monde();
    const p: Any = w.admin.page;
    await p.goto('/administration');
    await attendre(p);
    await p.getByText('Zeta').first().waitFor();
    await p.getByText(/1 univers/).first().waitFor();
    await p.getByText(/0 MJ/).first().waitFor();
    await p.getByRole('link', { name: /Zeta/ }).first().click();
    await p.getByRole('tab', { name: 'MJ du système' }).waitFor();
    await p.getByText(/Aucun MJ/).waitFor();
    await p.screenshot({ path: '/tmp/kanevas-ensemble-admin-mj.png' });
    assert.equal(await p.getByRole('button', { name: 'Nouvel élément' }).count(), 0, 'l’admin sans lien ne crée pas d’élément');

    // identifiant inconnu : message sous le champ, rien d'ajouté
    await p.getByLabel(/identifiant/i).fill('personne-ici');
    const refus = p.waitForResponse((r: Any) => r.request().method() === 'POST' && r.url().endsWith(`/api/instance/systemes/${w.sid}/membres`));
    await p.getByRole('button', { name: 'Ajouter' }).click();
    assert.ok((await refus).status() >= 400);
    assert.equal(await p.getByRole('button', { name: /Retirer/ }).count(), 0, 'rien n’a été ajouté');
    await p.getByLabel(/identifiant/i).fill('mira');
    const ajout = p.waitForResponse((r: Any) => r.request().method() === 'POST' && r.url().endsWith(`/api/instance/systemes/${w.sid}/membres`));
    await p.getByRole('button', { name: 'Ajouter' }).click();
    assert.equal((await ajout).status(), 201);
    await p.getByRole('button', { name: /Retirer/ }).waitFor();

    // retrait du dernier MJ
    const retrait = p.waitForResponse((r: Any) => r.request().method() === 'DELETE' && r.url().includes(`/api/instance/systemes/${w.sid}/membres/`));
    await p.getByRole('button', { name: /Retirer/ }).click();
    const confirmer = p.getByRole('alertdialog').getByRole('button', { name: /Retirer/ });
    if (await confirmer.count()) await confirmer.click();
    assert.equal((await retrait).status(), 204);
    await p.getByText(/Aucun MJ/).waitFor();
  });

  it('textes d’état d’E-15 « Éléments » (docs/ecrans.md) : vide pour le MJ du système et pour le lecteur, formulaire « Nom », erreur « Erreur : le nom est obligatoire. »', { timeout: 240000 }, async () => {
    const w = await monde();
    const lecteur: Any = w.antor.page;
    await lecteur.goto(`/systemes/${w.sid}`);
    await attendre(lecteur);
    await lecteur.getByRole('tab', { name: 'Éléments' }).click();
    const manques = await manquants([['lecteur : « Ce système n’a encore aucun élément à voir. »', () => lecteur.getByText(/Ce système n.a encore aucun élément à voir\./)]]);
    assert.equal((await w.admin.ctx.request.post(`/api/instance/systemes/${w.sid}/membres`, { data: { username: 'mira' } })).status(), 201);
    const p: Any = w.mira.page;
    await p.goto(`/systemes/${w.sid}`);
    await attendre(p);
    await p.getByRole('tab', { name: 'Éléments' }).click();
    manques.push(...(await manquants([['MJ : « Ce système n’a encore aucun élément. »', () => p.getByText(/Ce système n.a encore aucun élément\./)]])));
    await p.getByRole('button', { name: 'Nouvel élément' }).click();
    manques.push(...(await manquants([['champ « Nom »', () => p.getByLabel('Nom')]])));
    await p.getByRole('button', { name: /Créer l.élément/ }).click();
    manques.push(...(await manquants([['« Erreur : le nom est obligatoire. »', () => p.getByText(/Erreur : le nom est obligatoire\./)]])));
    assert.deepEqual(manques, []);
  });

  it('textes d’état de l’onglet « MJ du système » (docs/ecrans.md) : vide, identifiant inconnu, compte déjà MJ', { timeout: 240000 }, async () => {
    const w = await monde();
    const p: Any = w.admin.page;
    await p.goto(`/systemes/${w.sid}`);
    await p.getByRole('tab', { name: 'MJ du système' }).click();
    const manques = await manquants([['vide : « Ce système n’a aucun MJ. Personne ne peut le modifier tant que vous n’en ajoutez pas. »', () => p.getByText(/Ce système n.a aucun MJ\. Personne ne peut le modifier tant que vous n.en ajoutez pas\./)]]);
    await p.getByLabel(/identifiant/i).fill('personne-ici');
    await p.getByRole('button', { name: 'Ajouter' }).click();
    manques.push(...(await manquants([['« Aucun compte ne porte cet identifiant. »', () => p.getByText(/Aucun compte ne porte cet identifiant\./)]])));
    await p.getByLabel(/identifiant/i).fill('antor');
    await p.getByRole('button', { name: 'Ajouter' }).click();
    await p.getByRole('button', { name: /Retirer/ }).waitFor();
    await p.getByLabel(/identifiant/i).fill('antor');
    await p.getByRole('button', { name: 'Ajouter' }).click();
    manques.push(...(await manquants([['« Ce compte est déjà MJ de ce système. »', () => p.getByText(/Ce compte est déjà MJ de ce système\./)]])));
    assert.deepEqual(manques, []);
  });

  it('E-9 : la fenêtre de suppression dit « Supprimer « <titre> » ? Cet élément disparaît du système pour tous les univers. » (docs/ecrans.md)', { timeout: 240000 }, async () => {
    const w = await monde();
    assert.equal((await w.admin.ctx.request.post(`/api/instance/systemes/${w.sid}/membres`, { data: { username: 'mira' } })).status(), 201);
    const f = await (await w.mira.ctx.request.post(`/api/systemes/${w.sid}/fiches`, { data: { type: 'objet', titre: 'Pistolet' } })).json();
    const p: Any = w.mira.page;
    await p.goto(`/systemes/${w.sid}/fiches/${f.id}`);
    await attendre(p);
    await p.getByRole('button', { name: 'Supprimer l’élément' }).click();
    const fenetre = p.getByRole('alertdialog').or(p.getByRole('dialog'));
    await fenetre.getByRole('button', { name: 'Annuler' }).waitFor();
    const manques = await manquants([
      ['« Supprimer « Pistolet » ? »', () => fenetre.getByText(/Supprimer .Pistolet. \?/)],
      ['« Cet élément disparaît du système pour tous les univers. »', () => fenetre.getByText(/Cet élément disparaît du système pour tous les univers\./)],
    ]);
    assert.deepEqual(manques, []);
  });

  it('E-16 : un MJ du système sans univers rattaché le voit listé avec le badge « MJ du système » et sans ligne « Dans vos univers » (docs/ecrans.md)', { timeout: 240000 }, async () => {
    const w = await monde();
    assert.equal((await w.admin.ctx.request.post(`/api/instance/systemes/${w.sid}/membres`, { data: { username: 'mira' } })).status(), 201);
    assert.equal((await w.antor.ctx.request.put(`/api/univers/${w.uid}/systeme`, { data: { systemeId: null } })).status(), 204);
    const m: Any = w.mira.page;
    await m.goto('/systemes');
    await attendre(m);
    await m.getByText('Zeta').first().waitFor();
    await m.screenshot({ path: '/tmp/kanevas-ensemble-mira-e16.png' });
    await m.getByText('MJ du système').first().waitFor();
    assert.equal(await m.getByText('Dans vos univers').count(), 0);
  });

  it('E-15 : Antor (MJ de l’univers rattaché, pas du système) lit sans « Nouvel élément » ; un compte sans lien lit « Page introuvable. »', { timeout: 240000 }, async () => {
    const w = await monde();
    const p: Any = w.antor.page;
    await p.goto(`/systemes/${w.sid}`);
    await attendre(p);
    await p.getByRole('heading', { level: 1, name: 'Zeta' }).waitFor();
    await p.getByRole('tab', { name: 'Éléments' }).click();
    await p.getByText(/aucun élément/i).waitFor();
    assert.equal(await p.getByRole('button', { name: 'Nouvel élément' }).count(), 0);
    assert.equal(await p.getByRole('tab', { name: 'MJ du système' }).count(), 0);
    const teo = await connecte(w.browser, w.s.base, 'Teo');
    await teo.page.goto(`/systemes/${w.sid}`);
    await teo.page.getByText('Page introuvable.').waitFor();
  });
});

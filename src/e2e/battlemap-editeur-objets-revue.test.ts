// ecrans: outil-cible
// Review of kanevas-battlemap-editeur-objets (E-28), written from the exit criterion.
//
// TEST PLAN
//   pose    : two library objects posed on the « Objets » layer by click, a trap on a « MJ seul » layer (what the server holds)
//   proprietes : scale 2 saved; out-of-bounds scale says why and changes nothing; « Dupliquer » adds a copy
//   fiche   : link « Terminal », « Ouvrir la fiche » leads to it, « Délier » → no fiche_id, even after a reload
//   retire  : an asset posed on 3 maps then withdrawn in E-25 → « Asset retiré » in the editor (GM)
//   calques : the 21st layer is refused with « 20 calques au plus. »
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { pngPlat } from '../bouchon/png-plat.js';
import { attendre, connecte, launch, skipBrowser, startServer, type Any, type Server } from './harnais.test.js';

const png = (nom: string) => ({ name: nom, mimeType: 'image/png', buffer: pngPlat([40, 140, 60], 16) });

describe('E-28 objets, calques, propriétés', { skip: skipBrowser }, () => {
  let srv: Server;
  let browser: Any;
  let antor: Any;
  let uid = 0;
  let api = '';
  const idsAssets: Record<string, number> = {};
  let terminal = 0;

  before(async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '', KANEVAS_SANS_SEMIS_BATTLEMAP: '1' });
    browser = await launch();
    antor = (await connecte(browser, srv.base, 'Antor')).page;
    const u = ((await (await antor.request.get('/api/univers')).json()) as Any[]).find((x) => x.nom === "Éneria d'essai");
    uid = u.id;
    const sid = u.systemeId ?? u.systeme_id ?? u.systeme?.id;
    for (const outil of ['assets', 'cartes']) {
      for (const [c, d] of [['activation', { active: true }], ['visibilite', { mj: true, joueur: true }]] as const) {
        const r = await antor.request.put(`/api/systemes/${sid}/outils/battlemap/${outil}/${c}`, { data: d });
        assert.ok(r.status() < 300, `${outil} ${c}: ${r.status()}`);
      }
    }
    api = `/api/univers/${uid}/outils/battlemap`;
    for (const nom of ['coffre', 'tonneau', 'piege', 'lampe', 'torche']) {
      const r = await antor.request.post(`${api}/assets`, { multipart: { categorie: 'objet', fichier: png(`${nom}.png`) } });
      assert.equal(r.status(), 201, `${nom}: ${await r.text()}`);
    }
    const liste = ((await (await antor.request.get(`${api}/assets`)).json()) as Any).assets as Any[];
    for (const a of liste) idsAssets[String(a.nom).replace(/\.png$/, '')] = a.id;
    const f = await antor.request.post(`/api/univers/${uid}/fiches`, { data: { type: 'objet', titre: 'Terminal' } });
    assert.ok(f.ok(), await f.text());
    terminal = ((await f.json()) as Any).id;
  });
  after(async () => {
    await browser?.close();
    srv?.stop();
  });

  const nouvelle = async (titre: string): Promise<number> => {
    const r = await antor.request.post(`${api}/cartes`, { data: { titre, largeur: 30, hauteur: 20 } });
    assert.equal(r.status(), 201);
    return ((await r.json()) as Any).id;
  };
  const lire = async (cid: number): Promise<Any> => (await antor.request.get(`${api}/cartes/${cid}`)).json();
  const ouvrir = async (cid: number) => {
    await antor.goto(`/univers/${uid}/outils/battlemap/cartes/${cid}`);
    await antor.getByLabel('Carte', { exact: true }).waitFor();
    await attendre(antor);
  };
  const clicCarte = async (x: number, y: number) => {
    const b = await antor.getByLabel('Carte', { exact: true }).boundingBox();
    await antor.mouse.click(b.x + x, b.y + y);
  };
  /** Waits for the screen's own « Enregistré » indicator, then checks what the server holds (no fixed sleep). */
  const enregistre = async (cid: number, ok: (doc: Any) => boolean) => {
    await antor.getByText('Enregistré', { exact: true }).waitFor({ state: 'hidden', timeout: 3000 }).catch(() => undefined);
    await antor.getByText('Enregistré', { exact: true }).waitFor();
    assert.ok(ok((await lire(cid)).document), 'la carte du serveur n’a pas l’état attendu');
  };
  const toutSelectionner = async () => {
    await antor.getByRole('radio', { name: 'Sélection', exact: true }).click();
    const b = await antor.getByLabel('Carte', { exact: true }).boundingBox();
    await antor.mouse.move(b.x + 3, b.y + 3);
    await antor.mouse.down();
    await antor.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 4 });
    await antor.mouse.move(b.x + b.width - 3, b.y + b.height - 3, { steps: 4 });
    await antor.mouse.up();
  };
  const armer = async (nom: string) => {
    await antor.getByRole('tab', { name: 'Bibliothèque' }).click();
    await antor.getByText(nom, { exact: false }).first().click();
  };
  const onglet = (nom: string) => antor.getByRole('tab', { name: nom }).click();

  it('pose, calque MJ seul, échelle 2, duplication, lien, délien, réouverture', async () => {
    const cid = await nouvelle('Salle');
    await ouvrir(cid);
    await armer('coffre');
    await clicCarte(200, 150);
    await armer('tonneau');
    await clicCarte(300, 150);
    await enregistre(cid, (d) => d.elements.length === 2);
    const d1 = (await lire(cid)).document;
    const objets = d1.calques.find((c: Any) => c.type === 'objet');
    assert.deepEqual(d1.elements.map((e: Any) => e.calque), [objets.id, objets.id]);
    assert.deepEqual(d1.elements.map((e: Any) => String(e.asset_id)).sort(), [String(idsAssets.coffre), String(idsAssets.tonneau)].sort());

    // MJ seul layer, the trap goes there
    await onglet('Calques');
    await antor.getByRole('button', { name: 'Nouveau calque' }).click();
    await antor.getByRole('menuitem', { name: 'Calque d’objets' }).click();
    await enregistre(cid, (d) => d.calques.length === 4);
    const nouveau = (await lire(cid)).document.calques.find((c: Any) => c.nom === 'Objets 2');
    assert.ok(nouveau, 'nom libre « Objets 2 »');
    await antor.getByRole('button', { name: 'Menu du calque Objets 2' }).click();
    await antor.getByRole('menuitem', { name: 'MJ seul : activer' }).click();
    await antor.locator('[data-calque="Objets 2"]').getByRole('button', { name: 'Objets 2', exact: true }).click();
    await armer('piege');
    await clicCarte(400, 250);
    await enregistre(cid, (d) => d.elements.length === 3);
    const d2 = (await lire(cid)).document;
    const piege = d2.elements.find((e: Any) => String(e.asset_id) === String(idsAssets.piege));
    assert.equal(piege.calque, nouveau.id);
    assert.equal(d2.calques.find((c: Any) => c.id === nouveau.id).mj_seul, true);

    // scale 2 on the chest, then a duplicate
    await antor.getByRole('radio', { name: 'Sélection', exact: true }).click();
    await clicCarte(200, 150);
    await onglet('Propriétés');
    const echelle = antor.getByLabel('Échelle');
    await echelle.fill('2');
    await echelle.press('Enter');
    await enregistre(cid, (d) => d.elements.some((e: Any) => e.echelle === 2));
    await echelle.fill('9');
    await echelle.press('Enter');
    await antor.getByRole('alert').getByText(/0[.,]25 à 4/).waitFor();
    assert.equal((await lire(cid)).document.elements.filter((e: Any) => e.echelle === 9).length, 0);
    await antor.getByRole('button', { name: 'Dupliquer' }).click();
    await enregistre(cid, (d) => d.elements.length === 4);
    const copies = (await lire(cid)).document.elements.filter((e: Any) => String(e.asset_id) === String(idsAssets.coffre));
    assert.equal(copies.length, 2);
    assert.equal(new Set(copies.map((e: Any) => e.id)).size, 2);

    // link Terminal on the (selected) copy, open, unlink
    await antor.getByRole('button', { name: 'Lier une fiche…' }).click();
    await antor.getByRole('dialog').getByLabel('Rechercher une fiche').fill('Terminal');
    await antor.getByRole('dialog').getByRole('button', { name: /Terminal/ }).click();
    await enregistre(cid, (d) => d.elements.some((e: Any) => e.fiche_id === String(terminal)));
    await antor.getByText('Terminal', { exact: true }).first().waitFor();
    const lie = (await lire(cid)).document.elements.find((e: Any) => e.fiche_id === String(terminal));
    assert.ok(!JSON.stringify(lie).includes('"titre"'), 'le titre n’est pas copié dans le document');
    await antor.getByRole('link', { name: 'Ouvrir la fiche' }).click();
    await antor.waitForURL(new RegExp(`/fiche/${terminal}`));
    // reopened: keep only the linked element (through the API), pick it with a rubber band, unlink
    await antor.goBack();
    const etat = await lire(cid);
    const autres = etat.document.elements.filter((e: Any) => e.fiche_id === undefined).map((e: Any) => ({ type: 'supprimer_element', id: e.id }));
    const r = await antor.request.post(`${api}/cartes/${cid}/commandes`, { data: { version: etat.version, commandes: autres } });
    assert.ok(r.ok(), await r.text());
    await ouvrir(cid);
    await toutSelectionner();
    await onglet('Propriétés');
    await antor.getByText('Terminal', { exact: true }).first().waitFor();
    await antor.getByRole('button', { name: 'Délier' }).click();
    await enregistre(cid, (d) => d.elements.every((e: Any) => e.fiche_id === undefined));
    await antor.reload();
    await antor.getByLabel('Carte', { exact: true }).waitFor();
    assert.equal((await lire(cid)).document.elements.filter((e: Any) => e.fiche_id !== undefined).length, 0);
  });

  it('asset retiré : un asset posé sur 3 cartes, retiré en E-25 → « Asset retiré » dans l’éditeur', async () => {
    const cartes: number[] = [];
    for (const t of ['A', 'B', 'C']) {
      const cid = await nouvelle(`Retrait ${t}`);
      cartes.push(cid);
      const doc = (await lire(cid)).document;
      const r = await antor.request.post(`${api}/cartes/${cid}/commandes`, {
        data: { version: (await lire(cid)).version, commandes: [{ type: 'poser_element', id: `l-${t}`, calque: doc.calques.find((c: Any) => c.type === 'objet').id, asset_id: String(idsAssets.lampe), x: 5.5, y: 5.5 }] },
      });
      assert.ok(r.ok(), await r.text());
    }
    const u = (await (await antor.request.get(`${api}/assets/${idsAssets.lampe}/utilisation`)).json()) as Any;
    assert.equal(u.cartes, 3);
    const d = await antor.request.delete(`${api}/assets`, { data: { ids: [idsAssets.lampe] } });
    assert.ok(d.ok(), await d.text());
    await ouvrir(cartes[0]!);
    await toutSelectionner();
    await onglet('Propriétés');
    await antor.getByText('Asset retiré', { exact: true }).first().waitFor();
    await antor.getByRole('button', { name: 'Supprimer' }).click();
    await enregistre(cartes[0]!, (doc) => doc.elements.length === 0);
  });

  it('le 21e calque est refusé : « 20 calques au plus. »', async () => {
    const cid = await nouvelle('Calques');
    await ouvrir(cid);
    await onglet('Calques');
    for (let i = (await lire(cid)).document.calques.length; i < 20; i++) {
      await antor.getByRole('button', { name: 'Nouveau calque' }).click();
      await antor.getByRole('menuitem', { name: 'Calque d’objets' }).click();
      await enregistre(cid, (d) => d.calques.length === i + 1);
    }
    await antor.getByRole('button', { name: 'Nouveau calque' }).click();
    await antor.getByRole('menuitem', { name: 'Calque d’objets' }).click();
    await antor.getByText('20 calques au plus.').first().waitFor();
    assert.equal((await lire(cid)).document.calques.length, 20);
  });
  it('reprise du verify : champs de la carte actifs sans sélection', async () => {
    const cid = await nouvelle('Reprise champs');
    await ouvrir(cid);
    // properties without selection: each field writes at once
    await onglet('Propriétés');
    const nom = antor.getByLabel('Nom', { exact: true });
    await nom.fill('Salle des gardes');
    await nom.press('Enter');
    await antor.getByText('Enregistré', { exact: true }).waitFor();
    assert.equal((await lire(cid)).titre, 'Salle des gardes');
    const larg = antor.getByLabel(/Largeur/);
    await larg.fill('32');
    await larg.press('Enter');
    // wait for the written effect (read through the door), never for the typed value
    await enregistre(cid, (d) => d.largeur === 32);
    await larg.fill('abc');
    await larg.press('Enter');
    await antor.getByText('Entrez un nombre entier de cases.').waitFor();
    assert.equal((await lire(cid)).document.largeur, 32, 'valeur refusée : rien n’est écrit');
    await nom.fill('');
    await nom.press('Enter');
    await antor.getByText('Le nom fait de 1 à 80 caractères.').waitFor();
    assert.equal((await lire(cid)).titre, 'Salle des gardes');
  });
  it('reprise du verify : calque MJ seul hachuré', async () => {
    const cid = await nouvelle('Reprise calque');
    await ouvrir(cid);
    // MJ-only layer row is marked
    await onglet('Calques');
    await antor.getByRole('button', { name: 'Nouveau calque' }).click();
    await antor.getByRole('menuitem', { name: 'Calque d’objets' }).click();
    await antor.locator('[data-calque="Objets 2"]').waitFor();
    assert.equal(await antor.locator('[data-calque="Objets 2"]').evaluate((el: Element) => el.classList.contains('mj')), false);
    await antor.getByRole('button', { name: 'Menu du calque Objets 2' }).click();
    await antor.getByRole('menuitem', { name: 'MJ seul : activer' }).click();
    await antor.locator('[data-calque="Objets 2"].mj').waitFor();
    await enregistre(cid, (d) => d.calques.some((c: Any) => c.nom === 'Objets 2' && c.mj_seul === true));
    const fond = await antor.locator('[data-calque="Objets 2"]').evaluate((el: Element) => getComputedStyle(el).backgroundImage);
    assert.match(fond, /repeating-linear-gradient/);
    assert.equal(await antor.locator('[data-calque="Objets"]').evaluate((el: Element) => getComputedStyle(el).backgroundImage), 'none');
  });
  it('reprise du verify : libellé « Asset retiré » sur le canevas', async () => {
    const cid = await nouvelle('Reprise retire');
    // « Asset retiré » is real text on the canvas, for an element of a visible layer only
    const doc = (await lire(cid)).document;
    const obj = doc.calques.find((c: Any) => c.nom === 'Objets');
    const r = await antor.request.post(`${api}/cartes/${cid}/commandes`, {
      data: { version: (await lire(cid)).version, commandes: [{ type: 'poser_element', id: 'fantome', calque: obj.id, asset_id: String(idsAssets.torche), x: 5.5, y: 5.5 }] },
    });
    assert.ok(r.ok(), await r.text());
    assert.ok((await antor.request.delete(`${api}/assets`, { data: { ids: [idsAssets.torche] } })).ok());
    await ouvrir(cid);
    await antor.locator('.canevas-retire', { hasText: 'Asset retiré' }).waitFor();
    assert.equal(await antor.locator('.canevas-retire').count(), 1);
    await onglet('Calques');
    await antor.getByRole('button', { name: 'Masquer Objets', exact: true }).click();
    await antor.locator('.canevas-retire').waitFor({ state: 'detached' });
  });
});

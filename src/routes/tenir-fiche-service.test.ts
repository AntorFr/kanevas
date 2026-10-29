// Tests of kanevas-tenir-fiche-service, written from the exit criterion only (B-39, B-40, B-48, AD-119).
// HTTP in stub mode, real SQLite; the stub world's files and Port-Sel's place come from semerIllustrations.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;
const DISQUE = mkdtempSync(join(tmpdir(), 'kv-disque-'));
process.env.ATTACHMENTS_DIR = DISQUE;

const { buildApp } = await import('../app.js');
const { semerBouchon, semerIllustrations, JETON_BOUCHON } = await import('../bouchon/depart.js');
const { creerCompteRendu } = await import('../services/comptes_rendus.js');
const { creerFiche } = await import('../services/fiches.js');
type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any

async function monde() {
  const app = await buildApp();
  semerBouchon(app.db);
  await semerIllustrations(app.db, DISQUE);
  const idU = (nom: string) => (app.db.prepare('SELECT id FROM univers WHERE nom = ?').get(nom) as Any).id as number;
  const idC = (u: string) => (app.db.prepare('SELECT id FROM comptes WHERE username = ?').get(u) as Any).id as number;
  const cookies = new Map<string, string>();
  const req = async (compte: string, method: string, url: string, payload?: object) => {
    if (!cookies.has(compte)) {
      const res = await app.inject({
        method: 'POST',
        url: '/connexion-bouchon',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: `compte=${compte}`,
      });
      cookies.set(compte, `kanevas_session=${res.cookies.find((c) => c.name === 'kanevas_session')!.value}`);
    }
    const r = await app.inject({ method: method as 'GET', url, headers: { cookie: cookies.get(compte)! }, payload });
    let json: Any = null;
    try {
      json = JSON.parse(r.body);
    } catch {
      json = r.body;
    }
    return { status: r.statusCode, json };
  };
  const lame = idU("Lame d'Ébène");
  const essai = idU('Essai Kanka');
  const fid = (u: number, titre: string) =>
    (app.db.prepare('SELECT id FROM fiches WHERE univers_id = ? AND titre = ?').get(u, titre) as Any).id as number;
  const imp = (method: string, chemin: string, payload?: object) =>
    app.inject({
      method: method as 'GET',
      url: `/api/import/v1/univers/${essai}/${chemin}`,
      headers: { authorization: `Bearer ${JETON_BOUCHON}` },
      payload,
    });
  return { app, req, lame, essai, fid, idC, imp };
}
const F = (u: number, f?: number) => `/api/univers/${u}/fiches${f ? `/${f}` : ''}`;

test('antor_renomme_port_sel_et_les_titres_invalides_sont_400_lea_403', async () => {
  const w = await monde();
  const port = w.fid(w.lame, 'Port-Sel');
  const r = await w.req('antor', 'PATCH', F(w.lame, port), { titre: 'Port-Sel-sur-Brume' });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.titre, 'Port-Sel-sur-Brume');
  assert.equal((w.app.db.prepare('SELECT titre FROM fiches WHERE id = ?').get(port) as Any).titre, 'Port-Sel-sur-Brume');
  for (const titre of ['', '   ', 'x'.repeat(121)]) {
    assert.equal((await w.req('antor', 'PATCH', F(w.lame, port), { titre })).status, 400, `[${titre.length}]`);
  }
  assert.equal((await w.req('antor', 'PATCH', F(w.lame, port), { titre: 7 })).status, 400);
  assert.equal((await w.req('antor', 'PATCH', F(w.lame, port), { titre: 'x'.repeat(120) })).status, 200);
  assert.equal((await w.req('lea', 'PATCH', F(w.lame, port), { titre: 'Pirate' })).status, 403);
  assert.equal((w.app.db.prepare('SELECT titre FROM fiches WHERE id = ?').get(port) as Any).titre, 'x'.repeat(120));
});

test('renommer_ne_touche_pas_dernier_import_et_un_compte_rendu_se_renomme', async () => {
  const w = await monde();
  const camp = creerFiche(w.app.db, w.idC('antor'), w.lame, { type: 'aventure', sousType: 'Campagne', titre: 'Brumes' });
  const cr = creerCompteRendu(w.app.db, w.idC('antor'), w.lame, camp.id, { titre: 'Séance 1' });
  const avant = w.app.db.prepare('SELECT dernier_import FROM fiches WHERE id = ?').get(cr.id);
  const r = await w.req('antor', 'PATCH', F(w.lame, cr.id), { titre: 'Séance 1 bis' });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.titre, 'Séance 1 bis');
  assert.deepEqual(w.app.db.prepare('SELECT dernier_import FROM fiches WHERE id = ?').get(cr.id), avant);
  // an imported sheet: dernier_import (the title the import wrote) survives a rename
  const lot = ((await w.imp('POST', 'lots')).json() as Any).lotId;
  const im = (await w.imp('PUT', `fiches/lieu:x?lot=${lot}`, { type: 'lieu', titre: 'Xanadu', sections: [] })).json() as Any;
  const di = w.app.db.prepare('SELECT dernier_import FROM fiches WHERE id = ?').get(im.id) as Any;
  assert.ok(di.dernier_import);
  await w.req('antor', 'PATCH', F(w.essai, im.id), { titre: 'Autre' });
  assert.deepEqual(w.app.db.prepare('SELECT dernier_import FROM fiches WHERE id = ?').get(im.id), di);
});

test('bilan_de_port_sel_pour_antor_404_pour_lea', async () => {
  const w = await monde();
  const port = w.fid(w.lame, 'Port-Sel');
  const r = await w.req('antor', 'GET', `${F(w.lame, port)}/suppression`);
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.deepEqual(r.json, {
    sections: 3,
    relations: 5,
    places: 1,
    fichiers: 2,
    enfants: 5,
    parent: { id: w.fid(w.lame, 'Les Sphères'), titre: 'Les Sphères' },
  });
  assert.equal((await w.req('lea', 'GET', `${F(w.lame, port)}/suppression`)).status, 404);
  assert.equal((await w.req('antor', 'GET', `${F(w.lame, 999999)}/suppression`)).status, 404);
  // the bilan writes nothing
  assert.equal((w.app.db.prepare('SELECT COUNT(*) n FROM fiches WHERE id = ?').get(port) as Any).n, 1);
});

test('supprimer_port_sel_remonte_enfants_casse_le_lien_garde_les_fichiers', async () => {
  const w = await monde();
  const db = w.app.db;
  const port = w.fid(w.lame, 'Port-Sel');
  const spheres = w.fid(w.lame, 'Les Sphères');
  const aldric = w.fid(w.lame, 'Maître Aldric');
  const enfants = (db.prepare('SELECT id FROM fiches WHERE parent_id = ?').all(port) as Any[]).map((e) => e.id);
  assert.equal(enfants.length, 5);
  const fichiersAvant = await w.req('antor', 'GET', `/api/univers/${w.lame}/fichiers`);
  const nomsAvant = JSON.stringify(fichiersAvant.json);
  assert.ok(nomsAvant.includes('port-sel-quais'));
  const lienAvant = (await w.req('antor', 'GET', F(w.lame, aldric))).json;
  assert.ok(JSON.stringify(lienAvant).includes('Port-Sel'));

  // exclusion : a player who reads the sheet is refused, one who does not is not told it exists
  const lea = await w.req('lea', 'DELETE', F(w.lame, port));
  assert.ok([403, 404].includes(lea.status));
  assert.equal(lea.status, 403, 'Léa lit Port-Sel (Description publique) : refus, pas introuvable');
  assert.equal((db.prepare('SELECT COUNT(*) n FROM fiches WHERE id = ?').get(port) as Any).n, 1);

  const r = await w.req('antor', 'DELETE', F(w.lame, port));
  assert.equal(r.status, 204);
  assert.equal((await w.req('antor', 'GET', F(w.lame, port))).status, 404);
  assert.equal((await w.req('antor', 'DELETE', F(w.lame, port))).status, 404);
  for (const e of enfants) assert.equal((db.prepare('SELECT parent_id FROM fiches WHERE id = ?').get(e) as Any).parent_id, spheres);
  assert.equal((db.prepare('SELECT COUNT(*) n FROM elements_carte WHERE fiche_id = ?').get(port) as Any).n, 0);
  assert.equal((db.prepare('SELECT COUNT(*) n FROM relations WHERE cible_fiche_id = ?').get(port) as Any).n, 0);
  assert.equal((db.prepare('SELECT COUNT(*) n FROM sections WHERE fiche_id = ?').get(port) as Any).n, 0);

  const antor = (await w.req('antor', 'GET', F(w.lame, aldric))).json;
  const lea2 = (await w.req('lea', 'GET', F(w.lame, aldric))).json;
  assert.ok(JSON.stringify(antor).includes('lien-casse'), 'lien cassé pour Antor');
  assert.ok(!JSON.stringify(lea2).includes('lien-casse'), 'texte simple pour Léa');
  assert.ok(JSON.stringify(lea2).includes('Port-Sel'));
  assert.ok(!JSON.stringify(lea2).includes('/fiches/' + port));

  const ment = await w.req('antor', 'GET', `${F(w.lame, enfants[0])}/mentions`);
  assert.ok(!JSON.stringify(ment.json).includes('Port-Sel'));
  assert.equal(JSON.stringify((await w.req('antor', 'GET', F(w.lame, aldric))).json).includes('"ficheId":' + port), false);

  const apres = await w.req('antor', 'GET', `/api/univers/${w.lame}/fichiers`);
  assert.ok(JSON.stringify(apres.json).includes('port-sel-quais'));
  assert.equal(
    (apres.json.fichiers ?? apres.json).length,
    (fichiersAvant.json.fichiers ?? fichiersAvant.json).length,
    'aucun fichier de la médiathèque ne part',
  );
});

test('transaction_en_echec_laisse_fiche_enfants_et_disque_intacts_puis_succes_efface_la_piece_jointe', async () => {
  const w = await monde();
  const db = w.app.db;
  const port = w.fid(w.lame, 'Port-Sel');
  const sec = (db.prepare('SELECT id FROM sections WHERE fiche_id = ? LIMIT 1').get(port) as Any).id;
  const nom = 'abcdef01-2345-6789-abcd-ef0123456789';
  writeFileSync(join(DISQUE, nom), 'x');
  db.prepare("INSERT INTO pieces_jointes (section_id, nom, type, taille, fichier, cree_le) VALUES (?, 'a.txt', 'text/plain', 1, ?, 'x')").run(sec, nom);
  db.exec(`CREATE TRIGGER sabote BEFORE DELETE ON fiches WHEN OLD.id = ${port} BEGIN SELECT RAISE(ABORT, 'sabotage'); END`);
  const r = await w.req('antor', 'DELETE', F(w.lame, port));
  assert.ok(r.status >= 400, String(r.status));
  const n = (sql: string) => (db.prepare(sql).get() as Any).n as number;
  assert.equal(n(`SELECT COUNT(*) n FROM fiches WHERE id = ${port}`), 1);
  assert.equal(n(`SELECT COUNT(*) n FROM fiches WHERE parent_id = ${port}`), 5);
  assert.equal(n(`SELECT COUNT(*) n FROM sections WHERE fiche_id = ${port}`), 3);
  assert.equal(n(`SELECT COUNT(*) n FROM relations WHERE cible_fiche_id = ${port}`), 5);
  assert.equal(n(`SELECT COUNT(*) n FROM elements_carte WHERE fiche_id = ${port}`), 1);
  assert.equal(n(`SELECT COUNT(*) n FROM pieces_jointes WHERE fichier = '${nom}'`), 1);
  assert.ok(existsSync(join(DISQUE, nom)), 'le disque est intact après un échec');
  const fichiers = n('SELECT COUNT(*) n FROM fichiers');
  db.exec('DROP TRIGGER sabote');
  assert.equal((await w.req('antor', 'DELETE', F(w.lame, port))).status, 204);
  assert.ok(!existsSync(join(DISQUE, nom)), 'la pièce jointe propre à la fiche part du disque après le commit');
  assert.equal(n('SELECT COUNT(*) n FROM fichiers'), fichiers);
});

test('import_delete_par_cle_cree_supprime_recree_et_cle_inconnue_204_sans_ecriture', async () => {
  const w = await monde();
  const corps = { type: 'lieu', titre: 'Havre-Gris', sections: [{ cle: 'd', titre: 'Description', contenu: 'Un havre.' }] };
  const lot = async () => ((await w.imp('POST', 'lots')).json() as Any).lotId as number;
  const put = async (l: number) => (await w.imp('PUT', `fiches/lieu:havre-gris?lot=${l}`, corps)).json();
  const l1 = await lot();
  assert.equal((await put(l1)).etat, 'creee');
  const d = await w.imp('DELETE', `fiches/lieu:havre-gris?lot=${l1}`);
  assert.equal(d.statusCode, 204);
  assert.equal((w.app.db.prepare("SELECT COUNT(*) n FROM fiches WHERE cle_origine = 'lieu:havre-gris'").get() as Any).n, 0);
  assert.equal((await put(l1)).etat, 'creee');
  await w.imp('POST', `lots/${l1}/clore`);
  const rap1 = (await w.imp('GET', `lots/${l1}`)).json() as Any;
  assert.equal(rap1.compteurs.fiches.supprimees, 1);
  assert.equal(rap1.compteurs.fiches.creees, 2);

  const l2 = await lot();
  const avant = JSON.stringify(w.app.db.prepare('SELECT * FROM fiches ORDER BY id').all());
  assert.equal((await w.imp('DELETE', `fiches/lieu:inconnu?lot=${l2}`)).statusCode, 204);
  assert.equal((await w.imp('DELETE', `fiches/n-importe-quoi`)).statusCode, 204);
  assert.equal(JSON.stringify(w.app.db.prepare('SELECT * FROM fiches ORDER BY id').all()), avant);
  const rap2 = (await w.imp('GET', `lots/${l2}`)).json() as Any;
  assert.equal(rap2.compteurs.fiches.supprimees, 0);
  for (const n of ['fichiers', 'relations']) assert.equal(rap2.compteurs[n].supprimees, undefined, n);
  // without a lot: nothing counted, no trace
  assert.equal((await w.imp('DELETE', 'fiches/lieu:havre-gris')).statusCode, 204);
  // closed batch
  assert.equal((await w.imp('DELETE', `fiches/lieu:havre-gris?lot=${l1}`)).statusCode, 409);
  // no token / wrong universe
  const sans = await w.app.inject({ method: 'DELETE', url: `/api/import/v1/univers/${w.essai}/fiches/lieu:x` });
  assert.equal(sans.statusCode, 401);
  const autre = await w.app.inject({
    method: 'DELETE',
    url: `/api/import/v1/univers/${w.lame}/fiches/lieu:x`,
    headers: { authorization: `Bearer ${JETON_BOUCHON}` },
  });
  assert.equal(autre.statusCode, 404);
});

test('titre_renomme_dune_fiche_importee_nest_pas_ecrase_au_rejeu_et_le_lot_le_dit', async () => {
  const w = await monde();
  const corps = { type: 'lieu', titre: 'Havre-Gris', sections: [{ cle: 'd', titre: 'Description', contenu: 'Un havre.' }] };
  const l1 = ((await w.imp('POST', 'lots')).json() as Any).lotId;
  const r1 = (await w.imp('PUT', `fiches/lieu:havre-gris?lot=${l1}`, corps)).json() as Any;
  assert.equal((await w.req('antor', 'PATCH', F(w.essai, r1.id), { titre: 'Havre-Brume' })).status, 200);
  const l2 = ((await w.imp('POST', 'lots')).json() as Any).lotId;
  const r2 = (await w.imp('PUT', `fiches/lieu:havre-gris?lot=${l2}`, corps)).json() as Any;
  assert.equal(r2.id, r1.id);
  assert.equal((w.app.db.prepare('SELECT titre FROM fiches WHERE id = ?').get(r1.id) as Any).titre, 'Havre-Brume');
  await w.imp('POST', `lots/${l2}/clore`);
  const rap = (await w.imp('GET', `lots/${l2}`)).json() as Any;
  assert.ok(JSON.stringify(rap.rapport).includes('titre modifié dans Kanevas'), JSON.stringify(rap));
  assert.equal(rap.avertissements, 1);
});

test('joueur_en_mode_joueur_ne_supprime_ni_ne_renomme', async () => {
  const w = await monde();
  const port = w.fid(w.lame, 'Port-Sel');
  // GM in player mode: the HTTP actor reads ?mode=joueur
  const r = await w.req('antor', 'DELETE', `${F(w.lame, port)}?mode=joueur`);
  const p = await w.req('antor', 'PATCH', `${F(w.lame, port)}?mode=joueur`, { titre: 'Zut' });
  const b = await w.req('antor', 'GET', `${F(w.lame, port)}/suppression?mode=joueur`);
  assert.ok(r.status === 403 || r.status === 404, String(r.status));
  assert.ok(p.status === 403 || p.status === 404, String(p.status));
  assert.equal(b.status, 404);
  assert.equal((w.app.db.prepare('SELECT titre FROM fiches WHERE id = ?').get(port) as Any).titre, 'Port-Sel');
});

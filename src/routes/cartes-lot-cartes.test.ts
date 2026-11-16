// Doors of the guards of the maps (AD-68, `lireCarte`) that the screen files of the « cartes » lot proved through the browser:
// what a player's read names, the write matrix of a player on a map she reads or does not read, a graph that takes neither a
// background nor a position, a sheet of another universe or an unknown one, and the instance admin without a role.
// The routes are those of `routes/cartes.ts`, driven by `inject` on the seeded app (monde-lot-cartes.ts).
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { appel, lire, type Monde, monde } from './monde-lot-cartes.js';

const base = (m: Monde) => `/api/univers/${m.uid}`;
const cartes = (m: Monde) => `${base(m)}/cartes`;

async function fiche(m: Monde, titre: string, lisible: boolean): Promise<number> {
  const f = await appel(m, 'antor', 'POST', `${base(m)}/fiches`, { type: 'faction', titre, sections: [{ titre: 'Notes', contenu: 'x', joueursLisent: lisible }] });
  assert.equal(f.status, 201, f.texte);
  return f.json.id;
}
async function graphe(m: Monde, titre: string, visible: boolean): Promise<number> {
  const c = await appel(m, 'antor', 'POST', cartes(m), { titre, forme: 'graphe' });
  assert.equal(c.status, 201, c.texte);
  if (visible) assert.equal((await appel(m, 'antor', 'PATCH', `${cartes(m)}/${c.json.id}`, { visible: true })).status, 200);
  return c.json.id;
}

describe('Maps: the guards by the route', () => {
  test('a player reads a visible graph without the sheet she cannot read, and a hidden map answers as an unknown one', async () => {
    const m = await monde();
    const ouverte = await fiche(m, 'Lames Grises', true);
    const fermee = await fiche(m, 'Ombres de Fer', false);
    const g = await graphe(m, 'Les factions', false);
    for (const f of [ouverte, fermee]) assert.equal((await appel(m, 'antor', 'POST', `${cartes(m)}/${g}/elements`, { ficheId: f })).status, 201);
    const cachee = await lire(m, 'lea', `${cartes(m)}/${g}`);
    const inconnue = await lire(m, 'lea', `${cartes(m)}/987654`);
    assert.equal(cachee.status, 404);
    assert.equal(cachee.texte, inconnue.texte);
    assert.ok(!cachee.texte.includes('factions'));
    assert.equal((await appel(m, 'antor', 'PATCH', `${cartes(m)}/${g}`, { visible: true })).status, 200);
    const lue = await lire(m, 'lea', `${cartes(m)}/${g}`);
    assert.equal(lue.status, 200);
    assert.deepEqual(lue.json.elements.map((e: { titre: string }) => e.titre), ['Lames Grises']);
    assert.ok(!lue.texte.includes('Ombres'));
  });

  test('a player who reads the map is refused every write (403); one who does not read it gets the 404 of an unknown map; nothing changes', async () => {
    const m = await monde();
    const f = await fiche(m, 'Lames Grises', true);
    const lue = await graphe(m, 'La ville', true);
    const cachee = await graphe(m, 'Carte cachée', false);
    assert.equal((await appel(m, 'antor', 'POST', `${cartes(m)}/${lue}/elements`, { ficheId: f })).status, 201);
    const e = (await lire(m, 'antor', `${cartes(m)}/${lue}`)).json.elements[0].id;
    const statut = async (verbe: string, url: string, corps?: unknown) => (await appel(m, 'lea', verbe, url, corps)).status;
    assert.equal(await statut('PATCH', `${cartes(m)}/${lue}`, { visible: false }), 403);
    assert.equal(await statut('PATCH', `${cartes(m)}/${lue}`, { titre: 'Pirate' }), 403);
    assert.equal(await statut('POST', `${cartes(m)}/${lue}/elements`, { ficheId: f }), 403);
    assert.equal(await statut('DELETE', `${cartes(m)}/${lue}/elements/${e}`), 403);
    assert.equal(await statut('PATCH', `${cartes(m)}/${cachee}`, { visible: true }), 404);
    assert.equal(await statut('POST', `${cartes(m)}/${cachee}/elements`, { ficheId: f }), 404);
    const apres = await lire(m, 'antor', `${cartes(m)}/${lue}`);
    assert.equal(apres.json.carte.titre, 'La ville');
    assert.equal(apres.json.carte.visible, true);
    assert.equal(apres.json.elements.length, 1);
  });

  test('a graph takes no background and no position; a sheet unknown or of another universe is refused (400) and nothing is placed', async () => {
    const m = await monde();
    const f = await fiche(m, 'Lames Grises', true);
    const g = await graphe(m, 'Sans position', false);
    const fond = await m.app.inject({
      method: 'PUT',
      url: `${cartes(m)}/${g}/fond`,
      headers: { cookie: m.cookies.antor, 'content-type': 'multipart/form-data; boundary=B' },
      payload: Buffer.concat([
        Buffer.from('--B\r\nContent-Disposition: form-data; name="fichier"; filename="a.png"\r\n\r\n'),
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]),
        Buffer.from('\r\n--B--\r\n'),
      ]),
    });
    assert.ok(fond.statusCode >= 400 && fond.statusCode < 500, `fond: ${fond.statusCode}`);
    const pos = await appel(m, 'antor', 'POST', `${cartes(m)}/${g}/elements`, { ficheId: f, x: 10, y: 10 });
    assert.ok(pos.status >= 400 && pos.status < 500, `position: ${pos.status}`);
    assert.equal((await appel(m, 'antor', 'POST', `${cartes(m)}/${g}/elements`, { ficheId: 999999 })).status, 400);
    const autre = (await appel(m, 'antor', 'POST', '/api/univers', { nom: 'Autre monde' })).json;
    const etrangere = (await appel(m, 'antor', 'POST', `/api/univers/${autre.id}/fiches`, { type: 'faction', titre: 'Étrangère' })).json.id;
    assert.equal((await appel(m, 'antor', 'POST', `${cartes(m)}/${g}/elements`, { ficheId: etrangere })).status, 400);
    assert.deepEqual((await lire(m, 'antor', `${cartes(m)}/${g}`)).json.elements, []);
  });

  test('the instance admin and an account without a role read « introuvable » on a visible map and on the list of maps', async () => {
    const m = await monde();
    const g = await graphe(m, 'Les factions', true);
    for (const compte of ['admin', 'teo']) {
      assert.equal((await lire(m, compte, `${cartes(m)}/${g}`)).status, 404, compte);
      assert.equal((await lire(m, compte, cartes(m))).status, 404, compte);
    }
  });
});

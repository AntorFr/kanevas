// Doors of the 100 000-character ceiling of a section, which « plafond-sections » proved through the browser (server tests).
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { monter } from './monde-lot-aventures.js';

const MESSAGE = 'Contenu trop long : 100 000 caractères au plus.';

async function monde() {
  const w = await monter();
  const fiche = await w.creer(w.antor, { type: 'lieu', titre: 'Grimoire' });
  const url = (id: number) => `${w.base}/fiches/${fiche.id}/sections/${id}`;
  const section = async (contenu?: string) => {
    const r = await w.appel(w.antor, 'POST', `${w.base}/fiches/${fiche.id}/sections`, { titre: `S${Math.random()}`, ...(contenu === undefined ? {} : { contenu }) });
    assert.equal(r.statusCode, 201, r.body);
    return { id: r.json().id as number, url: url(r.json().id), version: r.json().version as number };
  };
  return { ...w, fiche, section };
}

describe('Section content ceiling', () => {
  test('/api/moi gives the section ceiling', async () => {
    const w = await monter();
    assert.deepEqual((await w.appel(w.antor, 'GET', '/api/moi')).json(), { username: 'antor', groups: [], limites: { contenuSection: 100000 } });
  });

  test('a PUT of 100 000 characters is kept whole and bumps the version; 100 001 is refused (400, fixed message), content and version unchanged', async () => {
    const m = await monde();
    const s = await m.section();
    const ok = await m.appel(m.antor, 'PUT', `${s.url}/contenu`, { contenu: 'a'.repeat(100000), version: s.version });
    assert.equal(ok.statusCode, 200);
    const lue = (await m.appel(m.antor, 'GET', s.url)).json();
    assert.equal(lue.contenu.length, 100000);
    assert.equal(lue.version, 2);
    const t = await m.section('avant');
    const trop = await m.appel(m.antor, 'PUT', `${t.url}/contenu`, { contenu: 'b'.repeat(100001), version: t.version });
    assert.equal(trop.statusCode, 400);
    assert.equal(trop.json().message, MESSAGE);
    const apres = (await m.appel(m.antor, 'GET', t.url)).json();
    assert.deepEqual([apres.contenu, apres.version], ['avant', 1]);
  });

  test('the ceiling is checked before the version: 100 001 with a stale version is 400, 100 000 with a stale version is 409', async () => {
    const m = await monde();
    const s = await m.section();
    assert.equal((await m.appel(m.antor, 'PUT', `${s.url}/contenu`, { contenu: 'c'.repeat(100001), version: 99 })).statusCode, 400);
    assert.equal((await m.appel(m.antor, 'PUT', `${s.url}/contenu`, { contenu: 'c'.repeat(100000), version: 99 })).statusCode, 409);
  });

  test('adding a section with 100 000 characters works, with 100 001 is refused (400) and no section is added', async () => {
    const m = await monde();
    const base = `${m.base}/fiches/${m.fiche.id}`;
    const avant = (await m.appel(m.antor, 'GET', base)).json().sections.length;
    const ok = await m.appel(m.antor, 'POST', `${base}/sections`, { titre: 'Pleine', contenu: 'd'.repeat(100000) });
    assert.equal(ok.statusCode, 201);
    assert.equal(ok.json().contenu.length, 100000);
    const trop = await m.appel(m.antor, 'POST', `${base}/sections`, { titre: 'Trop', contenu: 'd'.repeat(100001) });
    assert.equal(trop.statusCode, 400);
    assert.equal(trop.json().message, MESSAGE);
    const apres = (await m.appel(m.antor, 'GET', base)).json().sections as { titre: string }[];
    assert.equal(apres.length, avant + 1);
    assert.ok(!apres.some((s) => s.titre === 'Trop'));
  });

  test('a player who may write is refused at 100 001 characters (400) and accepted at 100 000', async () => {
    const m = await monde();
    const s = await m.section('texte');
    assert.equal((await m.appel(m.antor, 'PATCH', s.url, { joueursLisent: true, joueursEcrivent: true })).statusCode, 200);
    assert.equal((await m.appel(m.lea, 'PUT', `${s.url}/contenu`, { contenu: 'e'.repeat(100001), version: 1 })).statusCode, 400);
    assert.equal((await m.appel(m.antor, 'GET', s.url)).json().contenu, 'texte');
    assert.equal((await m.appel(m.lea, 'PUT', `${s.url}/contenu`, { contenu: 'e'.repeat(100000), version: 1 })).statusCode, 200);
  });

  test('a player with no right to write gets the refusal of rights, not the 400 of the ceiling, and nothing is written', async () => {
    const m = await monde();
    const cachee = await m.section('secret');
    const r = await m.appel(m.lea, 'PUT', `${cachee.url}/contenu`, { contenu: 'f'.repeat(100001), version: 1 });
    assert.ok(r.statusCode === 403 || r.statusCode === 404, String(r.statusCode));
    assert.equal((await m.appel(m.antor, 'GET', cachee.url)).json().contenu, 'secret');
    const lisible = await m.section('lisible');
    await m.appel(m.antor, 'PATCH', lisible.url, { joueursLisent: true });
    assert.equal((await m.appel(m.lea, 'PUT', `${lisible.url}/contenu`, { contenu: 'f'.repeat(100001), version: 1 })).statusCode, 403);
  });
});

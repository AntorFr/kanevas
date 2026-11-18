// Doors of the lot « outils » for `src/e2e/markdown-*.test.ts` (docs/tests-ecran/lot-outils.md): who receives the Markdown source, the
// preview route, the assistant's reading and the 100 000-character ceiling, in-process (`inject`, no browser).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Any, monter } from './monde-lot-ecrans.js';

async function monde(nom: string) {
  const m = await monter();
  const u = await m.univers(nom, ['lea']);
  const f = await m.creer(m.antor, u.base, { type: 'personnage', titre: 'Maître Aldric', charge: { v: 1, pj: false } });
  /** A section Léa may read. */
  const lue = async (titre: string, contenu: string) => {
    const s = await m.dire(m.antor, 'POST', `${u.base}/fiches/${f.id}/sections`, { titre, contenu });
    assert.equal(s.status, 201);
    assert.equal((await m.dire(m.antor, 'PATCH', `${u.base}/fiches/${f.id}/sections/${s.corps.id}`, { joueursLisent: true })).status, 200);
    return s.corps.id as number;
  };
  return { ...m, b: u.base, f: f.id, lue };
}

test('B-32: Léa’s read of a sheet and of a section carries the rendered text and never the source; Antor’s carries it', async () => {
  const m = await monde('Source MD');
  const sid = await m.lue('Apparence', '## Quartiers\n\nUn **gras** secret-de-source');
  for (const url of [`${m.b}/fiches/${m.f}`, `${m.b}/fiches/${m.f}/sections/${sid}`]) {
    const lea = (await m.appel(m.lea, 'GET', url)).body;
    assert.equal(lea.includes('**gras**'), false, `${url} (Léa) must not carry the source`);
    assert.equal(lea.includes('## Quartiers'), false);
    assert.ok(lea.includes('<h3>Quartiers</h3>'));
    assert.ok(lea.includes('<strong>gras</strong>'));
    assert.ok((await m.appel(m.antor, 'GET', url)).body.includes('**gras**'), `${url} (Antor) carries the source`);
  }
});

test('B-32: the preview route renders what the reading renders; no session, no preview', async () => {
  const m = await monde('Apercu MD');
  const texte = '# T\n\n- a\n- b\n\n**g** <b>x</b> [l](javascript:1)';
  const sid = await m.lue('S', texte);
  const ap = await m.dire(m.lea, 'POST', '/api/apercu', { texte });
  assert.equal(ap.status, 200);
  const lecture = await m.dire(m.lea, 'GET', `${m.b}/fiches/${m.f}/sections/${sid}`);
  assert.equal(ap.corps.html, lecture.corps.html);
  assert.equal(ap.corps.html, '<h3>T</h3>\n<ul>\n<li>a</li>\n<li>b</li>\n</ul>\n<p><strong>g</strong> &lt;b&gt;x&lt;/b&gt; [l](javascript:1)</p>\n');
  assert.notEqual((await m.appel(undefined, 'POST', '/api/apercu', { texte: 'a' })).statusCode, 200);
});

test('B-32: the assistant reading a section for Léa gives the text and not the Markdown source', async () => {
  const m = await monde('Assistant MD');
  await m.lue('Apparence', '## Quartiers\n\nUn homme **robuste**');
  const rep = await m.dire(m.lea, 'POST', `${m.b}/assistant/messages`, { message: 'lis-moi la section « Apparence »', historique: [] });
  assert.equal(rep.status, 200, JSON.stringify(rep.corps));
  assert.ok(rep.corps.reponse.includes('robuste'), rep.corps.reponse);
  assert.equal(rep.corps.reponse.includes('**robuste**'), false);
  assert.equal(rep.corps.reponse.includes('## Quartiers'), false);
});

test('B-43: 100 000 characters are saved, 100 001 is 400 with the fixed message — section (create and replace), report, system entry', async () => {
  const m = await monde('Plafond MD');
  const MSG = 'Contenu trop long : 100 000 caractères au plus.';
  const ok = 'a'.repeat(100000);
  const trop = 'a'.repeat(100001);
  assert.equal((await m.dire(m.lea, 'GET', '/api/moi')).corps.limites.contenuSection, 100000);

  assert.equal((await m.dire(m.antor, 'POST', `${m.b}/fiches/${m.f}/sections`, { titre: 'Ok', contenu: ok })).status, 201);
  const refus = await m.dire(m.antor, 'POST', `${m.b}/fiches/${m.f}/sections`, { titre: 'Trop', contenu: trop });
  assert.equal(refus.status, 400);
  assert.equal(refus.corps.message, MSG);
  const s = await m.dire(m.antor, 'POST', `${m.b}/fiches/${m.f}/sections`, { titre: 'Cible', contenu: 'x' });
  const put = (contenu: string) => m.dire(m.antor, 'PUT', `${m.b}/fiches/${m.f}/sections/${s.corps.id}/contenu`, { contenu, version: 1 });
  const r1 = await put(trop);
  assert.equal(r1.status, 400);
  assert.equal(r1.corps.message, MSG);
  assert.equal((await put(ok)).status, 200);
  assert.equal((await m.dire(m.antor, 'GET', `${m.b}/fiches/${m.f}/sections/${s.corps.id}`)).corps.contenu.length, 100000);

  const camp = await m.dire(m.antor, 'POST', `${m.b}/fiches`, { type: 'aventure', sousType: 'Campagne', titre: 'Camp', sections: [{ titre: 'Présentation', joueursLisent: true }] });
  const cr = (texte: string) => m.dire(m.lea, 'POST', `${m.b}/comptes-rendus`, { campagneId: camp.corps.id, titre: 'Séance', texte });
  assert.equal((await cr(ok)).status, 201);
  const rc = await cr(trop);
  assert.equal(rc.status, 400);
  assert.equal(rc.corps.message, MSG);

  const sys = await m.dire(m.antor, 'POST', '/api/systemes', { nom: 'Plafond' });
  await m.dire(m.antor, 'PUT', `${m.b}/systeme`, { systemeId: sys.corps.id });
  const en = (contenu: string) => m.dire(m.antor, 'POST', `/api/systemes/${sys.corps.id}/gabarits`, { type: 'creature', nom: 'R', contenu });
  assert.equal((await en(ok)).status, 201);
  const re = await en(trop);
  assert.equal(re.status, 400);
  assert.equal(re.corps.message, MSG);
});

test('B-43 screen counterpart: a section whose text went over the ceiling in the editor is not saved (the old text is read back)', async () => {
  const m = await monde('Plafond ecran');
  const sid = await m.lue('Apparence', 'avant');
  const r = await m.dire(m.antor, 'PUT', `${m.b}/fiches/${m.f}/sections/${sid}/contenu`, { contenu: 'a'.repeat(100001), version: 1 });
  assert.equal(r.status, 400);
  assert.equal((await m.dire(m.antor, 'GET', `${m.b}/fiches/${m.f}/sections/${sid}`)).corps.contenu, 'avant');
});

test('E-12: a proposal made by the assistant carries the rendered current text and a proposed text; only its requester reads it (the player gets 404)', async () => {
  const m = await monde('Prop MD');
  await m.dire(m.antor, 'POST', `${m.b}/fiches/${m.f}/sections`, { titre: 'Vérité', contenu: '## Avant\n\n- un' });
  const camp = await m.dire(m.antor, 'POST', `${m.b}/fiches`, { type: 'aventure', sousType: 'Campagne', titre: 'C', sections: [{ titre: 'Présentation', joueursLisent: true }] });
  await m.dire(m.lea, 'POST', `${m.b}/comptes-rendus`, { campagneId: camp.corps.id, titre: 'Séance 3', texte: 'Aldric a livré la clef.' });
  const rep = await m.dire(m.antor, 'POST', `${m.b}/assistant/messages`, {
    message: 'Mets à jour la section « Vérité » de « Maître Aldric » d\'après le compte-rendu « Séance 3 »', historique: [],
  });
  assert.equal(rep.status, 200, JSON.stringify(rep.corps));
  const pid = (rep.corps.evenements as Any[])[0].cible.propositionId;
  const prop = await m.dire(m.antor, 'GET', `${m.b}/propositions/${pid}`);
  assert.equal(prop.status, 200);
  assert.match(prop.corps.htmlActuel, /<h3>Avant<\/h3>/);
  assert.equal(typeof prop.corps.htmlPropose, 'string');
  assert.equal((await m.dire(m.lea, 'GET', `${m.b}/propositions/${pid}`)).status, 404);
});

test('a text written by the editor shortcut is stored and read back; a section of exactly 100 000 characters is stored whole', async () => {
  const m = await monde('Editeur stocke');
  const sid = await m.lue('Apparence', 'Un vieil homme.');
  const put = (contenu: string, version: number) => m.dire(m.antor, 'PUT', `${m.b}/fiches/${m.f}/sections/${sid}/contenu`, { contenu, version });
  assert.equal((await put('Enregistré au clavier', 1)).status, 200);
  assert.ok(JSON.stringify((await m.dire(m.antor, 'GET', `${m.b}/fiches/${m.f}`)).corps).includes('Enregistré au clavier'));
  assert.equal((await put('a'.repeat(100000), 2)).status, 200);
  assert.ok(JSON.stringify((await m.dire(m.antor, 'GET', `${m.b}/fiches/${m.f}`)).corps).includes('a'.repeat(100000)));
});

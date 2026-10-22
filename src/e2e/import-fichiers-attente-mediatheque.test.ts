// Complement of the ensemble tests of kanevas-import-fichiers, written from the need only
// (docs/ecrans.md E-9 « Pending file reference » and E-18 file warnings; docs/parcours.md P-10 steps 4-7, B-49, B-56).
// Every expectation is a literal taken from those documents. Real app, real SQLite, stub mode, no browser needed.
//
// PLAN
//  E-9     exclusion : a waiting file appears in no media library list, for the GM nor for the player; once the
//          PUT arrives, it is listed (nominal: the library only holds real files).
//  E-18    the batch warns « fichier « img:quais » inconnu : référence en attente » for each waiting key, with the
//          sheet's key, and the lot says nothing more about them once the files arrive and the replay is run.
import assert from 'node:assert/strict';
import { after, test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;
delete process.env.KANEVAS_SANS_SEMIS;

const { buildApp } = await import('../app.js');
const { semerBouchon, JETON_BOUCHON } = await import('../bouchon/depart.js');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const fermer: Array<() => Promise<unknown>> = [];
after(async () => {
  for (const f of fermer) await f().catch(() => {});
});

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

async function monde() {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  fermer.push(() => app.close());
  const essai = (app.db.prepare("SELECT id FROM univers WHERE nom = 'Essai Kanka'").get() as { id: number }).id;
  const racine = `/api/import/v1/univers/${essai}`;
  const rendre = (r: Any) => ({ status: r.statusCode as number, txt: r.body as string, json: (() => { try { return JSON.parse(r.body); } catch { return null; } })() as Any });
  const imp = async (methode: string, chemin: string, corps?: unknown) =>
    rendre(await app.inject({ method: methode, url: racine + chemin, headers: { authorization: `Bearer ${JETON_BOUCHON}` }, ...(corps === undefined ? {} : { payload: corps as Record<string, unknown> }) }));
  const fichier = async (cle: string, nom: string, octets: Buffer, lot: number) => {
    const b = '----cmp' + Math.random().toString(16).slice(2);
    const corps = Buffer.concat([
      Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="nom"\r\n\r\n${nom}\r\n--${b}\r\nContent-Disposition: form-data; name="fichier"; filename="x.bin"\r\nContent-Type: application/octet-stream\r\n\r\n`),
      octets,
      Buffer.from(`\r\n--${b}--\r\n`),
    ]);
    return rendre(await app.inject({ method: 'PUT', url: `${racine}/fichiers/${encodeURIComponent(cle)}?lot=${lot}`, headers: { 'content-type': `multipart/form-data; boundary=${b}`, authorization: `Bearer ${JETON_BOUCHON}` }, payload: corps }));
  };
  const cookies = new Map<string, string>();
  const lecture = async (compte: string, url: string) => {
    if (!cookies.has(compte)) {
      const r = await app.inject({ method: 'POST', url: '/connexion-bouchon', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${compte}` });
      cookies.set(compte, `kanevas_session=${r.cookies.find((c: Any) => c.name === 'kanevas_session')!.value}`);
    }
    return rendre(await app.inject({ method: 'GET', url: `/api/univers/${essai}${url}`, headers: { cookie: cookies.get(compte)! } }));
  };
  const lot = async () => (await imp('POST', '/lots')).json.lotId as number;
  const clore = async (id: number) => (await imp('POST', `/lots/${id}/clore`)).json;
  return { imp, fichier, lecture, lot, clore };
}

const FICHE = {
  type: 'lieu',
  titre: 'Les Quais',
  sections: [
    { cle: 'desc', titre: 'Description', contenu: 'Le port.\n\n![](fichier:cle:img:quais)', joueursLisent: true, joueursEcrivent: false, fichiers: ['doc:tarifs'] },
  ],
};

test('E-9 · un fichier en attente n\'est dans aucune liste de la médiathèque ; il y entre quand le PUT arrive', async () => {
  // Fails if a waiting reference is materialised as a library row, or if the arriving file is not listed.
  const m = await monde();
  const l1 = await m.lot();
  const f = await m.imp('PUT', `/fiches/${encodeURIComponent('lieu:quais')}?lot=${l1}`, FICHE);
  assert.equal(f.json.etat, 'creee', f.txt);
  for (const compte of ['antor', 'lea']) {
    const liste = await m.lecture(compte, '/fichiers');
    assert.equal(liste.status, 200);
    assert.ok(!liste.txt.includes('img:quais') && !liste.txt.includes('doc:tarifs'), `${compte}: key in the library list`);
    assert.ok(!liste.txt.includes('quais.png') && !liste.txt.includes('tarifs.pdf'), `${compte}: waiting file listed`);
  }
  assert.equal((await m.fichier('img:quais', 'quais.png', PNG, l1)).json.etat, 'creee');
  assert.equal((await m.fichier('doc:tarifs', 'tarifs.pdf', PDF, l1)).json.etat, 'creee');
  await m.clore(l1);
  for (const compte of ['antor', 'lea']) {
    const liste = await m.lecture(compte, '/fichiers');
    assert.ok(liste.txt.includes('quais.png'), `${compte}: image listed after arrival`);
    assert.ok(liste.txt.includes('tarifs.pdf'), `${compte}: document listed after arrival`);
  }
});

test('E-18 · l\'image insérée dont le fichier manque avertit « fichier « img:quais » inconnu : référence en attente » ; plus rien après l\'arrivée des fichiers', async () => {
  // Fails if a waiting key goes unreported in the batch, or if the warning survives the arrival of the file.
  const m = await monde();
  const l1 = await m.lot();
  const f = await m.imp('PUT', `/fiches/${encodeURIComponent('lieu:quais')}?lot=${l1}`, FICHE);
  const textes: string[] = f.json.avertissements.map((a: Any) => (typeof a === 'string' ? a : JSON.stringify(a)));
  assert.equal(textes.length, 2, f.txt);
  assert.ok(textes.some((t) => t.includes('fichier « img:quais » inconnu : référence en attente')), f.txt);
  await m.fichier('img:quais', 'quais.png', PNG, l1);
  await m.fichier('doc:tarifs', 'tarifs.pdf', PDF, l1);
  await m.clore(l1);
  const l2 = await m.lot();
  const r = await m.imp('PUT', `/fiches/${encodeURIComponent('lieu:quais')}?lot=${l2}`, FICHE);
  assert.equal(r.json.etat, 'inchangee', r.txt);
  assert.deepEqual(r.json.avertissements, []);
  const clos = await m.clore(l2);
  assert.equal(clos.avertissements, 0);
});

test('E-18 · le fichier joint dont le fichier manque avertit aussi « fichier « doc:tarifs » inconnu : référence en attente »', async () => {
  // docs/ecrans.md E-18: « A pending reference warns « fichier « img:quais » inconnu : référence en attente » ».
  // Fails if the wording for a joined file departs from the documented one.
  const m = await monde();
  const l1 = await m.lot();
  const f = await m.imp('PUT', `/fiches/${encodeURIComponent('lieu:quais')}?lot=${l1}`, FICHE);
  assert.ok(JSON.stringify(f.json.avertissements).includes('fichier « doc:tarifs » inconnu : référence en attente'), f.txt);
});

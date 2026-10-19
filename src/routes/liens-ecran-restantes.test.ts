// Tests of kanevas-liens-ecran, server side: « Afficher les N suivants » needs `restantes`, the number of sources that
// follow the page FOR THIS READER (docs/ecrans.md, « Mentionnée dans »). Literal expectations; never a count of hidden sources.
//
// TEST PLAN
//   nominal : 60 readable sources: the sheet says suite=true, restantes=10; the page after 50 says suite=false, restantes=0
//   bords   : exactly 50 sources: suite=false, restantes=0; 51: restantes=1; 120: 70 then 20 (second page of 50)
//   exclusion: 5 more sources hidden from the player (GM-only section) do not count in the player's `restantes`
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { semerBouchon } = await import('../bouchon/depart.js');
const { creerFiche } = await import('../services/fiches.js');
const { ajouterSection, changerAudience } = await import('../services/sections.js');

async function connecter(app: Awaited<ReturnType<typeof buildApp>>, compte: string) {
  const res = await app.inject({ method: 'POST', url: '/connexion-bouchon', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${compte}` });
  return { cookie: `kanevas_session=${res.cookies.find((x) => x.name === 'kanevas_session')!.value}` };
}

async function monde(lisibles: number, caches = 0) {
  const app = await buildApp();
  semerBouchon(app.db);
  const antor = await connecter(app, 'antor');
  const lea = await connecter(app, 'lea');
  const compte = (app.db.prepare("SELECT id FROM comptes WHERE username = 'antor'").get() as { id: number }).id;
  const u = (app.db.prepare("SELECT id FROM univers WHERE nom = 'Lame d''Ébène'").get() as { id: number }).id;
  const cible = creerFiche(app.db, compte, u, { type: 'lieu', titre: 'Cible' });
  const sc = ajouterSection(app.db, compte, u, cible.id, { titre: 'Apparence', contenu: 'x' });
  changerAudience(app.db, compte, u, cible.id, sc.id, { joueursLisent: true });
  const source = (i: number, lisible: boolean) => {
    const f = creerFiche(app.db, compte, u, { type: 'lieu', titre: `Src ${String(i).padStart(3, '0')}` });
    const s = ajouterSection(app.db, compte, u, f.id, { titre: 'Texte', contenu: `cite [[${cible.id}|Cible]]` });
    if (lisible) changerAudience(app.db, compte, u, f.id, s.id, { joueursLisent: true });
  };
  for (let i = 0; i < lisibles; i++) source(i, true);
  for (let i = 0; i < caches; i++) source(500 + i, false);
  const get = (h: Record<string, string>, url: string) => app.inject({ method: 'GET', url, headers: h }).then((r) => r.json());
  const fiche = (h: Record<string, string>) => get(h, `/api/univers/${u}/fiches/${cible.id}`);
  const page = (h: Record<string, string>, apres: number) => get(h, `/api/univers/${u}/fiches/${cible.id}/mentions?apres=${apres}`);
  return { antor, lea, fiche, page };
}

test('60 sources lisibles : la fiche dit restantes=10, la page suivante n’en laisse aucune', async () => {
  const m = await monde(60);
  const f = await m.fiche(m.lea);
  assert.equal(f.mentions.length, 50);
  assert.equal(f.mentionsSuite, true);
  assert.equal(f.mentionsRestantes, 10);
  const p = await m.page(m.lea, 50);
  assert.equal(p.mentions.length, 10);
  assert.equal(p.suite, false);
  assert.equal(p.restantes, 0);
});

test('bords : 50 pile → restantes 0 ; 51 → 1 ; 120 → 70 puis 20', async () => {
  const a = await monde(50);
  const fa = await a.fiche(a.lea);
  assert.deepEqual([fa.mentionsSuite, fa.mentionsRestantes], [false, 0]);
  const b = await monde(51);
  const fb = await b.fiche(b.lea);
  assert.deepEqual([fb.mentionsSuite, fb.mentionsRestantes], [true, 1]);
  const c = await monde(120);
  assert.equal((await c.fiche(c.lea)).mentionsRestantes, 70);
  const p = await c.page(c.lea, 50);
  assert.deepEqual([p.mentions.length, p.suite, p.restantes], [50, true, 20]);
});

test('exclusion : les sources cachées au joueur ne comptent pas dans son restantes (le MJ les compte)', async () => {
  const m = await monde(55, 5);
  assert.equal((await m.fiche(m.lea)).mentionsRestantes, 5);
  assert.equal((await m.fiche(m.antor)).mentionsRestantes, 10);
});

test('aucune source : restantes 0', async () => {
  const m = await monde(0);
  const f = await m.fiche(m.lea);
  assert.deepEqual([f.mentions, f.mentionsSuite, f.mentionsRestantes], [[], false, 0]);
});

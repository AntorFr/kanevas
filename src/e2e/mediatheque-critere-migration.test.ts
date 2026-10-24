// Feature-level check of kanevas-import-mediatheque, from the last sentence of its exit criterion:
// « Les pièces jointes et illustrations du bouchon d'avant la migration s'affichent toujours, une pièce secrète
// réservée au MJ. » (docs/donnees.md: a pièce `secrete`, or one in a section players do not read, becomes « mj »).
// Real server started on a database written BEFORE the media library (src/e2e/fixtures/avant-mediatheque).
//
// TEST PLAN (literal expectations)
//   Port-Sel « Description » (fiche 12, section 13, read by players) carried « ancien-public.pdf » and
//   « ancien-secret.pdf » (secrète), « Secret — MJ seul » (section 4) carried « ancien-mj.pdf »:
//   - Léa sees « ancien-public.pdf » on Port-Sel, downloads it (200); never sees the two others (not in her library, bytes 404)
//   - Antor sees the three; « ancien-secret.pdf » and « ancien-mj.pdf » are « mj », « ancien-public.pdf » is « joueurs »
//   - Port-Sel's illustration (before: columns of the sheet) is still served to Léa, with a non-null `illustration`
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { type Any, attendre, connecte, launch, skipBrowser, startServer, texte } from './harnais.test.js';

const opts = { skip: skipBrowser };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let antor: Any;
let lea: Any;
let dir = '';

before(async () => {
  if (skipBrowser) return;
  dir = mkdtempSync(join(tmpdir(), 'kanevas-avant-'));
  cpSync('src/e2e/fixtures/avant-mediatheque', dir, { recursive: true });
  srv = await startServer({ DB_PATH: join(dir, 'k.sqlite'), KANEVAS_SANS_SEMIS: '' });
  browser = await launch();
  antor = (await connecte(browser, srv.base, 'Antor')).page;
  lea = (await connecte(browser, srv.base, 'Léa')).page;
});
after(async () => {
  if (skipBrowser) return;
  await browser?.close();
  srv?.stop();
  rmSync(dir, { recursive: true, force: true });
});

const get = async (p: Any, url: string): Promise<Any> => (await p.request.get(`/api/univers/1${url}`)).json();

test('après migration, Léa lit la pièce publique de Port-Sel et ne voit ni la secrète ni celle du MJ', opts, async () => {
  const mediatheque = (await get(lea, '/fichiers')).fichiers.map((f: Any) => f.nom);
  assert.ok(mediatheque.includes('ancien-public.pdf'), mediatheque.join());
  assert.ok(!mediatheque.includes('ancien-secret.pdf'));
  assert.ok(!mediatheque.includes('ancien-mj.pdf'));
  const f = (await get(lea, '/fichiers')).fichiers.find((x: Any) => x.nom === 'ancien-public.pdf');
  assert.equal((await lea.request.get(`/api/univers/1/fichiers/${f.id}`)).status(), 200);
  await lea.goto('/univers/1/fiche/12');
  await attendre(lea);
  const t = await texte(lea);
  assert.ok(t.includes('ancien-public.pdf'));
  assert.ok(!t.includes('ancien-secret.pdf'));
  assert.ok(!t.includes('ancien-mj.pdf'));
  await lea.screenshot({ path: '/tmp/scr/mig-lea-portsel.png', fullPage: true });
});

test('après migration, Antor voit les trois pièces ; la secrète et celle de la section MJ seul sont « Réservé au MJ »', opts, async () => {
  const liste = (await get(antor, '/fichiers')).fichiers;
  const vis = (nom: string) => liste.find((x: Any) => x.nom === nom)?.visibilite;
  assert.equal(vis('ancien-public.pdf'), 'joueurs');
  assert.equal(vis('ancien-secret.pdf'), 'mj');
  assert.equal(vis('ancien-mj.pdf'), 'mj');
  await antor.goto('/univers/1/fiche/12');
  await attendre(antor);
  const t = await texte(antor);
  assert.ok(t.includes('ancien-public.pdf') && t.includes('ancien-secret.pdf'));
  await antor.screenshot({ path: '/tmp/scr/mig-antor-portsel.png', fullPage: true });
});

test('après migration, l’illustration de Port-Sel s’affiche toujours, pour Léa aussi', opts, async () => {
  const fiche = await get(lea, '/fiches/12');
  assert.ok(fiche.illustration, 'illustration non nulle');
  const r = await lea.request.get(`/api/univers/1/fichiers/${fiche.illustration.id}?v=${fiche.illustration.jeton}`);
  assert.equal(r.status(), 200);
  assert.ok((await r.body()).length > 0);
  await lea.goto('/univers/1/fiche/12');
  await attendre(lea);
  const ok = await lea.evaluate(async () => {
    const imgs = [...document.querySelectorAll('img')] as HTMLImageElement[];
    return imgs.some((i) => i.complete && i.naturalWidth > 0);
  });
  assert.ok(ok, 'une image chargée est visible sur la fiche');
});

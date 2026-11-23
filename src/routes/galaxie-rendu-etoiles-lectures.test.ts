// Doors of kanevas-carte-rendu-galaxie-systemes-lectures (AD-galaxie-systemes-2, B-117, B-97): the blocks carry
// `[q, r, taille, lettre]` for each drawn star, a defined system carries `classe` / `taille` / `couleur`, and a hidden
// system carries nothing. Read by the routes the map calls, the server being the app in-process.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Any, lire, type Monde, monde, sql } from './monde-lot-cartes.js';
import { classeDeCle } from '../wasm/coeur.js';

const api = (m: Monde, suite = '') => `/api/univers/${m.uid}/outils/swn/galaxie/galaxies/${m.gid}${suite}`;
const LETTRES = new Set(['M', 'K', 'G', 'F', 'A', 'B', 'V']);
const FENETRE = '/blocs?de=-2,-2&a=2,2';

test('blocs nominal : chaque étoile tirée est [q, r, taille dans [0,1], lettre de classe], et le bloc (0,0) est celui du cœur', async () => {
  const m = await monde();
  const r = await lire(m, 'lea', api(m, FENETRE));
  assert.equal(r.status, 200, r.texte);
  const etoiles = (r.json.blocs as Any[]).flatMap((b) => b.generes as Any[]);
  assert.equal(etoiles.length, 17, 'dix-sept étoiles tirées sur la graine d’essai dans cette fenêtre');
  for (const e of etoiles) {
    assert.equal(e.length, 4);
    assert.ok(Number.isInteger(e[0]) && Number.isInteger(e[1]), JSON.stringify(e));
    assert.ok(typeof e[2] === 'number' && e[2] >= 0 && e[2] <= 1, `taille ${e[2]}`);
    assert.ok(LETTRES.has(e[3]), `lettre ${e[3]}`);
  }
  // Values of the core on the seed 'essai-1' (hand-checked against the core's draw): block (0,0) draws (1,3), class G, a very small star.
  const b00 = (r.json.blocs as Any[]).find((b) => b.bx === 0 && b.by === 0);
  assert.equal(b00.generes.length, 1);
  assert.deepEqual([b00.generes[0][0], b00.generes[0][1], b00.generes[0][3]], [1, 3, 'G']);
  assert.ok(Math.abs(b00.generes[0][2] - 0.00175) < 1e-4, `taille ${b00.generes[0][2]}`);
  // A big star: block (2,1) draws (13,8), class G, size 0.771.
  const b21 = (r.json.blocs as Any[]).find((b) => b.bx === 2 && b.by === 1);
  assert.deepEqual([b21.generes[0][0], b21.generes[0][1], b21.generes[0][3]], [13, 8, 'G']);
  assert.ok(Math.abs(b21.generes[0][2] - 0.771) < 1e-3, `taille ${b21.generes[0][2]}`);
});

test('blocs : le second appel, servi par le cache, est identique octet pour octet, pour la joueuse comme pour le MJ', async () => {
  const m = await monde();
  for (const compte of ['lea', 'antor']) {
    const un = await lire(m, compte, api(m, FENETRE));
    const deux = await lire(m, compte, api(m, FENETRE));
    assert.equal(deux.texte, un.texte, compte);
  }
});

test('blocs exclusion : Léa lit le tirage du mode Joueur ; le MJ ne diffère que par la zone privée, étoile par étoile identique (taille, lettre)', async () => {
  const m = await monde();
  const lea = await lire(m, 'lea', api(m, FENETRE));
  const mode = await lire(m, 'antor', api(m, `${FENETRE}&mode=joueur`));
  assert.deepEqual(mode.json.blocs, lea.json.blocs);
  const mj = await lire(m, 'antor', api(m, FENETRE));
  const cle = (e: Any[]) => e.join(',');
  const deLea = new Set((lea.json.blocs as Any[]).flatMap((b) => b.generes.map(cle)));
  const deMj = (mj.json.blocs as Any[]).flatMap((b) => b.generes.map(cle));
  assert.ok(deMj.length > 0 && deMj.every((k) => deLea.has(k)), 'chaque étoile du MJ est celle de Léa, au même chiffre');
  assert.ok(deMj.length < deLea.size, 'la zone privée de densité 0 retire des étoiles au MJ seul (lecture.test.ts)');
});

test('système défini : classe, taille et couleur dans la vue des blocs et dans GET systemes/:cle, la classe absente quand le système n’en a pas', async () => {
  const m = await monde();
  sql(m, "UPDATE swn_systemes SET classe='K', couleur=NULL, taille=0.3 WHERE cle='vael'");
  sql(m, "UPDATE swn_systemes SET classe='B', couleur='#112233' WHERE cle='hesper'");
  const r = await lire(m, 'lea', api(m, FENETRE));
  const parCle = (cle: string) => (r.json.systemes as Any[]).find((s) => s.cle === cle);
  const sel = parCle('port-sel'), vael = parCle('vael'), hesper = parCle('hesper');
  assert.equal(sel.taille, 0.75);
  assert.equal(sel.couleur, '#8b9bf0');
  assert.ok(!('classe' in sel), 'sans classe posée, rien n’est tiré côté serveur');
  assert.equal(vael.classe, 'K'); assert.equal(vael.taille, 0.3); assert.equal(vael.couleur, null);
  assert.equal(hesper.classe, 'B'); assert.equal(hesper.couleur, '#112233');
  for (const [cle, vue] of [['port-sel', sel], ['vael', vael], ['hesper', hesper]] as const) {
    const p = await lire(m, 'lea', api(m, `/systemes/${cle}`));
    assert.equal(p.status, 200, p.texte);
    assert.equal(p.json.taille, vue.taille, cle);
    assert.equal(p.json.couleur, vue.couleur, cle);
    assert.equal(p.json.classe, vue.classe, cle);
  }
  assert.ok(!('classe' in (await lire(m, 'lea', api(m, '/systemes/port-sel'))).json));
});

test('deux systèmes définis sans classe, de clés différentes : le cœur sur ce que l’API rend tire deux classes ou les tailles diffèrent', async () => {
  const m = await monde();
  sql(m, "UPDATE swn_systemes SET taille=0.5 WHERE cle IN ('vael','hesper')");
  const r = await lire(m, 'lea', api(m, FENETRE));
  const [a, b] = ['vael', 'hesper'].map((c) => (r.json.systemes as Any[]).find((s) => s.cle === c));
  assert.ok(a && b && !('classe' in a) && !('classe' in b));
  const ca = await classeDeCle(a.cle, a.taille), cb = await classeDeCle(b.cle, b.taille);
  assert.ok(LETTRES.has(ca) && LETTRES.has(cb));
  assert.ok(ca !== cb || a.taille !== b.taille, `${ca} ${cb}`);
  // Deterministic: the same key and size give the same class.
  assert.equal(await classeDeCle(a.cle, a.taille), ca);
});

test('B-97 exclusion : un système caché ne porte rien pour Léa (ni la classe, ni la taille, ni la couleur, ni l’étoile), GET reste introuvable', async () => {
  const m = await monde();
  sql(m, "UPDATE swn_systemes SET classe='B', taille=0.9, couleur='#abcdef' WHERE cle='station-fantome'");
  const lea = await lire(m, 'lea', api(m, FENETRE));
  assert.ok(!(lea.json.systemes as Any[]).some((s) => s.cle === 'station-fantome'));
  for (const motif of ['station-fantome', 'Station', '#abcdef', '"classe":"B"', '0.9']) assert.ok(!lea.texte.includes(motif), `fuite : ${motif}`);
  assert.ok(!(lea.json.blocs as Any[]).some((b) => b.generes.some(([q, r]: number[]) => q === -4 && r === 2)), 'pas d’étoile à la place');
  const un = await lire(m, 'lea', api(m, '/systemes/station-fantome'));
  const inconnu = await lire(m, 'lea', api(m, '/systemes/nulle-part'));
  assert.equal(un.status, 404);
  assert.equal(un.texte, inconnu.texte);
  const mode = await lire(m, 'antor', api(m, '/systemes/station-fantome?mode=joueur'));
  assert.equal(mode.status, 404);
  // The GM, outside player mode, reads all of it.
  const mj = await lire(m, 'antor', api(m, '/systemes/station-fantome'));
  assert.equal(mj.status, 200, mj.texte);
  assert.equal(mj.json.classe, 'B'); assert.equal(mj.json.taille, 0.9); assert.equal(mj.json.couleur, '#abcdef');
  const vueMj = await lire(m, 'antor', api(m, FENETRE));
  const f = (vueMj.json.systemes as Any[]).find((s) => s.cle === 'station-fantome');
  assert.equal(f.classe, 'B'); assert.equal(f.taille, 0.9);
});

test('B-97 : un système défini masqué après coup quitte la vue de Léa avec ses champs, et revient avec eux', async () => {
  const m = await monde();
  sql(m, "UPDATE swn_systemes SET classe='A' WHERE cle='vael'");
  assert.equal(((await lire(m, 'lea', api(m, FENETRE))).json.systemes as Any[]).find((s) => s.cle === 'vael').classe, 'A');
  sql(m, "UPDATE swn_systemes SET secret=1 WHERE cle='vael'");
  const cache = await lire(m, 'lea', api(m, FENETRE));
  assert.ok(!cache.texte.includes('"classe":"A"') && !cache.texte.includes('vael'));
  assert.equal((await lire(m, 'lea', api(m, '/systemes/vael'))).status, 404);
});

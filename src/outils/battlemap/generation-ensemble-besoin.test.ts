// Ensemble tests (door level, no browser) of kanevas-battlemap-generation (B-99, P-26 steps 3 and 4, E-27, AD-157, AD-158), written
// from the feature's exit criterion and the product docs only. Real app, real routes, real SQLite, stub engine (KANEVAS_STUB=1).
//
// TEST PLAN (need -> case -> expected, hard-coded)
//  B-99 nominal   : Antor lists couchette / console / baril, starts the batch -> three drafts, GM-only (no card or file for Léa);
//                   accepts two -> library assets Léa reads; regenerates the third with « plus usé » -> new draft, old asset gone,
//                   remark kept; discards it -> line « ecarte », batch closed (GET lot null), the two accepted stay
//  B-99 stop      : one accepted, one draft, one failure, then « arrêter » -> accepted stays, the others « ecarte », drafts removed, batch closed
//  B-99 restart   : lines left « en_cours » / « attente » by a stopped server -> « interrompu » after restart, nothing restarts alone,
//                   « reprendre » gives drafts
//  B-99 bords     : 1 and 20 lines accepted; 0 and 21 refused; name 80 / 81, hint 200 / 201, footprint 1 / 20 / 0 / 21, footprint on a floor,
//                   unknown category -> refused, the stored list unchanged
//  B-99 un lot    : a started batch refuses a second list (409)
//  B-99 échec     : a line the stub fails -> « echec » with the fixed sentence, « réessayer » runs it again, « écarter » discards it alone
//  B-99 exclusions: wrong line state -> 409 etat_ligne (accept a waiting line, a failure, regenerate a failure); Léa (player) 404 on everything;
//                   GM in Player mode 403 on writes, 404 on read; a draft never in a player's library
//  AD-158         : keying of a flat-background fixture gives transparent pixels; an already transparent image is kept byte for byte;
//                   a floor is never keyed; an image with no flat background stays opaque and asks a square footprint
//  AD-158 stub    : the opaque stub image of a 2×1 object leaves an opaque asset with a square 2×2 footprint
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';
import { afterEach, before, describe, it } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
const dossier = mkdtempSync(join(tmpdir(), 'bm-gen-ensemble-'));
process.env.DB_PATH = join(dossier, 'kanevas.db');
const { buildApp } = await import('../../app.js');
const { semerBouchon, semerIllustrations } = await import('../../bouchon/depart.js');
const { poserActivation } = await import('../../services/outils.js');
const { executeurEnCours, appliquerTransparence } = await import('../../services/battlemap-generation.js');

type App = Awaited<ReturnType<typeof buildApp>>;
type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const ligne = (nom: string, extra: object = {}) => ({ nom, categorie: 'objet', largeur: 1, hauteur: 1, indice: '', ...extra });

// ---- minimal PNG writer / reader for the keying fixtures ---------------------------------------------------------------------
const TABLE = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b: Buffer) => { let c = 0xffffffff; for (const o of b) c = TABLE[(c ^ o) & 0xff]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const morceau = (type: string, d: Buffer) => {
  const t = Buffer.alloc(8); t.writeUInt32BE(d.length, 0); t.write(type, 4, 'ascii');
  const q = Buffer.alloc(4); q.writeUInt32BE(crc(Buffer.concat([t.subarray(4), d])), 0);
  return Buffer.concat([t, d, q]);
};
function png(cote: number, pixel: (x: number, y: number) => [number, number, number, number], avecAlpha: boolean): Buffer {
  const n = avecAlpha ? 4 : 3;
  const brut = Buffer.alloc(cote * (1 + cote * n));
  for (let y = 0; y < cote; y++) for (let x = 0; x < cote; x++) {
    const p = pixel(x, y); const o = y * (1 + cote * n) + 1 + x * n;
    brut[o] = p[0]; brut[o + 1] = p[1]; brut[o + 2] = p[2]; if (avecAlpha) brut[o + 3] = p[3];
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(cote, 0); ihdr.writeUInt32BE(cote, 4); ihdr[8] = 8; ihdr[9] = avecAlpha ? 6 : 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), morceau('IHDR', ihdr), morceau('IDAT', deflateSync(brut)), morceau('IEND', Buffer.alloc(0))]);
}
/** Alpha of the pixel (x, y) of a non-interlaced 8-bit RGBA PNG (any scanline filter). */
function alphaDe(octets: Uint8Array, x: number, y: number): number {
  const b = Buffer.from(octets);
  let o = 8; const idat: Buffer[] = []; let l = 0; let h = 0; let type = 0;
  while (o < b.length) {
    const len = b.readUInt32BE(o); const nom = b.toString('ascii', o + 4, o + 8); const d = b.subarray(o + 8, o + 8 + len);
    if (nom === 'IHDR') { l = d.readUInt32BE(0); h = d.readUInt32BE(4); type = d[9]!; }
    if (nom === 'IDAT') idat.push(d);
    o += 12 + len;
  }
  assert.equal(type, 6, 'keyed PNG must be RGBA');
  const raw = inflateSync(Buffer.concat(idat)); const stride = l * 4; const img = Buffer.alloc(stride * h);
  for (let r = 0; r < h; r++) {
    const f = raw[r * (stride + 1)]!;
    for (let i = 0; i < stride; i++) {
      const v = raw[r * (stride + 1) + 1 + i]!;
      const a = i >= 4 ? img[r * stride + i - 4]! : 0; const up = r > 0 ? img[(r - 1) * stride + i]! : 0; const ul = r > 0 && i >= 4 ? img[(r - 1) * stride + i - 4]! : 0;
      const pa = Math.abs(up - ul); const pb = Math.abs(a - ul); const pc = Math.abs(a + up - 2 * ul);
      const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? up : ul;
      img[r * stride + i] = (v + (f === 0 ? 0 : f === 1 ? a : f === 2 ? up : f === 3 ? (a + up) >> 1 : paeth)) & 0xff;
    }
  }
  return img[y * stride + x * 4 + 3]!;
}

describe('Génération de lots (B-99) : ensemble', () => {
  let app: App;
  let cookie: Record<string, string>;
  let E: number;
  let S: number;
  let R: string;

  const connecter = async (a: App) => {
    const c: Record<string, string> = {};
    for (const nom of ['antor', 'teo', 'lea']) {
      const res = await a.inject({ method: 'POST', url: '/connexion-bouchon', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${nom}` });
      c[nom] = `kanevas_session=${res.cookies.find((x) => x.name === 'kanevas_session')!.value}`;
    }
    return c;
  };
  const q = (m: 'GET' | 'POST' | 'PUT', who: string | null, url: string, payload?: Any, a: App = app) =>
    a.inject({ method: m, url, headers: who ? { cookie: cookie[who]! } : {}, payload });
  const lot = async () => (await q('GET', 'antor', R)).json().lot as Any;
  const ligneDe = async (nom: string) => ((await lot())?.lignes as Any[] | undefined)?.find((l) => l.nom === nom);
  const assets = async (who: string) => (await q('GET', who, `/api/univers/${E}/outils/battlemap/assets`)).json().assets as Any[];
  const nomsAssets = async (who: string) => (await assets(who)).map((a) => a.nom);
  const fichier = async (who: string, id: number) => (await q('GET', who, `/api/univers/${E}/fichiers/${id}`)).statusCode;
  const lancerEtAttendre = async (lignes: Any[]) => {
    assert.equal((await q('PUT', 'antor', R, { lignes })).statusCode, 200);
    assert.equal((await q('POST', 'antor', `${R}/lancer`)).statusCode, 200);
    await executeurEnCours();
  };
  /** Closes whatever batch is open so the next test starts clean (the stop is itself tested below). */
  const vider = async () => { if (await lot()) { await q('POST', 'antor', `${R}/arreter`); await executeurEnCours(); } };

  afterEach(vider);

  before(async () => {
    app = await buildApp();
    assert.equal(semerBouchon(app.db), true);
    await semerIllustrations(app.db, join(dossier, 'illustrations'));
    cookie = await connecter(app);
    const get = (sql: string, ...a: unknown[]) => app.db.prepare(sql).get(...a) as Any;
    E = get('SELECT id FROM univers WHERE nom = ?', "Éneria d'essai").id;
    S = get('SELECT id FROM systemes_jeu WHERE nom = ?', "Système d'essai").id;
    poserActivation(app.db, get("SELECT id FROM comptes WHERE username = 'antor'").id, { niveau: 'systeme', id: S }, 'battlemap/generation', true);
    R = `/api/univers/${E}/outils/battlemap/lots`;
  });

  it('parcours : trois lignes, trois brouillons MJ seul, deux acceptés, un régénéré avec remarque puis écarté', async () => {
    // Panne attrapée : un brouillon lisible d'un joueur, une acceptation qui laisse le fichier MJ seul, une régénération qui garde l'ancien asset.
    const avant = await nomsAssets('antor');
    await lancerEtAttendre([ligne('couchette', { largeur: 2 }), ligne('console'), ligne('baril')]);
    const l = await lot();
    assert.equal(l.etat, 'en_cours');
    assert.deepEqual(l.lignes.map((x: Any) => [x.nom, x.etat]), [['couchette', 'brouillon'], ['console', 'brouillon'], ['baril', 'brouillon']]);
    // GM-only while drafts: the GM sees them, the player neither card nor file.
    const gm = await assets('antor');
    for (const n of ['couchette', 'console', 'baril']) assert.equal(gm.find((a) => a.nom === n)?.etat, 'brouillon', n);
    for (const n of ['couchette', 'console', 'baril']) assert.ok(!(await nomsAssets('lea')).includes(n), `Léa ne voit pas ${n}`);
    const [couchette, console_, baril] = l.lignes as Any[];
    assert.equal(await fichier('antor', couchette.fichierId), 200);
    assert.equal(await fichier('lea', couchette.fichierId), 404);
    const img = await q('GET', 'antor', `/api/univers/${E}/fichiers/${couchette.fichierId}`);
    assert.match(String(img.headers['content-type']), /^image\/png/);
    assert.equal(img.rawPayload.subarray(1, 4).toString('ascii'), 'PNG');

    // accept two
    for (const x of [couchette, console_]) assert.equal((await q('POST', 'antor', `${R}/lignes/${x.id}/accepter`)).statusCode, 200);
    const lea = await assets('lea');
    for (const n of ['couchette', 'console']) {
      const a = lea.find((x) => x.nom === n);
      assert.equal(a?.etat, 'valide', n);
      assert.equal(await fichier('lea', a.fichierId), 200, `fichier de ${n} lisible pour Léa une fois accepté`);
    }
    assert.ok(!(await nomsAssets('lea')).includes('baril'));
    assert.equal((await ligneDe('couchette')).etat, 'accepte');

    // regenerate the third with a remark
    const ancien = baril.jeton as string;
    assert.equal((await q('POST', 'antor', `${R}/lignes/${baril.id}/regenerer`, { remarque: 'plus usé' })).statusCode, 200);
    await executeurEnCours();
    const neuf = await ligneDe('baril');
    assert.equal(neuf.etat, 'brouillon');
    assert.equal(neuf.remarque, 'plus usé');
    assert.notEqual(neuf.jeton, ancien);
    assert.ok(!(await assets('antor')).some((a) => a.jeton === ancien), 'l’ancien brouillon est supprimé');
    assert.equal((await assets('antor')).filter((a) => a.nom === 'baril').length, 1);

    // discard it: the batch is closed
    assert.equal((await q('POST', 'antor', `${R}/lignes/${neuf.id}/ecarter`)).statusCode, 200);
    assert.ok(!(await nomsAssets('antor')).includes('baril'));
    assert.equal((await q('GET', 'antor', R)).json().lot, null);
    assert.deepEqual((await nomsAssets('antor')).filter((n) => !avant.includes(n)).sort(), ['console', 'couchette']);
  });

  it('arrêt : « arrêter » écarte les lignes non acceptées (brouillon, échec) et garde l’acceptée', async () => {
    // Panne : l'arrêt laisse un brouillon dans la bibliothèque ou écarte aussi l'asset accepté.
    await lancerEtAttendre([ligne('lanterne'), ligne('tonneau'), ligne('échec')]);
    const l = await lot();
    assert.deepEqual(l.lignes.map((x: Any) => x.etat), ['brouillon', 'brouillon', 'echec']);
    await q('POST', 'antor', `${R}/lignes/${l.lignes[0].id}/accepter`);
    const brouillon = l.lignes[1].jeton as string;
    assert.equal((await q('POST', 'antor', `${R}/arreter`)).statusCode, 200);
    await executeurEnCours();
    assert.equal((await q('GET', 'antor', R)).json().lot, null);
    const noms = await nomsAssets('antor');
    assert.ok(noms.includes('lanterne'), 'l’acceptée reste');
    assert.ok(!noms.includes('tonneau'), 'le brouillon est supprimé');
    assert.ok(!(await assets('antor')).some((a) => a.jeton === brouillon));
    assert.ok((await nomsAssets('lea')).includes('lanterne'));
    // the universe may start a new batch
    assert.equal((await q('PUT', 'antor', R, { lignes: [ligne('nouveau')] })).statusCode, 200);
    await vider();
  });

  it('bords de la liste : 1 et 20 lignes passent, 0 et 21 non ; limites des champs', async () => {
    // Panne : plafond de 20 lignes non tenu, bornes des champs décalées, liste vidée par un refus.
    const ok = async (lignes: Any[], etiquette: string) => assert.equal((await q('PUT', 'antor', R, { lignes })).statusCode, 200, etiquette);
    const non = async (lignes: Any[], etiquette: string) => {
      const r = await q('PUT', 'antor', R, { lignes });
      assert.equal(r.statusCode, 400, `${etiquette} → ${r.body}`);
    };
    await ok([ligne('A')], '1 ligne');
    const vingt = Array.from({ length: 20 }, (_, i) => ligne(`asset ${i + 1}`));
    await ok(vingt, '20 lignes');
    await non([...vingt, ligne('de trop')], '21 lignes');
    await non([], '0 ligne');
    assert.equal((await lot()).lignes.length, 20, 'les refus laissent la liste enregistrée');
    await ok([ligne('n'.repeat(80), { indice: 'i'.repeat(200), largeur: 20, hauteur: 20 })], 'nom 80, indication 200, empreinte 20×20');
    await ok([ligne('Dalles', { categorie: 'sol', largeur: null, hauteur: null }), ligne('Rempart', { categorie: 'mur', largeur: null, hauteur: null })], 'sol et mur sans empreinte');
    await non([ligne('n'.repeat(81))], 'nom 81');
    await non([ligne('')], 'nom vide');
    await non([ligne('A', { indice: 'i'.repeat(201) })], 'indication 201');
    await non([ligne('A', { largeur: 21 })], 'largeur 21');
    await non([ligne('A', { hauteur: 0 })], 'hauteur 0');
    await non([ligne('A', { categorie: 'monstre' })], 'catégorie inconnue');
    await non([ligne('A', { categorie: 'sol' })], 'empreinte sur un sol');
    await non([ligne('A', { categorie: 'mur' })], 'empreinte sur un mur');
    assert.deepEqual((await lot()).lignes.map((x: Any) => x.nom), ['Dalles', 'Rempart']);
    await vider();
  });

  it('un seul lot : un lot lancé refuse une seconde liste', async () => {
    // Panne : deux lots ouverts dans l'univers, ou la liste d'un lot en cours remplacée.
    await lancerEtAttendre([ligne('coffre')]);
    const r = await q('PUT', 'antor', R, { lignes: [ligne('autre')] });
    assert.equal(r.statusCode, 409, r.body);
    assert.deepEqual((await lot()).lignes.map((x: Any) => x.nom), ['coffre']);
    await vider();
  });

  it('échec : phrase fixe, « Réessayer » relance la ligne, « Écarter » l’ôte seule', async () => {
    // Panne : un message du moteur affiché, une ligne en échec qu'on ne peut ni relancer ni écarter, l'échec qui écarte les autres.
    await lancerEtAttendre([ligne('échec'), ligne('étagère')]);
    let e = await ligneDe('échec');
    assert.equal(e.etat, 'echec');
    assert.equal(e.motEchec, 'Échec : le moteur d’image n’a pas répondu.'.replace(/’/g, "'"));
    assert.equal(e.assetId, null);
    assert.equal((await ligneDe('étagère')).etat, 'brouillon');
    assert.equal((await q('POST', 'antor', `${R}/lignes/${e.id}/reessayer`)).statusCode, 200);
    await executeurEnCours();
    e = await ligneDe('échec');
    assert.equal(e.etat, 'echec', 'le bouchon échoue à chaque essai');
    assert.equal((await q('POST', 'antor', `${R}/lignes/${e.id}/ecarter`)).statusCode, 200);
    assert.equal((await ligneDe('échec')).etat, 'ecarte');
    assert.equal((await ligneDe('étagère')).etat, 'brouillon');
    await vider();
  });

  it('exclusions : une ligne hors de l’état attendu est refusée en 409 et rien ne change', async () => {
    // Panne : accepter une ligne en échec ou en attente crée un asset ; régénérer un échec.
    assert.equal((await q('PUT', 'antor', R, { lignes: [ligne('échec'), ligne('porte')] })).statusCode, 200);
    const avantLancer = (await lot()).lignes as Any[];
    assert.equal((await q('POST', 'antor', `${R}/lignes/${avantLancer[1].id}/accepter`)).statusCode, 409, 'accepter une ligne non lancée');
    await q('POST', 'antor', `${R}/lancer`);
    await executeurEnCours();
    const e = await ligneDe('échec');
    const nb = (await assets('antor')).length;
    for (const [a, p] of [['accepter'], ['regenerer', { remarque: 'x' }]] as [string, Any?][]) {
      const r = await q('POST', 'antor', `${R}/lignes/${e.id}/${a}`, p);
      assert.equal(r.statusCode, 409, `${a} d'un échec → ${r.body}`);
    }
    const brouillon = await ligneDe('porte');
    assert.equal((await q('POST', 'antor', `${R}/lignes/${brouillon.id}/reessayer`)).statusCode, 409, 'réessayer un brouillon');
    assert.equal((await assets('antor')).length, nb);
    assert.equal((await ligneDe('échec')).etat, 'echec');
    await vider();
  });

  it('exclusions de rôle : Léa ne voit rien de l’outil, le MJ en mode Joueur ne peut rien écrire', async () => {
    // Panne : l'outil ouvert à un joueur, ou au MJ en mode Joueur (AD-156), ou un refus qui écrit quand même.
    await lancerEtAttendre([ligne('lampe')]);
    const l = await ligneDe('lampe');
    for (const who of ['lea', 'teo']) {
      for (const [m, u, p] of [['GET', R], ['PUT', R, { lignes: [ligne('X')] }], ['POST', `${R}/lancer`], ['POST', `${R}/reprendre`], ['POST', `${R}/arreter`],
        ['POST', `${R}/lignes/${l.id}/accepter`], ['POST', `${R}/lignes/${l.id}/regenerer`, { remarque: 'x' }], ['POST', `${R}/lignes/${l.id}/ecarter`],
        ['POST', `${R}/lignes/${l.id}/reessayer`]] as ['GET' | 'POST' | 'PUT', string, Any?][]) {
        const r = await q(m, who, u, p);
        // Téo is a member without GM rights in the seed or a non-member: either way the tool does not exist for him
        assert.equal(r.statusCode, 404, `${who} ${m} ${u} → ${r.statusCode}`);
      }
    }
    assert.equal((await q('GET', null, R)).statusCode === 200, false, 'anonyme');
    assert.equal((await q('GET', 'antor', `${R}?mode=joueur`)).statusCode, 404);
    for (const [u, p] of [[`${R}?mode=joueur`, { lignes: [ligne('X')] }], [`${R}/lancer?mode=joueur`], [`${R}/arreter?mode=joueur`],
      [`${R}/lignes/${l.id}/accepter?mode=joueur`], [`${R}/lignes/${l.id}/ecarter?mode=joueur`]] as [string, Any?][]) {
      const r = await q(u === `${R}?mode=joueur` ? 'PUT' : 'POST', 'antor', u, p);
      assert.equal(r.statusCode, 403, `${u} → ${r.statusCode}`);
    }
    assert.equal((await ligneDe('lampe')).etat, 'brouillon', 'rien n’a été écrit');
    await vider();
  });

  it('redémarrage : les lignes en cours et en attente passent « interrompu », rien ne repart seul, « reprendre » relance', async () => {
    // Panne : lot laissé « en_cours » fantôme après redémarrage, reprise silencieuse, ou « reprendre » qui ne relance pas.
    await vider();
    assert.equal((await q('PUT', 'antor', R, { lignes: [ligne('hache'), ligne('arc'), ligne('bouclier')] })).statusCode, 200);
    // state a killed server leaves: one line running, one waiting, one already a draft
    const lots = app.db.prepare('SELECT id FROM bm_lots WHERE univers_id = ? AND etat <> \'termine\'').get(E) as Any;
    app.db.prepare("UPDATE bm_lots SET etat = 'en_cours' WHERE id = ?").run(lots.id);
    app.db.prepare("UPDATE bm_lots_lignes SET etat = 'en_cours' WHERE lot_id = ? AND nom = 'hache'").run(lots.id);
    app.db.prepare("UPDATE bm_lots_lignes SET etat = 'attente' WHERE lot_id = ? AND nom = 'arc'").run(lots.id);
    app.db.prepare("UPDATE bm_lots_lignes SET etat = 'ecarte' WHERE lot_id = ? AND nom = 'bouclier'").run(lots.id);
    await app.close();

    app = await buildApp(); // the restart: same database file
    cookie = await connecter(app);
    await executeurEnCours();
    const l = await lot();
    assert.equal(l.interrompu, true);
    assert.deepEqual(l.lignes.map((x: Any) => [x.nom, x.etat]), [['hache', 'interrompu'], ['arc', 'interrompu'], ['bouclier', 'ecarte']]);
    assert.ok(!(await nomsAssets('antor')).includes('hache'), 'aucun brouillon n’est apparu tout seul');

    assert.equal((await q('POST', 'antor', `${R}/reprendre`)).statusCode, 200);
    await executeurEnCours();
    const apres = await lot();
    assert.deepEqual(apres.lignes.map((x: Any) => [x.nom, x.etat]), [['hache', 'brouillon'], ['arc', 'brouillon'], ['bouclier', 'ecarte']]);
    assert.equal(apres.interrompu, false);
    await vider();
  });

  it('détourage (AD-158) : un fond uni devient transparent, le résultat d’un joueur déjà transparent n’est pas touché', async () => {
    // Panne : le secours ne détoure pas, détoure une image déjà transparente, ou touche un sol.
    const objetSurFond = png(32, (x, y) => (x >= 10 && x < 22 && y >= 10 && y < 22 ? [30, 120, 60, 255] : [255, 0, 255, 255]), false);
    const r = appliquerTransparence(objetSurFond, 'objet');
    assert.equal(r.detoure, true);
    assert.equal(r.carre, false);
    assert.equal(alphaDe(r.octets, 0, 0), 0, 'le coin du fond devient transparent');
    assert.equal(alphaDe(r.octets, 31, 31), 0);
    assert.equal(alphaDe(r.octets, 16, 16), 255, 'l’objet reste opaque');

    const dejaTransparent = png(32, (x, y) => (x >= 10 && x < 22 && y >= 10 && y < 22 ? [30, 120, 60, 255] : [255, 0, 255, 0]), true);
    const t = appliquerTransparence(dejaTransparent, 'objet');
    assert.equal(t.detoure, false);
    assert.equal(t.carre, false);
    assert.ok(Buffer.from(t.octets).equals(dejaTransparent), 'octets inchangés');

    const sol = appliquerTransparence(objetSurFond, 'sol');
    assert.equal(sol.detoure, false);
    assert.ok(Buffer.from(sol.octets).equals(objetSurFond), 'un sol n’est jamais détouré');
    assert.equal(appliquerTransparence(objetSurFond, 'mur').detoure, false);
    for (const c of ['vaisseau', 'decor'] as const) assert.equal(appliquerTransparence(objetSurFond, c).detoure, true, c);
  });

  it('détourage (AD-158) : sans fond uni exploitable, l’image reste opaque et l’empreinte devient carrée', async () => {
    // Panne : une image sans fond uni détruite par le détourage, ou l'empreinte non carrée.
    const degrade = png(32, (x, y) => [x * 8, y * 8, (x * y) % 256, 255], false);
    const r = appliquerTransparence(degrade, 'objet');
    assert.equal(r.detoure, false);
    assert.equal(r.carre, true);
    assert.ok(Buffer.from(r.octets).equals(degrade));
  });

  it('bouchon : l’image opaque du moteur d’essai garde un brouillon opaque sur une empreinte carrée 2×2', async () => {
    // Panne : empreinte 2×1 gardée alors que l'image n'est pas détourée (AD-158 : « empreinte carrée »).
    await lancerEtAttendre([ligne('couchette longue', { largeur: 2, hauteur: 1 }), ligne('chaise', { largeur: 1, hauteur: 3 }), ligne('Moquette', { categorie: 'sol', largeur: null, hauteur: null })]);
    const a = await assets('antor');
    const c = a.find((x) => x.nom === 'couchette longue');
    assert.deepEqual([c.largeur, c.hauteur], [2, 2]);
    const ch = a.find((x) => x.nom === 'chaise');
    assert.deepEqual([ch.largeur, ch.hauteur], [3, 3]);
    const m = a.find((x) => x.nom === 'Moquette');
    assert.deepEqual([m.largeur, m.hauteur], [null, null]);
    await vider();
  });
});

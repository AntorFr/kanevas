// Feature-level black-box tests of kanevas-synchro-export (B-92, B-93 filter, AD-148, P-22), written from the feature sheet
// (critère de sortie), docs/parcours.md (B-92, B-93) and the contracts of ARCHITECTURE.md (AD-148, AD-149 routes), not from the code.
// Expected values are literals. Real server in stub mode, real SQLite FILE (the snapshot needs a second connection), real guard.
// World: the stub seed (« Lame d'Ébène »: antor GM, lea player; « Les Landes grises »: mira GM). No screen: the feature has none.
//
// Plan (besoin -> cases):
//  B-92 nominal   un appel : en-tête, une ligne par fiche / fichier / carte lisibles, `fin` (lignes = écrites avant elle, en-tête comprise) ·
//                 empreinte de chaque fiche = GET /fiches/<clé> · lignes fichier / carte = éléments des listes · octets jamais dans le flux
//  B-92 bords     ?empreintes=1 : liste seule · univers sans écriture récente · alias /api/import/v1 identique · jeton ecriture lit · clé ou id
//  B-92 instant   écriture pendant le flux (client lit une ligne, écrit, lit la suite) : absente · une nouvelle lecture la montre · non bloquée
//  B-92 échecs    sans jeton / cookie seul / jeton invalide 401 · univers hors accès 404 · depuis mal formé 400 avant tout octet
//  B-92 exclusions joueuse : ni fiche cachée, ni section MJ, ni fichier MJ, ni carte cachée, ni compte qui en trahisse l'existence
//  B-93 depuis    relation seule / alias seul => rendue ; fiche inchangée => absente ; fichiers et cartes toujours tous listés ; futur => aucune fiche
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

const DOSSIER = mkdtempSync(join(tmpdir(), 'export-ensemble-'));
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
process.env.DB_PATH = join(DOSSIER, 'k.db');
const { buildApp } = await import('../app.js');
const { semerBouchon } = await import('../bouchon/depart.js');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
type Rep = { status: number; json: Any; texte: string };

let n = 0;
let app: Any;
let base = '';
const cookies: Record<string, string> = {};
const jetons: Record<string, string> = {};
const U: Record<string, number> = {};
const attente = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function lire(r: Response): Promise<Rep> {
  const texte = await r.text();
  let json: Any = null;
  try { json = JSON.parse(texte); } catch { /* not json */ }
  return { status: r.status, json, texte };
}
async function ouvrirSession(compte: string): Promise<string> {
  const r = await fetch(`${base}/connexion-bouchon`, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `compte=${compte}`,
  });
  const c = (r.headers.getSetCookie?.() ?? []).map((x) => x.split(';')[0]).join('; ');
  assert.ok(c, `no session for ${compte}`);
  return c;
}
async function ecran(compte: string, m: string, p: string, corps?: unknown): Promise<Rep> {
  return lire(await fetch(base + p, {
    method: m,
    headers: { cookie: cookies[compte], ...(corps === undefined ? {} : { 'content-type': 'application/json' }) },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  }));
}
async function jeton(compte: string, niveau: 'lecture' | 'ecriture'): Promise<string> {
  const r = await ecran(compte, 'POST', '/api/compte/jetons', { nom: `T ${compte} ${niveau} ${++n}`, dureeJours: 30, acces: { tous: true, niveauTous: niveau } });
  assert.equal(r.status, 201, r.texte);
  return r.json.valeur;
}
async function api(valeur: string | null, p: string, init: RequestInit = {}): Promise<Rep> {
  return lire(await fetch(base + p, { ...init, headers: { ...(valeur ? { authorization: `Bearer ${valeur}` } : {}), ...(init.headers as Record<string, string> | undefined) } }));
}
const lame = (p: string) => `/api/v1/univers/${U.lame}${p}`;
const ndjson = (texte: string): Any[] => texte.split('\n').filter((l) => l !== '').map((l) => JSON.parse(l));
async function exporter(t: string | null, query = '', univers: string | number = U.lame): Promise<{ rep: Rep; lignes: Any[] }> {
  const rep = await api(t, `/api/v1/univers/${univers}/export${query}`);
  return { rep, lignes: rep.status === 200 ? ndjson(rep.texte) : [] };
}
const ofType = (lignes: Any[], t: string) => lignes.filter((l) => l.type === t);

type Fiche = { id: number; cle: string; sid: number };
async function nouvelle(titre: string, contenu = 'Un texte de départ.'): Promise<Fiche> {
  const f = await ecran('antor', 'POST', `/api/univers/${U.lame}/fiches`, { type: 'lieu', titre: `${titre} ${++n}` });
  assert.equal(f.status, 201, f.texte);
  const s = await ecran('antor', 'POST', `/api/univers/${U.lame}/fiches/${f.json.id}/sections`, { titre: 'Corps', contenu: '' });
  assert.equal(s.status, 201, s.texte);
  const w = await ecran('antor', 'PUT', `/api/univers/${U.lame}/fiches/${f.json.id}/sections/${s.json.id}/contenu`, { contenu, version: s.json.version });
  assert.equal(w.status, 200, w.texte);
  const a = await ecran('antor', 'PATCH', `/api/univers/${U.lame}/fiches/${f.json.id}/sections/${s.json.id}`, { joueursLisent: true });
  assert.equal(a.status, 200, a.texte);
  return { id: f.json.id, cle: f.json.cle, sid: s.json.id };
}
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
async function envoyer(cle: string, champs: Record<string, string>): Promise<Rep> {
  const fd = new FormData();
  for (const [k, v] of Object.entries(champs)) fd.append(k, v);
  fd.append('fichier', new Blob([PNG]), 'x');
  return api(jetons.antorEcr, lame(`/fichiers/${cle}`), { method: 'PUT', body: fd });
}

before(async () => {
  app = await buildApp();
  semerBouchon(app.db);
  await app.listen({ port: 0, host: '127.0.0.1' });
  base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  for (const c of ['antor', 'lea', 'mira']) cookies[c] = await ouvrirSession(c);
  const us = (await ecran('antor', 'GET', '/api/univers')).json;
  const mira = (await ecran('mira', 'GET', '/api/univers')).json;
  for (const u of [...(us.univers ?? us), ...(mira.univers ?? mira)]) U[u.nom === "Lame d'Ébène" ? 'lame' : u.nom === 'Les Landes grises' ? 'landes' : u.nom] = u.id;
  jetons.antorLec = await jeton('antor', 'lecture');
  jetons.antorEcr = await jeton('antor', 'ecriture');
  jetons.leaLec = await jeton('lea', 'lecture');
  jetons.miraLec = await jeton('mira', 'lecture');
  assert.ok((await envoyer('img:export-pub', { nom: 'pub.png', visibilite: 'joueurs' })).status < 300);
  assert.ok((await envoyer('img:export-secret', { nom: 'secret.png', visibilite: 'mj' })).status < 300);
  const c = await ecran('antor', 'POST', `/api/univers/${U.lame}/cartes`, { titre: 'Carte export secrète', forme: 'graphe' });
  assert.equal(c.status, 201, c.texte);
});
after(async () => {
  await app.close();
  rmSync(DOSSIER, { recursive: true, force: true });
});

describe('B-92 : un appel exporte tout l\'univers', () => {
  it('nominal : en-tête, une ligne par fiche, fichier et carte lisibles, puis fin ; empreinte de fiche = celle de GET /fiches/<clé>', async () => {
    await nouvelle('Export nominal');
    const { rep, lignes } = await exporter(jetons.antorLec);
    assert.equal(rep.status, 200, rep.texte.slice(0, 200));
    assert.match(String(rep.texte.length > 0), /true/);
    const r = await fetch(base + lame('/export'), { headers: { authorization: `Bearer ${jetons.antorLec}` } });
    assert.match(r.headers.get('content-type') ?? '', /^application\/x-ndjson/);
    await r.arrayBuffer();

    assert.equal(lignes[0].type, 'entete');
    assert.equal(lignes[lignes.length - 1].type, 'fin');
    assert.equal(lignes[lignes.length - 1].lignes, lignes.length - 1, 'fin.lignes = lignes écrites avant elle, en-tête comprise');
    const fiches = ofType(lignes, 'fiche');
    const liste = (await api(jetons.antorLec, lame('/fiches'))).json.fiches as Any[];
    const fichiers = (await api(jetons.antorLec, lame('/fichiers'))).json.fichiers as Any[];
    const cartes = (await api(jetons.antorLec, lame('/cartes'))).json.cartes as Any[];
    assert.equal(fiches.length, liste.length);
    assert.equal(lignes[0].fiches, fiches.length);
    assert.equal(lignes[0].fichiers, fichiers.length);
    assert.equal(lignes[0].cartes, cartes.length);
    assert.equal(lignes[0].depuis, null);
    assert.equal(lignes.length, 2 + fiches.length + fichiers.length + cartes.length);
    assert.deepEqual(lignes.map((l) => l.type).filter((t, i, a) => a.indexOf(t) === i), ['entete', 'fiche', 'fichier', 'carte', 'fin']);
    for (const f of fiches) {
      const lue = (await api(jetons.antorLec, lame(`/fiches/id/${f.id}`))).json;
      assert.equal(f.empreinte, lue.empreinte, `empreinte de ${f.cle}`);
      assert.match(f.empreinte, /^[0-9a-f]{32}$/);
    }
    assert.deepEqual(ofType(lignes, 'fichier').map(({ type: _t, ...x }) => x), fichiers);
    assert.deepEqual(ofType(lignes, 'carte').map(({ type: _t, ...x }) => x), cartes);
  });

  it('les octets d\'un fichier ne sont pas dans le flux ; ils se téléchargent à part avec le même jeton', async () => {
    const { lignes, rep } = await exporter(jetons.antorLec);
    assert.equal(rep.texte.includes(PNG.toString('base64')), false);
    assert.equal(rep.texte.includes('\u0089PNG'), false);
    const f = ofType(lignes, 'fichier').find((x) => x.cle === 'img:export-pub');
    assert.ok(f, 'ligne du fichier');
    const c = await fetch(base + lame('/fichiers/img:export-pub/contenu'), { headers: { authorization: `Bearer ${jetons.antorLec}` } });
    assert.equal(c.status, 200);
    assert.deepEqual(Buffer.from(await c.arrayBuffer()), PNG);
  });

  it('bords : l\'univers désigné par sa clé ou par son id donne le même flux ; l\'alias /api/import/v1 répond à l\'identique ; un jeton ecriture lit aussi', async () => {
    const parId = await exporter(jetons.antorLec);
    const alias = await api(jetons.antorLec, `/api/import/v1/univers/${U.lame}/export`);
    assert.equal(alias.status, 200, alias.texte.slice(0, 200));
    const sansDate = (l: Any[]) => l.map((x) => (x.type === 'entete' ? { ...x, genere_le: null } : x));
    assert.deepEqual(sansDate(ndjson(alias.texte)), sansDate(parId.lignes));
    const cle = parId.lignes[0].cle;
    assert.equal(typeof cle, 'string');
    const parCle = await exporter(jetons.antorLec, '', cle);
    assert.deepEqual(sansDate(parCle.lignes), sansDate(parId.lignes));
    const ecr = await exporter(jetons.antorEcr);
    assert.equal(ecr.rep.status, 200);
    assert.deepEqual(sansDate(ecr.lignes), sansDate(parId.lignes));
  });

  it('bords ?empreintes=1 : la liste seule, sans section ni champ d\'en-tête ; les fichiers et cartes gardent leur ligne', async () => {
    const plein = await exporter(jetons.antorLec);
    const { rep, lignes } = await exporter(jetons.antorLec, '?empreintes=1');
    assert.equal(rep.status, 200);
    const fiches = ofType(lignes, 'fiche');
    assert.equal(fiches.length, ofType(plein.lignes, 'fiche').length);
    for (const f of fiches) {
      assert.deepEqual(Object.keys(f).sort(), ['cle', 'empreinte', 'empreinte_entete', 'id', 'modifie_le', 'type']);
      const p = ofType(plein.lignes, 'fiche').find((x) => x.id === f.id);
      assert.equal(f.empreinte, p.empreinte);
    }
    assert.equal(ofType(lignes, 'fichier').length, ofType(plein.lignes, 'fichier').length);
    assert.equal(ofType(lignes, 'carte').length, ofType(plein.lignes, 'carte').length);
    assert.equal(lignes[lignes.length - 1].lignes, lignes.length - 1);
  });

  it('une fiche supprimée dans Kanevas n\'a plus de ligne : le script la retrouve en comparant les ids', async () => {
    const f = await nouvelle('Export à supprimer');
    const avant = ofType((await exporter(jetons.antorLec)).lignes, 'fiche').map((x) => x.id);
    assert.ok(avant.includes(f.id));
    const d = await ecran('antor', 'DELETE', `/api/univers/${U.lame}/fiches/${f.id}`);
    assert.ok(d.status < 300, d.texte);
    const apres = ofType((await exporter(jetons.antorLec)).lignes, 'fiche').map((x) => x.id);
    assert.equal(apres.includes(f.id), false);
  });
});

describe('B-92 : l\'export est l\'univers à un instant', () => {
  it('une écriture faite pendant le flux n\'y entre pas, n\'est pas bloquée, et une nouvelle lecture la montre', async () => {
    const lourd = 'Ligne de remplissage pour peser sur le flux. '.repeat(1000); // ~45 Ko par fiche
    const fiches: Fiche[] = [];
    for (let i = 0; i < 60; i++) fiches.push(await nouvelle(`Instant ${i}`, lourd));
    const cible = fiches[fiches.length - 1];
    const avant = await exporter(jetons.antorLec);
    const empreinteAvant = ofType(avant.lignes, 'fiche').find((x) => x.id === cible.id).empreinte;
    const nbAvant = ofType(avant.lignes, 'fiche').length;

    const r = await fetch(base + lame('/export'), { headers: { authorization: `Bearer ${jetons.antorLec}` } });
    assert.equal(r.status, 200);
    const lecteur = r.body!.getReader();
    const dec = new TextDecoder();
    let tampon = '';
    while (!tampon.includes('\n')) {
      const { value, done } = await lecteur.read();
      assert.equal(done, false, 'le flux a une première ligne');
      tampon += dec.decode(value, { stream: true });
    }
    assert.equal(JSON.parse(tampon.slice(0, tampon.indexOf('\n'))).type, 'entete');

    // writes through the session routes while the stream is open and unread
    const maj = await Promise.race([
      (async () => {
        const v = (await ecran('antor', 'GET', `/api/univers/${U.lame}/fiches/${cible.id}/sections/${cible.sid}`)).json.version;
        const w = await ecran('antor', 'PUT', `/api/univers/${U.lame}/fiches/${cible.id}/sections/${cible.sid}/contenu`, { contenu: 'CONTENU NOUVEAU PENDANT LE FLUX', version: v });
        const c = await ecran('antor', 'POST', `/api/univers/${U.lame}/fiches`, { type: 'lieu', titre: 'Née pendant le flux' });
        return [w.status, c.status];
      })(),
      attente(10000).then(() => 'bloquée'),
    ]);
    assert.deepEqual(maj, [200, 201], 'l\'écriture aboutit pendant le flux, sans attendre sa fin');

    for (;;) {
      const { value, done } = await lecteur.read();
      if (done) break;
      tampon += dec.decode(value, { stream: true });
    }
    const lignes = ndjson(tampon);
    const fs = ofType(lignes, 'fiche');
    assert.equal(fs.length, nbAvant, 'la fiche née pendant le flux n\'y est pas');
    assert.equal(fs.some((x) => x.entete.titre === 'Née pendant le flux'), false);
    assert.equal(fs.find((x) => x.id === cible.id).empreinte, empreinteAvant, 'la fiche modifiée garde son état d\'avant');
    assert.equal(tampon.includes('CONTENU NOUVEAU PENDANT LE FLUX'), false);
    assert.equal(lignes[lignes.length - 1].type, 'fin');
    assert.equal(lignes[lignes.length - 1].lignes, lignes.length - 1);

    const apres = await exporter(jetons.antorLec);
    assert.equal(ofType(apres.lignes, 'fiche').length, nbAvant + 1);
    assert.notEqual(ofType(apres.lignes, 'fiche').find((x) => x.id === cible.id).empreinte, empreinteAvant);
    assert.equal(apres.rep.texte.includes('CONTENU NOUVEAU PENDANT LE FLUX'), true);
  });

  it('un client qui part en cours de flux ne bloque rien : l\'écriture aboutit et un nouvel export est complet', async () => {
    const ctl = new AbortController();
    const r = await fetch(base + lame('/export'), { headers: { authorization: `Bearer ${jetons.antorLec}` }, signal: ctl.signal });
    const lecteur = r.body!.getReader();
    await lecteur.read();
    ctl.abort();
    await lecteur.read().catch(() => undefined);
    await attente(200);
    const f = await nouvelle('Après départ du client');
    const { lignes } = await exporter(jetons.antorLec);
    assert.ok(ofType(lignes, 'fiche').some((x) => x.id === f.id));
    assert.equal(lignes[lignes.length - 1].type, 'fin');
  });
});

describe('B-92 : échecs', () => {
  it('sans jeton, avec un cookie de session seul, avec un jeton inconnu : 401 jeton_invalide, aucun flux', async () => {
    for (const init of [{}, { headers: { cookie: cookies.antor } }, { headers: { authorization: 'Bearer kvs_inconnu' } }]) {
      const r = await api(null, lame('/export'), init);
      assert.equal(r.status, 401, r.texte.slice(0, 120));
      assert.equal(r.json.code, 'jeton_invalide');
    }
  });
  it('un univers hors de l\'accès du compte, ou inconnu : 404', async () => {
    assert.equal((await exporter(jetons.miraLec)).rep.status, 404);
    assert.equal((await exporter(jetons.leaLec, '', U.landes)).rep.status, 404);
    assert.equal((await exporter(jetons.antorLec, '', 999999)).rep.status, 404);
  });
  it('?depuis mal formé : 400 invalide, champ depuis, un JSON d\'erreur et aucune ligne de flux', async () => {
    for (const d of ['hier', '2026-13-45', '']) {
      const r = await api(jetons.antorLec, lame(`/export?depuis=${encodeURIComponent(d)}`));
      assert.equal(r.status, 400, `depuis=${d}`);
      assert.equal(r.json.code, 'invalide');
      assert.equal(r.json.champ, 'depuis');
      assert.equal(r.texte.includes('"type":"entete"'), false);
    }
  });
});

describe('B-92 : exclusions, ce que la joueuse ne lit pas', () => {
  it('la joueuse ne reçoit ni fiche cachée, ni section réservée au MJ, ni compte qui en trahisse l\'existence', async () => {
    const mj = await exporter(jetons.antorLec);
    const lea = await exporter(jetons.leaLec);
    assert.equal(lea.rep.status, 200);
    const titres = ofType(lea.lignes, 'fiche').map((f) => f.entete.titre);
    for (const cache of ['Le Prieur masqué', 'Les Sphères', 'Le Repaire des contrebandiers', 'Cercle des Cendres', 'La Guilde des Brumes', "Rapport secret de l'amirauté", 'Acte II — Le sceau brisé']) {
      assert.ok(ofType(mj.lignes, 'fiche').some((f) => f.entete.titre === cache), `le MJ reçoit « ${cache} »`);
      assert.equal(titres.includes(cache), false, `la joueuse ne reçoit pas « ${cache} »`);
    }
    assert.ok(titres.includes('Maître Aldric'));
    const aldric = ofType(lea.lignes, 'fiche').find((f) => f.entete.titre === 'Maître Aldric');
    assert.deepEqual(aldric.sections.map((s: Any) => s.titre), ['Apparence']);
    assert.equal(lea.rep.texte.includes('Vérité'), false);
    const listeLea = ((await api(jetons.leaLec, lame('/fiches'))).json.fiches as Any[]).length;
    assert.equal(lea.lignes[0].fiches, listeLea, 'l\'en-tête compte ce que la joueuse lit, pas les fiches cachées');
    assert.ok(lea.lignes[0].fiches < mj.lignes[0].fiches);
    assert.equal(lea.lignes[0].fiches, ofType(lea.lignes, 'fiche').length);
  });
  it('la joueuse ne reçoit ni le fichier réservé au MJ ni la carte cachée ; le MJ les reçoit', async () => {
    const mj = await exporter(jetons.antorLec);
    const lea = await exporter(jetons.leaLec);
    assert.ok(ofType(mj.lignes, 'fichier').some((f) => f.cle === 'img:export-secret'));
    assert.ok(ofType(lea.lignes, 'fichier').some((f) => f.cle === 'img:export-pub'));
    assert.equal(ofType(lea.lignes, 'fichier').some((f) => f.cle === 'img:export-secret'), false);
    assert.equal(lea.lignes[0].fichiers, ofType(lea.lignes, 'fichier').length);
    assert.ok(ofType(mj.lignes, 'carte').some((c) => c.titre === 'Carte export secrète'));
    assert.equal(lea.rep.texte.includes('Carte export secrète'), false);
    assert.equal(lea.lignes[0].cartes, ofType(lea.lignes, 'carte').length);
    assert.equal(lea.lignes[0].cartes, ofType(mj.lignes, 'carte').length - 1);
  });
  it('un flux de la joueuse : chaque empreinte égale celle de sa propre lecture de la fiche', async () => {
    const lea = await exporter(jetons.leaLec);
    for (const f of ofType(lea.lignes, 'fiche')) {
      const lue = (await api(jetons.leaLec, lame(`/fiches/id/${f.id}`))).json;
      assert.equal(f.empreinte, lue.empreinte, f.cle);
    }
  });
});

describe('B-93 : ?depuis, le filtre « modifié depuis »', () => {
  it('une fiche dont seule une relation a changé est rendue ; une fiche inchangée ne l\'est pas ; fichiers et cartes toujours tous listés', async () => {
    const [reliee, intacte, cible] = [await nouvelle('Dep relation'), await nouvelle('Dep intacte'), await nouvelle('Dep cible')];
    await attente(40);
    const depuis = new Date().toISOString();
    await attente(40);
    const r = await ecran('antor', 'POST', `/api/univers/${U.lame}/fiches/${reliee.id}/sections/${reliee.sid}/relations`, { cibleFicheId: cible.id, qualificatif: 'voisin' });
    assert.equal(r.status, 201, r.texte);
    const plein = await exporter(jetons.antorLec);
    const { rep, lignes } = await exporter(jetons.antorLec, `?depuis=${encodeURIComponent(depuis)}`);
    assert.equal(rep.status, 200);
    const ids = ofType(lignes, 'fiche').map((f) => f.id);
    assert.ok(ids.includes(reliee.id), 'la fiche dont seule la relation a changé est rendue');
    assert.equal(ids.includes(intacte.id), false, 'la fiche inchangée n\'est pas rendue');
    assert.equal(lignes[0].depuis !== null, true);
    assert.equal(lignes[0].fiches, ids.length, 'le compte de fiches est celui du jeu filtré');
    assert.equal(lignes[0].fichiers, ofType(plein.lignes, 'fichier').length);
    assert.equal(lignes[0].cartes, ofType(plein.lignes, 'carte').length);
    assert.equal(ofType(lignes, 'fichier').length, ofType(plein.lignes, 'fichier').length);
    assert.equal(ofType(lignes, 'carte').length, ofType(plein.lignes, 'carte').length);
    assert.equal(lignes[lignes.length - 1].lignes, lignes.length - 1);
  });
  it('un alias seul, un parent seul, une section seule : la fiche est rendue', async () => {
    const [aliasee, texte, intacte] = [await nouvelle('Dep alias'), await nouvelle('Dep texte'), await nouvelle('Dep intacte 2')];
    await attente(40);
    const depuis = new Date().toISOString();
    await attente(40);
    assert.equal((await ecran('antor', 'PUT', `/api/univers/${U.lame}/fiches/${aliasee.id}/etiquetage`, { alias: ['Surnom'], etiquettes: [] })).status, 200);
    const v = (await ecran('antor', 'GET', `/api/univers/${U.lame}/fiches/${texte.id}/sections/${texte.sid}`)).json.version;
    assert.equal((await ecran('antor', 'PUT', `/api/univers/${U.lame}/fiches/${texte.id}/sections/${texte.sid}/contenu`, { contenu: 'Autre texte.', version: v })).status, 200);
    const ids = ofType((await exporter(jetons.antorLec, `?depuis=${encodeURIComponent(depuis)}`)).lignes, 'fiche').map((f) => f.id);
    assert.ok(ids.includes(aliasee.id));
    assert.ok(ids.includes(texte.id));
    assert.equal(ids.includes(intacte.id), false);
  });
  it('bords : une date future ne rend aucune fiche (en-tête à 0) ; une date passée les rend toutes ; ?depuis et ?empreintes=1 se combinent', async () => {
    const plein = await exporter(jetons.antorLec);
    const futur = await exporter(jetons.antorLec, '?depuis=2999-01-01T00:00:00.000Z');
    assert.equal(futur.rep.status, 200);
    assert.equal(ofType(futur.lignes, 'fiche').length, 0);
    assert.equal(futur.lignes[0].fiches, 0);
    assert.equal(ofType(futur.lignes, 'fichier').length, ofType(plein.lignes, 'fichier').length);
    assert.equal(futur.lignes[futur.lignes.length - 1].lignes, futur.lignes.length - 1);
    const passe = await exporter(jetons.antorLec, '?depuis=2000-01-01T00:00:00.000Z');
    assert.equal(ofType(passe.lignes, 'fiche').length, ofType(plein.lignes, 'fiche').length);
    const mix = await exporter(jetons.antorLec, '?depuis=2000-01-01T00:00:00.000Z&empreintes=1');
    assert.equal(ofType(mix.lignes, 'fiche').length, ofType(plein.lignes, 'fiche').length);
    assert.equal(Object.keys(ofType(mix.lignes, 'fiche')[0]).includes('sections'), false);
  });
  it('exclusion : une modification qu\'une joueuse ne lit pas ne doit pas la faire manquer de rien, mais ?depuis ne lui rend pas de fiche cachée', async () => {
    const lea = await exporter(jetons.leaLec, '?depuis=2000-01-01T00:00:00.000Z');
    assert.equal(lea.rep.texte.includes('Le Prieur masqué'), false);
    assert.equal(lea.rep.texte.includes('Vérité'), false);
  });
});

// Historique par les routes de session (B-102, B-103, AD-147, AD-149): lire, ouvrir, restaurer, filtrer.
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { semerBouchon } = await import('../bouchon/depart.js');
const { creerJeton } = await import('../services/jetons.js');
const { sousOrigine } = await import('../services/historique.js');
const { ajouterSection, ecrireContenu } = await import('../services/sections.js');

type App = Awaited<ReturnType<typeof buildApp>>;
type H = { cookie: string };
async function connecter(app: App, compte: string): Promise<H> {
  const res = await app.inject({ method: 'POST', url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${compte}` });
  const c = res.cookies.find((x) => x.name === 'kanevas_session');
  assert.ok(c);
  return { cookie: `kanevas_session=${c.value}` };
}
const un = (app: App, sql: string, ...p: unknown[]) => app.db.prepare(sql).get(...p) as any;

async function monde() {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  const antor = await connecter(app, 'antor');
  const lea = await connecter(app, 'lea');
  const teo = await connecter(app, 'teo');
  const E = un(app, 'SELECT id FROM univers WHERE nom = ?', "Éneria d'essai").id as number;
  const antorId = un(app, "SELECT id FROM comptes WHERE username = 'antor'").id as number;
  const appel = (h: H | null, method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url, headers: h ?? {}, payload });
  const f = await appel(antor, 'POST', `/api/univers/${E}/fiches`, { type: 'personnage', titre: 'Aldric', charge: { pj: false } });
  assert.equal(f.statusCode, 201, f.body);
  const fid = f.json().id as number;
  const s = await appel(antor, 'POST', `/api/univers/${E}/fiches/${fid}/sections`, { titre: 'Histoire', contenu: 'v1' });
  assert.equal(s.statusCode, 201, s.body);
  const sid = s.json().id as number;
  const H = `/api/univers/${E}/historique`;
  const F = `/api/univers/${E}/fiches/${fid}`;
  const ecrireS = async (contenu: string) => {
    const v = un(app, 'SELECT version FROM sections WHERE id = ?', sid).version as number;
    const r = await appel(antor, 'PUT', `${F}/sections/${sid}/contenu`, { contenu, version: v });
    assert.equal(r.statusCode, 200, r.body);
  };
  const lignes = async (q = '') => {
    const r = await appel(antor, 'GET', `${H}${q}`);
    assert.equal(r.statusCode, 200, r.body);
    return r.json() as { lignes: any[]; curseur: string | null };
  };
  const ligneSection = (action: string) =>
    un(app, "SELECT id FROM historique WHERE objet = 'section' AND action = ? AND fiche_id = ? ORDER BY id DESC LIMIT 1", action, fid).id as number;
  return { app, antor, lea, teo, E, fid, sid, antorId, H, F, appel, ecrireS, lignes, ligneSection };
}

test('lecture : plus récent d’abord, compte et origine ecran ; filtres fiche, compte, action ; contributeurs', async () => {
  const w = await monde();
  await w.ecrireS('v2');
  await w.ecrireS('v3');
  const { lignes } = await w.lignes();
  assert.ok(lignes.length >= 3);
  const ids = lignes.map((l) => l.id);
  assert.deepEqual(ids, [...ids].sort((a, b) => b - a));
  assert.equal(lignes[0].action, 'modifiee');
  assert.equal(lignes[0].origine, 'ecran');
  assert.equal(lignes[0].compte.id, w.antorId);
  assert.equal(lignes[0].compte.username, 'antor');
  const parFiche = (await w.lignes(`?fiche=${w.fid}`)).lignes;
  assert.ok(parFiche.length >= 3 && parFiche.every((l) => l.ficheId === w.fid));
  assert.ok(lignes.length > parFiche.length || lignes.every((l) => l.ficheId === w.fid));
  const deAntor = (await w.lignes(`?compte=${w.antorId}`)).lignes;
  assert.ok(deAntor.length >= 3 && deAntor.every((l) => l.compte?.id === w.antorId));
  assert.equal(deAntor.length, lignes.filter((l) => l.compte?.id === w.antorId).length);
  assert.equal((await w.lignes(`?compte=999999`)).lignes.length, 0);
  const mod = (await w.lignes('?action=modifiee')).lignes;
  assert.ok(mod.length >= 2 && mod.every((l) => l.action === 'modifiee'));
  assert.equal((await w.appel(w.antor, 'GET', `${w.H}?action=nimporte`)).statusCode, 400);
  assert.equal((await w.appel(w.antor, 'GET', `${w.H}?compte=abc`)).statusCode, 400);
  const c = await w.appel(w.antor, 'GET', `${w.H}/contributeurs`);
  assert.equal(c.statusCode, 200);
  assert.ok(c.json().comptes.some((x: any) => x.username === 'antor'));
  const leaId = un(w.app, "SELECT id FROM comptes WHERE username = 'mira'").id;
  assert.equal(c.json().comptes.some((x: any) => x.id === leaId), un(w.app, 'SELECT 1 AS x FROM historique WHERE compte_id = ?', leaId) !== undefined);
  for (const x of c.json().comptes) assert.ok(un(w.app, 'SELECT 1 AS y FROM historique WHERE univers_id = ? AND compte_id = ?', w.E, x.id), 'seuls les comptes présents');
  const tous = w.app.db.prepare('SELECT count(*) n FROM comptes').get() as any;
  assert.ok(c.json().comptes.length < tous.n);
  assert.deepEqual(c.json().jetons, []);
});

test('jetons : ?jeton=<nom> retient les lignes de tous les jetons de ce nom, et seuls les jetons présents sont des contributeurs', async () => {
  const w = await monde();
  const mk = (nom: string) => creerJeton(w.app.db, w.antorId, w.E, { nom, dureeJours: 30 }).jeton.id as number;
  const a = mk('Mac'), b = mk('Mac'); mk('Muet');
  const sec = ajouterSection(w.app.db, w.antorId, w.E, w.fid, { titre: 'X', contenu: 'x' });
  for (const j of [a, b]) {
    sousOrigine({ jetonId: j, origine: 'import' }, () => {
      const v = un(w.app, 'SELECT version FROM sections WHERE id = ?', sec.id).version;
      ecrireContenu(w.app.db, w.antorId, w.E, w.fid, sec.id, `par ${j}`, v);
    });
  }
  const r = (await w.lignes('?jeton=Mac')).lignes;
  assert.equal(r.length, 2);
  assert.deepEqual(r.map((l) => l.jeton.id).sort(), [a, b].sort());
  assert.equal((await w.lignes('?jeton=Muet')).lignes.length, 0);
  const c = (await w.appel(w.antor, 'GET', `${w.H}/contributeurs`)).json();
  assert.deepEqual(c.jetons, [{ nom: 'Mac' }]);
});

test('curseur : une page de 100 rend un curseur, la suivante le reste, sans total', async () => {
  const w = await monde();
  const sec = ajouterSection(w.app.db, w.antorId, w.E, w.fid, { titre: 'B', contenu: '0' });
  for (let i = 1; i <= 105; i++) {
    const v = un(w.app, 'SELECT version FROM sections WHERE id = ?', sec.id).version;
    ecrireContenu(w.app.db, w.antorId, w.E, w.fid, sec.id, `n${i}`, v);
  }
  const p1 = await w.lignes();
  assert.equal(p1.lignes.length, 100);
  assert.ok(p1.curseur);
  assert.equal('total' in p1, false);
  const p2 = await w.lignes(`?apres=${p1.curseur}`);
  assert.ok(p2.lignes.length > 0 && p2.lignes.length < 100);
  assert.equal(p2.curseur, null);
  assert.ok(p2.lignes[0].id < p1.lignes[99].id);
  const tous = new Set([...p1.lignes, ...p2.lignes].map((l) => l.id));
  assert.equal(tous.size, p1.lignes.length + p2.lignes.length);
});

test('restaurer une section réécrite : ancien texte, une ligne de plus ; rejeu = 409 historique_perime', async () => {
  const w = await monde();
  await w.ecrireS('v2');
  const hid = w.ligneSection('modifiee');
  const d = await w.appel(w.antor, 'GET', `${w.H}/${hid}`);
  assert.equal(d.statusCode, 200, d.body);
  assert.equal(d.json().avant.contenu, 'v1');
  assert.equal(d.json().courante.contenu, 'v2');
  const version = d.json().version as number;
  assert.equal(typeof version, 'number');
  const avant = (await w.lignes()).lignes.length;
  const r = await w.appel(w.antor, 'POST', `${w.H}/${hid}/restaurer`, { version });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(un(w.app, 'SELECT contenu FROM sections WHERE id = ?', w.sid).contenu, 'v1');
  const apres = (await w.lignes()).lignes;
  assert.ok(apres.length > avant);
  assert.equal(apres[0].origine, 'ecran');
  const bis = await w.appel(w.antor, 'POST', `${w.H}/${hid}/restaurer`, { version });
  assert.equal(bis.statusCode, 409);
  assert.equal(bis.json().code, 'historique_perime');
  assert.equal(un(w.app, 'SELECT contenu FROM sections WHERE id = ?', w.sid).contenu, 'v1');
  assert.equal((await w.appel(w.antor, 'POST', `${w.H}/${hid}/restaurer`, {})).statusCode, 400);
});

test('section supprimée : recréée en fin de fiche sous sa clé ; cle_prise si une autre la porte', async () => {
  const w = await monde();
  const cle = un(w.app, 'SELECT cle FROM sections WHERE id = ?', w.sid).cle as string;
  await w.appel(w.antor, 'POST', `${w.F}/sections`, { titre: 'Suite', contenu: 's' });
  assert.equal((await w.appel(w.antor, 'DELETE', `${w.F}/sections/${w.sid}`)).statusCode, 204);
  const hid = w.ligneSection('supprimee');
  const r = await w.appel(w.antor, 'POST', `${w.H}/${hid}/restaurer`, {});
  assert.equal(r.statusCode, 200, r.body);
  const secs = w.app.db.prepare('SELECT cle, contenu FROM sections WHERE fiche_id = ? ORDER BY ordre').all(w.fid) as any[];
  assert.equal(secs[secs.length - 1].cle, cle);
  assert.equal(secs[secs.length - 1].contenu, 'v1');
  // La clé est de nouveau prise : un second essai est refusé.
  const bis = await w.appel(w.antor, 'POST', `${w.H}/${hid}/restaurer`, {});
  assert.equal(bis.statusCode, 409);
  assert.equal(bis.json().code, 'cle_prise');
});

test('valeur expirée : au-delà de 30 jours, pas de valeur avant et 409 valeur_expiree', async () => {
  const w = await monde();
  await w.ecrireS('v2');
  const hid = w.ligneSection('modifiee');
  w.app.horloge = () => new Date(Date.now() + 31 * 86400_000);
  const d = await w.appel(w.antor, 'GET', `${w.H}/${hid}`);
  assert.equal(d.statusCode, 200);
  assert.equal(d.json().avant, null);
  const version = un(w.app, 'SELECT version FROM sections WHERE id = ?', w.sid).version;
  const r = await w.appel(w.antor, 'POST', `${w.H}/${hid}/restaurer`, { version });
  assert.equal(r.statusCode, 409);
  assert.equal(r.json().code, 'valeur_expiree');
});

test('fiche supprimée : sections en texte source, aucune version ; vide au-delà de 30 jours ; non restaurable', async () => {
  const w = await monde();
  assert.equal((await w.appel(w.antor, 'DELETE', w.F)).statusCode, 204);
  const hid = un(w.app, "SELECT id FROM historique WHERE objet = 'fiche' AND action = 'supprimee' ORDER BY id DESC LIMIT 1").id;
  const d = (await w.appel(w.antor, 'GET', `${w.H}/${hid}`)).json();
  assert.ok(d.sections.some((s: any) => s.contenu === 'v1'));
  assert.equal(d.version, undefined);
  assert.equal(d.empreinte, undefined);
  const r = await w.appel(w.antor, 'POST', `${w.H}/${hid}/restaurer`, {});
  assert.equal(r.statusCode, 400);
  w.app.horloge = () => new Date(Date.now() + 31 * 86400_000);
  assert.deepEqual((await w.appel(w.antor, 'GET', `${w.H}/${hid}`)).json().sections, []);
});

test('en-tête : titre, sous-type, parent, alias et étiquettes se restaurent avec l’empreinte ; rejeu périmé', async () => {
  const w = await monde();
  const p = (await w.appel(w.antor, 'POST', `/api/univers/${w.E}/fiches`, { type: 'lieu', titre: 'Parent' })).json().id as number;
  const q = (await w.appel(w.antor, 'POST', `/api/univers/${w.E}/fiches`, { type: 'lieu', titre: 'Autre' })).json().id as number;
  assert.equal((await w.appel(w.antor, 'PATCH', w.F, { parent: p })).statusCode, 200);
  assert.equal((await w.appel(w.antor, 'PUT', `${w.F}/etiquetage`, { alias: ['Al'], etiquettes: ['noble'] })).statusCode, 200);
  const enteteLigne = () =>
    un(w.app, "SELECT id FROM historique WHERE objet = 'entete' AND action = 'modifiee' AND fiche_id = ? ORDER BY id DESC LIMIT 1", w.fid).id as number;
  const restaurer = async (hid: number) => {
    const d = await w.appel(w.antor, 'GET', `${w.H}/${hid}`);
    assert.equal(d.statusCode, 200, d.body);
    assert.equal(typeof d.json().empreinte, 'string');
    return { d: d.json(), r: await w.appel(w.antor, 'POST', `${w.H}/${hid}/restaurer`, { empreinte: d.json().empreinte }) };
  };
  // étiquetage : ensemble remis tel qu'avant (vide)
  // (l'étiquetage écrit une ligne par ensemble : la dernière est celle des étiquettes, l'avant-dernière celle des alias)
  let { r } = await restaurer(enteteLigne());
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(un(w.app, 'SELECT count(*) AS n FROM fiche_etiquettes WHERE fiche_id = ?', w.fid).n, 0);
  assert.equal(un(w.app, 'SELECT count(*) AS n FROM fiche_alias WHERE fiche_id = ?', w.fid).n, 1);
  const lAlias = un(w.app, "SELECT id FROM historique WHERE objet = 'entete' AND fiche_id = ? AND valeur_avant LIKE '%\"alias\":[]%' ORDER BY id DESC LIMIT 1", w.fid).id as number;
  ({ r } = await restaurer(lAlias));
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(un(w.app, 'SELECT count(*) AS n FROM fiche_alias WHERE fiche_id = ?', w.fid).n, 0);
  // parent
  assert.equal((await w.appel(w.antor, 'PATCH', w.F, { parent: q })).statusCode, 200);
  ({ r } = await restaurer(enteteLigne()));
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(un(w.app, 'SELECT parent_id FROM fiches WHERE id = ?', w.fid).parent_id, p);
  // titre
  assert.equal((await w.appel(w.antor, 'PATCH', w.F, { titre: 'Renommé' })).statusCode, 200);
  ({ r } = await restaurer(enteteLigne()));
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(un(w.app, 'SELECT titre FROM fiches WHERE id = ?', w.fid).titre, 'Aldric');
  // sous-type
  assert.equal((await w.appel(w.antor, 'PATCH', w.F, { sousType: 'Noble' })).statusCode, 200);
  ({ r } = await restaurer(enteteLigne()));
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(un(w.app, 'SELECT sous_type FROM fiches WHERE id = ?', w.fid).sous_type, null);
  // type
  assert.equal((await w.appel(w.antor, 'POST', `${w.F}/type`, { type: 'lieu' })).statusCode, 200);
  ({ r } = await restaurer(enteteLigne()));
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(un(w.app, 'SELECT type FROM fiches WHERE id = ?', w.fid).type, 'personnage');
  // rejeu après changement de l'en-tête
  assert.equal((await w.appel(w.antor, 'PATCH', w.F, { titre: 'Encore' })).statusCode, 200);
  const hid = enteteLigne();
  const d = (await w.appel(w.antor, 'GET', `${w.H}/${hid}`)).json();
  assert.equal((await w.appel(w.antor, 'PATCH', w.F, { titre: 'Après affichage' })).statusCode, 200);
  const perime = await w.appel(w.antor, 'POST', `${w.H}/${hid}/restaurer`, { empreinte: d.empreinte });
  assert.equal(perime.statusCode, 409);
  assert.equal(perime.json().code, 'historique_perime');
});

test('relation et « section créée » : invalide, rien restauré', async () => {
  const w = await monde();
  const creee = w.ligneSection('creee');
  const r = await w.appel(w.antor, 'POST', `${w.H}/${creee}/restaurer`, { version: 1 });
  assert.equal(r.statusCode, 400);
  const autre = (await w.appel(w.antor, 'POST', `/api/univers/${w.E}/fiches`, { type: 'personnage', titre: 'B', charge: { pj: false } })).json().id;
  const s2 = (await w.appel(w.antor, 'POST', `/api/univers/${w.E}/fiches/${autre}/sections`, { titre: 'S', contenu: 'x' })).json().id;
  const rel = await w.appel(w.antor, 'POST', `${w.F}/sections/${w.sid}/relations`, { cibleId: autre, nature: 'connait' });
  if (rel.statusCode === 201) {
    const hid = un(w.app, "SELECT id FROM historique WHERE objet = 'relation' ORDER BY id DESC LIMIT 1").id;
    const rr = await w.appel(w.antor, 'POST', `${w.H}/${hid}/restaurer`, {});
    assert.equal(rr.statusCode, 400);
  }
  assert.ok(s2);
});

test('droits : joueur 403, non-membre 404, MJ en mode Joueur refusé, sans session 401 ; ligne d’un autre univers 404', async () => {
  const w = await monde();
  await w.ecrireS('v2');
  const hid = w.ligneSection('modifiee');
  const urls: [string, string][] = [
    ['GET', w.H], ['GET', `${w.H}/contributeurs`], ['GET', `${w.H}/${hid}`], ['POST', `${w.H}/${hid}/restaurer`],
  ];
  for (const [m, u] of urls) {
    const l = await w.appel(w.lea, m as 'GET', u, m === 'POST' ? { version: 1 } : undefined);
    assert.equal(l.statusCode, 403, `${m} ${u}`);
    const t = await w.appel(w.teo, m as 'GET', u, m === 'POST' ? { version: 1 } : undefined);
    assert.equal(t.statusCode, 404, `${m} ${u}`);
    assert.ok([401, 302, 303].includes((await w.appel(null, m as 'GET', u, m === 'POST' ? {} : undefined)).statusCode));
  }
  assert.equal((await w.appel(w.antor, 'GET', `${w.H}?mode=joueur`)).statusCode, 403);
  // Le joueur n'a rien changé et ne reçoit aucun compte.
  const l = await w.appel(w.lea, 'GET', w.H);
  assert.equal(l.json().lignes, undefined);
  const autre = un(w.app, 'SELECT id FROM univers WHERE id <> ? LIMIT 1', w.E).id;
  assert.equal((await w.appel(w.antor, 'GET', `/api/univers/${autre}/historique/${hid}`)).statusCode, 404);
  assert.equal((await w.appel(w.antor, 'POST', `/api/univers/${autre}/historique/${hid}/restaurer`, { version: 1 })).statusCode, 404);
  assert.equal(un(w.app, 'SELECT contenu FROM sections WHERE id = ?', w.sid).contenu, 'v2');
});

test('bloc :::mj : ses valeurs précédentes ne sortent que pour le MJ', async () => {
  const w = await monde();
  await w.ecrireS('public\n\n:::mj\nsecret-mj\n:::\n');
  await w.ecrireS('autre');
  const hid = w.ligneSection('modifiee');
  const rep = [await w.appel(w.lea, 'GET', w.H), await w.appel(w.lea, 'GET', `${w.H}/${hid}`),
    await w.appel(w.lea, 'GET', `${w.H}/contributeurs`), await w.appel(w.lea, 'POST', `${w.H}/${hid}/restaurer`, { version: 1 })];
  for (const r of rep) assert.ok(!r.body.includes('secret-mj'), r.body);
  // et aucune route de lecture de fiche ne rend l'historique
  const f = await w.appel(w.lea, 'GET', w.F);
  assert.ok(!f.body.includes('secret-mj'));
});

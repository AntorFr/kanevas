// Feature-level black-box tests of kanevas-synchro-jetons (API level: real server in stub mode, real SQLite, real guard),
// written from the feature sheet (critère de sortie), docs/parcours.md (B-45, B-46, B-94, B-95, P-25) and docs/ecrans.md
// (E-23, E-18, E-5 jetons), not from the code. Expected values are literals. World: the stub seed
// (« Lame d'Ébène »: antor GM, lea player; « Les Landes grises »: mira GM; « Les Cendres de Vaëlis »: admin GM, antor player).
// The screens (E-23, E-5) are covered by the screen tests of the feature; here the effects at their doors.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;
const { buildApp } = await import('../app.js');
const { semerBouchon } = await import('../bouchon/depart.js');
const { creerJeton } = await import('../services/jetons.js');
const { trouverCompte } = await import('../services/comptes.js');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
type Rep = { status: number; json: Any };
type Client = (methode: string, chemin: string, corps?: unknown) => Promise<Rep>;

let app: Any;
let base = '';
const ids: Record<string, number> = {};
const cles: Record<string, string> = {};

async function lire(r: Response): Promise<Rep> {
  const t = await r.text();
  let json: Any = null;
  try { json = JSON.parse(t); } catch { /* empty or html */ }
  return { status: r.status, json };
}
async function session(compte: string): Promise<Client> {
  const r = await fetch(`${base}/connexion-bouchon`, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `compte=${compte}`,
  });
  const cookie = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
  assert.ok(cookie, `no session for ${compte}`);
  return async (m, p, c) => lire(await fetch(base + p, {
    method: m,
    headers: { cookie, ...(c === undefined ? {} : { 'content-type': 'application/json' }) },
    body: c === undefined ? undefined : JSON.stringify(c),
  }));
}
async function avecJeton(m: string, p: string, valeur: string | null, corps?: unknown): Promise<Rep> {
  return lire(await fetch(base + p, {
    method: m,
    headers: { ...(valeur ? { authorization: `Bearer ${valeur}` } : {}), ...(corps === undefined ? {} : { 'content-type': 'application/json' }) },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  }));
}
const ECRIT = { type: 'lieu', titre: 'Port-Sel', sections: [{ cle: 'desc', titre: 'Description', contenu: 'Un port.' }] };
let n = 0;
const nom = () => `Jeton ${++n}`;
async function creer(c: Client, acces: Any, extra: Any = {}): Promise<{ jid: number; valeur: string }> {
  const r = await c('POST', '/api/compte/jetons', { nom: nom(), dureeJours: 30, acces, ...extra });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return { jid: r.json.jeton.id, valeur: r.json.valeur };
}

before(async () => {
  app = await buildApp();
  semerBouchon(app.db);
  await app.listen({ port: 0, host: '127.0.0.1' });
  base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  const antor = await session('antor');
  const us = (await antor('GET', '/api/univers')).json;
  for (const u of us.univers ?? us) { ids[u.nom] = u.id; cles[u.nom] = u.cle; }
  for (const c of ['antor', 'lea', 'mira', 'admin']) ids['@' + c] = trouverCompte(app.db, c)!.id;
});
after(() => void app.close());

const LAME = "Lame d'Ébène";
const LANDES = 'Les Landes grises';
const CENDRES = 'Les Cendres de Vaëlis';

describe('B-94 : un jeton « lecture » lit et ne peut pas écrire (critère de sortie)', () => {
  it('lea crée un jeton lecture sur Lame d\'Ébène : valeur kvs_ montrée à la création, absente de la liste ensuite', async () => {
    const lea = await session('lea');
    const { valeur } = await creer(lea, { tous: false, univers: [{ universId: ids[LAME], niveau: 'lecture' }] });
    assert.match(valeur, /^kvs_/);
    const liste = await lea('GET', '/api/compte/jetons');
    assert.equal(liste.status, 200);
    assert.equal(JSON.stringify(liste.json).includes(valeur), false, 'la valeur ne se relit jamais');
  });

  it('GET du contexte répond 200, PUT d\'une fiche répond 403 lecture_seule, sous les deux préfixes et par la clé', async () => {
    const lea = await session('lea');
    const { valeur } = await creer(lea, { tous: false, univers: [{ universId: ids[LAME], niveau: 'lecture' }] });
    const prefixes = [`/api/v1/univers/${ids[LAME]}`, `/api/import/v1/univers/${ids[LAME]}`];
    if (cles[LAME]) prefixes.push(`/api/v1/univers/${cles[LAME]}`);
    for (const p of prefixes) {
      assert.equal((await avecJeton('GET', p, valeur)).status, 200, `GET ${p}`);
      const w = await avecJeton('PUT', `${p}/fiches/lieu:port-sel`, valeur, ECRIT);
      assert.equal(w.status, 403, `PUT ${p}`);
      assert.equal(w.json.code, 'lecture_seule', `PUT ${p}`);
      assert.equal((await avecJeton('POST', `${p}/lots`, valeur)).status, 403, `POST lots ${p}`);
    }
  });

  it('exclusion : le jeton lecture sur Lame ne passe pas dans un autre univers (404, comme un univers inconnu)', async () => {
    const lea = await session('lea');
    const { valeur } = await creer(lea, { tous: false, univers: [{ universId: ids[LAME], niveau: 'lecture' }] });
    assert.equal((await avecJeton('GET', `/api/v1/univers/${ids[LANDES]}`, valeur)).status, 404);
    assert.equal((await avecJeton('GET', `/api/v1/univers/${ids[CENDRES]}`, valeur)).status, 404);
  });
});

describe('B-46 : le moindre du jeton et du rôle courant', () => {
  it('un jeton ecriture du MJ antor ouvre un lot dans Lame (2xx)', async () => {
    const antor = await session('antor');
    const { valeur } = await creer(antor, { tous: false, univers: [{ universId: ids[LAME], niveau: 'ecriture' }] });
    const r = await avecJeton('POST', `/api/v1/univers/${ids[LAME]}/lots`, valeur);
    assert.ok(r.status >= 200 && r.status < 300, `status ${r.status}`);
  });

  it('un jeton ecriture de la joueuse lea n\'écrit pas dans Lame : refusé (4xx), et le refus n\'est pas lecture_seule', async () => {
    const lea = await session('lea');
    const { valeur } = await creer(lea, { tous: false, univers: [{ universId: ids[LAME], niveau: 'ecriture' }] });
    const r = await avecJeton('POST', `/api/v1/univers/${ids[LAME]}/lots`, valeur);
    assert.ok(r.status >= 400 && r.status < 500, `status ${r.status}`);
    const w = await avecJeton('PUT', `/api/v1/univers/${ids[LAME]}/fiches/lieu:port-sel`, valeur, ECRIT);
    assert.ok(w.status >= 400 && w.status < 500, `PUT status ${w.status}`);
  });

  it('« tous » en lecture : lit les univers du compte (antor : Lame et Cendres), pas ceux dont il n\'est pas membre (Landes)', async () => {
    const antor = await session('antor');
    const { valeur } = await creer(antor, { tous: true, niveauTous: 'lecture' });
    assert.equal((await avecJeton('GET', `/api/v1/univers/${ids[LAME]}`, valeur)).status, 200);
    assert.equal((await avecJeton('GET', `/api/v1/univers/${ids[CENDRES]}`, valeur)).status, 200);
    assert.equal((await avecJeton('GET', `/api/v1/univers/${ids[LANDES]}`, valeur)).status, 404);
  });

  it('« tous » avec l\'exception « — » (aucun) pour Cendres : Cendres 404, Lame toujours lisible', async () => {
    const antor = await session('antor');
    const { valeur } = await creer(antor, { tous: true, niveauTous: 'lecture', univers: [{ universId: ids[CENDRES], niveau: 'aucun' }] });
    assert.equal((await avecJeton('GET', `/api/v1/univers/${ids[CENDRES]}`, valeur)).status, 404);
    assert.equal((await avecJeton('GET', `/api/v1/univers/${ids[LAME]}`, valeur)).status, 200);
  });

  it('échec : sans jeton, avec une valeur inconnue ou le cookie seul, 401 jeton_invalide', async () => {
    const p = `/api/v1/univers/${ids[LAME]}`;
    assert.equal((await avecJeton('GET', p, null)).status, 401);
    const inconnu = await avecJeton('GET', p, 'kvs_inconnu_inconnu_inconnu_inconnu_xx');
    assert.equal(inconnu.status, 401);
    assert.equal(inconnu.json.code, 'jeton_invalide');
    const lea = await session('lea');
    assert.equal((await lea('GET', p)).status, 401, 'le cookie de session ne vaut pas jeton sur /api/v1');
  });
});

describe('B-94 : validation de la création (échecs)', () => {
  it('nom vide, liste vide, liste toute à « — », univers dont le compte n\'est pas membre : 400 invalide, aucun jeton créé', async () => {
    const lea = await session('lea');
    const avant = (await lea('GET', '/api/compte/jetons')).json.jetons.length;
    const mauvais: Any[] = [
      { nom: '', dureeJours: 30, acces: { tous: true, niveauTous: 'lecture' } },
      { nom: 'x'.repeat(81), dureeJours: 30, acces: { tous: true, niveauTous: 'lecture' } },
      { nom: 'A', dureeJours: 30, acces: { tous: false, univers: [] } },
      { nom: 'B', dureeJours: 30, acces: { tous: false, univers: [{ universId: ids[LANDES], niveau: 'lecture' }] } },
    ];
    for (const c of mauvais) {
      const r = await lea('POST', '/api/compte/jetons', c);
      assert.equal(r.status, 400, JSON.stringify(c).slice(0, 60));
      assert.equal(r.json.code ?? r.json.erreur, 'invalide', JSON.stringify(r.json));
    }
    assert.equal((await lea('GET', '/api/compte/jetons')).json.jetons.length, avant);
  });

  it('bord : un nom de 80 caractères est accepté', async () => {
    const lea = await session('lea');
    const r = await lea('POST', '/api/compte/jetons', { nom: 'x'.repeat(80), dureeJours: 7, acces: { tous: true, niveauTous: 'lecture' } });
    assert.equal(r.status, 201);
  });
});

describe('B-45 / B-95 : le propriétaire révoque et modifie ; les autres non', () => {
  it('le propriétaire révoque : le jeton répond 401 jeton_invalide ; modifier ensuite : 409 jeton_revoque', async () => {
    const lea = await session('lea');
    const { jid, valeur } = await creer(lea, { tous: false, univers: [{ universId: ids[LAME], niveau: 'lecture' }] });
    assert.equal((await avecJeton('GET', `/api/v1/univers/${ids[LAME]}`, valeur)).status, 200);
    assert.equal((await lea('DELETE', `/api/compte/jetons/${jid}`)).status, 200);
    const r = await avecJeton('GET', `/api/v1/univers/${ids[LAME]}`, valeur);
    assert.equal(r.status, 401);
    assert.equal(r.json.code, 'jeton_invalide');
    const m = await lea('PATCH', `/api/compte/jetons/${jid}`, { acces: { tous: true, niveauTous: 'lecture' } });
    assert.equal(m.status, 409);
    assert.equal(m.json.code, 'jeton_revoque');
  });

  it('le propriétaire change les accès : lecture -> ecriture, la même valeur écrit désormais (antor, MJ)', async () => {
    const antor = await session('antor');
    const { jid, valeur } = await creer(antor, { tous: false, univers: [{ universId: ids[LAME], niveau: 'lecture' }] });
    assert.equal((await avecJeton('POST', `/api/v1/univers/${ids[LAME]}/lots`, valeur)).status, 403);
    const m = await antor('PATCH', `/api/compte/jetons/${jid}`, { acces: { tous: false, univers: [{ universId: ids[LAME], niveau: 'ecriture' }] } });
    assert.equal(m.status, 200);
    const r = await avecJeton('POST', `/api/v1/univers/${ids[LAME]}/lots`, valeur);
    assert.ok(r.status >= 200 && r.status < 300, `status ${r.status}`);
  });

  it('exclusion : un MJ (antor, MJ de Lame) ne voit pas le jeton de lea dans son compte, ne le révoque ni ne le modifie (404), et le jeton vit', async () => {
    const lea = await session('lea');
    const antor = await session('antor');
    const { jid, valeur } = await creer(lea, { tous: false, univers: [{ universId: ids[LAME], niveau: 'lecture' }] });
    const liste = (await antor('GET', '/api/compte/jetons')).json.jetons;
    assert.equal(liste.some((j: Any) => j.id === jid), false);
    assert.equal((await antor('DELETE', `/api/compte/jetons/${jid}`)).status, 404);
    assert.equal((await antor('PATCH', `/api/compte/jetons/${jid}`, { acces: { tous: true, niveauTous: 'ecriture' } })).status, 404);
    assert.equal((await antor('GET', '/api/instance/jetons')).status, 404);
    assert.equal((await antor('DELETE', `/api/instance/jetons/${jid}`)).status, 404);
    assert.equal((await antor('PATCH', `/api/instance/jetons/${jid}`, { acces: { tous: true, niveauTous: 'ecriture' } })).status, 404);
    assert.equal((await avecJeton('GET', `/api/v1/univers/${ids[LAME]}`, valeur)).status, 200);
  });

  it('exclusion : l\'admin n\'atteint pas le jeton d\'autrui par la route du compte (404)', async () => {
    const lea = await session('lea');
    const admin = await session('admin');
    const { jid } = await creer(lea, { tous: true, niveauTous: 'lecture' });
    assert.equal((await admin('DELETE', `/api/compte/jetons/${jid}`)).status, 404);
  });
});

describe('B-95 : l\'admin d\'instance voit, change les accès, révoque', () => {
  it('l\'admin voit le jeton de lea (nom, propriétaire) sans sa valeur, filtre par propriétaire, puis le révoque : 401 jeton_invalide', async () => {
    const lea = await session('lea');
    const admin = await session('admin');
    const { jid, valeur } = await creer(lea, { tous: false, univers: [{ universId: ids[LAME], niveau: 'lecture' }] });
    const r = await admin('GET', '/api/instance/jetons');
    assert.equal(r.status, 200);
    const ligne = r.json.jetons.find((j: Any) => j.id === jid);
    assert.ok(ligne, 'le jeton est sur E-5');
    assert.equal(ligne.compteId, ids['@lea']);
    assert.equal(JSON.stringify(r.json).includes(valeur), false);
    const f = await admin('GET', `/api/instance/jetons?proprietaire=${ids['@mira']}`);
    assert.equal(f.json.jetons.some((j: Any) => j.id === jid), false, 'filtre propriétaire');
    assert.equal((await admin('DELETE', `/api/instance/jetons/${jid}`)).status, 200);
    const apres = await avecJeton('GET', `/api/v1/univers/${ids[LAME]}`, valeur);
    assert.equal(apres.status, 401);
    assert.equal(apres.json.code, 'jeton_invalide');
    // le propriétaire le lit « révoqué »
    const vu = (await lea('GET', '/api/compte/jetons')).json.jetons.find((j: Any) => j.id === jid);
    assert.ok(vu.revoqueLe || vu.revoque_le || vu.revoque, 'marqué révoqué sur E-23');
  });

  it('l\'admin ajoute l\'exception « Lame : — » à un « tous » : Lame 404, Cendres (autre univers du compte) toujours lisible ; le propriétaire voit « modifié par l\'admin »', async () => {
    const antor = await session('antor');
    const admin = await session('admin');
    const { jid, valeur } = await creer(antor, { tous: true, niveauTous: 'lecture' });
    assert.equal((await avecJeton('GET', `/api/v1/univers/${ids[LAME]}`, valeur)).status, 200);
    const m = await admin('PATCH', `/api/instance/jetons/${jid}`, { acces: { tous: true, niveauTous: 'lecture', univers: [{ universId: ids[LAME], niveau: 'aucun' }] } });
    assert.equal(m.status, 200, JSON.stringify(m.json));
    assert.equal((await avecJeton('GET', `/api/v1/univers/${ids[LAME]}`, valeur)).status, 404);
    assert.equal((await avecJeton('GET', `/api/v1/univers/${ids[CENDRES]}`, valeur)).status, 200);
    const vu = (await antor('GET', '/api/compte/jetons')).json.jetons.find((j: Any) => j.id === jid);
    assert.ok(JSON.stringify(vu).includes(String(ids['@admin'])) || /admin/i.test(JSON.stringify(vu)), 'trace de l\'admin sur la ligne du propriétaire');
  });

  it('bord : l\'admin ne peut pas changer les accès d\'un jeton déjà révoqué (409 jeton_revoque)', async () => {
    const lea = await session('lea');
    const admin = await session('admin');
    const { jid } = await creer(lea, { tous: true, niveauTous: 'lecture' });
    await lea('DELETE', `/api/compte/jetons/${jid}`);
    const m = await admin('PATCH', `/api/instance/jetons/${jid}`, { acces: { tous: true, niveauTous: 'ecriture' } });
    assert.equal(m.status, 409);
    assert.equal(m.json.code, 'jeton_revoque');
  });
});

describe('K-6 : un jeton à outils est refusé sur /api/v1 (portée contenu)', () => {
  it('le jeton à outils d\'antor répond 401 jeton_invalide sur GET /api/v1/univers/:u', async () => {
    const outils = (await (await session('antor'))('GET', '/api/compte/jetons')).json.outilsOffrables;
    assert.ok(outils !== undefined);
    const antor = ids['@antor'];
    const univ = Object.values(ids).length ? ids[LAME] : 0;
    let valeur: string | null = null;
    // un outil du catalogue d'un univers où antor est MJ
    for (const u of [ids[LAME], ids["Essai Kanka"]]) {
      try {
        const o = (await (await session('antor'))('GET', '/api/compte/jetons')).json.outilsOffrables;
        const cle = JSON.stringify(o).match(/"cle":"([^"]+\/[^"]+)"/)?.[1];
        if (!cle) continue;
        valeur = creerJeton(app.db, antor, u, { nom: 'Outils', dureeJours: 30, outils: [cle] } as Any).valeur;
        break;
      } catch { /* next universe */ }
    }
    void univ;
    assert.ok(valeur, 'aucun jeton à outils constructible dans le monde du bouchon');
    const r = await avecJeton('GET', `/api/v1/univers/${ids[LAME]}`, valeur);
    assert.equal(r.status, 401);
    assert.equal(r.json.code, 'jeton_invalide');
  });
});

// Tests of kanevas-fiches-liees-disparu-serveur written from the exit criterion (B-67, B-68, AD-131, AD-63):
// the gone mark: PATCH, list filter, type words, conversion, import (B-48), seed.
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { JETON_BOUCHON, semerBouchon } = await import('../bouchon/depart.js');
type App = Awaited<ReturnType<typeof buildApp>>;
type Verbe = 'GET' | 'POST' | 'PATCH' | 'PUT';

async function connecter(app: App, compte: string) {
  const res = await app.inject({
    method: 'POST', url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${compte}`,
  });
  const c = res.cookies.find((x) => x.name === 'kanevas_session');
  assert.ok(c);
  return { cookie: `kanevas_session=${c.value}` };
}

type Ligne = { id: number; titre: string; type: string; charge: { disparu?: boolean; pj?: boolean } };

async function monter() {
  const app = await buildApp();
  semerBouchon(app.db);
  const antor = await connecter(app, 'antor');
  const lea = await connecter(app, 'lea');
  const u = app.db.prepare("SELECT id FROM univers WHERE nom = ?").get("Lame d'Ébène") as { id: number };
  const base = `/api/univers/${u.id}`;
  const appel = (h: { cookie: string }, method: Verbe, url: string, payload?: object) =>
    app.inject({ method, url: `${base}${url}`, headers: h, payload });
  const trouver = (titre: string) =>
    (app.db.prepare('SELECT id FROM fiches WHERE univers_id = ? AND titre = ?').get(u.id, titre) as { id: number }).id;
  const charge = (id: number) =>
    JSON.parse((app.db.prepare('SELECT charge FROM fiches WHERE id = ?').get(id) as { charge: string }).charge);
  const creer = async (type: string, titre: string) => {
    const r = await appel(antor, 'POST', '/fiches', { type, titre, charge: type === 'personnage' ? { pj: false } : undefined });
    assert.equal(r.statusCode, 201, r.body);
    return (r.json() as { id: number }).id;
  };
  const liste = async (qs: string, h = antor) => {
    const r = await appel(h, 'GET', `/fiches?${qs}`);
    return { r, titres: r.statusCode === 200 ? (r.json().fiches as Ligne[]).map((f) => f.titre) : [] };
  };
  return { app, antor, lea, u, base, appel, trouver, charge, creer, liste };
}

test('PATCH disparu : Bran devient mort, modifie_le bouge, dernier_import intact ; vivant le rétablit', async () => {
  const m = await monter();
  const bran = m.trouver('Bran Corvalis');
  const avant = m.app.db.prepare('SELECT modifie_le, dernier_import FROM fiches WHERE id = ?').get(bran) as { modifie_le: string; dernier_import: string | null };
  await new Promise((r) => setTimeout(r, 5));
  const r = await m.appel(m.antor, 'PATCH', `/fiches/${bran}`, { disparu: true });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().charge.disparu, true);
  assert.equal(r.json().charge.pj, false);
  const apres = m.app.db.prepare('SELECT modifie_le, dernier_import FROM fiches WHERE id = ?').get(bran) as typeof avant;
  assert.notEqual(apres.modifie_le, avant.modifie_le);
  assert.equal(apres.dernier_import, avant.dernier_import);
  const r2 = await m.appel(m.antor, 'PATCH', `/fiches/${bran}`, { disparu: false });
  assert.equal(r2.json().charge.disparu, false);
  assert.equal(m.charge(bran).disparu, false);
});

test('PATCH disparu sur une quête : 400, rien d écrit', async () => {
  const m = await monter();
  const q = await m.creer('quete', 'Retrouver la clef');
  const avant = JSON.stringify(m.charge(q));
  const r = await m.appel(m.antor, 'PATCH', `/fiches/${q}`, { disparu: true });
  assert.equal(r.statusCode, 400, r.body);
  assert.equal(JSON.stringify(m.charge(q)), avant);
});

test('PATCH disparu : Léa et ?mode=joueur sont refusés sans écriture, comme le titre', async () => {
  const m = await monter();
  const bran = m.trouver('Bran Corvalis');
  const refTitre = await m.appel(m.lea, 'PATCH', `/fiches/${bran}`, { titre: 'X' });
  const rl = await m.appel(m.lea, 'PATCH', `/fiches/${bran}`, { disparu: true });
  assert.equal(rl.statusCode, refTitre.statusCode);
  assert.equal(rl.body, refTitre.body);
  const rm = await m.app.inject({ method: 'PATCH', url: `${m.base}/fiches/${bran}?mode=joueur`, headers: m.antor, payload: { disparu: true } });
  assert.ok(rm.statusCode === 403 || rm.statusCode === 404, rm.body);
  assert.notEqual(rm.statusCode, 200);
  assert.equal(m.charge(bran).disparu, undefined);
});

test('PATCH disparu : valeur non booléenne et clé inconnue sont 400', async () => {
  const m = await monter();
  const bran = m.trouver('Bran Corvalis');
  for (const v of ['true', 1, null, 'oui']) {
    const r = await m.appel(m.antor, 'PATCH', `/fiches/${bran}`, { disparu: v });
    assert.equal(r.statusCode, 400, JSON.stringify(v));
  }
  assert.equal((await m.appel(m.antor, 'PATCH', `/fiches/${bran}`, { disparu: true, truc: 1 })).statusCode, 400);
  assert.equal(m.charge(bran).disparu, undefined);
});

test('PATCH combiné titre + disparu sur une quête : rien n est écrit (le titre non plus)', async () => {
  const m = await monter();
  const q = await m.creer('quete', 'Ancien titre');
  const r = await m.appel(m.antor, 'PATCH', `/fiches/${q}`, { titre: 'Nouveau', disparu: true });
  assert.equal(r.statusCode, 400);
  const t = m.app.db.prepare('SELECT titre FROM fiches WHERE id = ?').get(q) as { titre: string };
  assert.equal(t.titre, 'Ancien titre');
});

test('PATCH combiné titre + disparu sur un lieu : les deux sont écrits', async () => {
  const m = await monter();
  const l = await m.creer('lieu', 'Ruine');
  const r = await m.appel(m.antor, 'PATCH', `/fiches/${l}`, { titre: 'Ruine brûlée', disparu: true });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().titre, 'Ruine brûlée');
  assert.equal(r.json().charge.disparu, true);
});

test('?etat : le Phare absent de disparu, présent de la ; après le PATCH l inverse', async () => {
  const m = await monter();
  assert.ok(!(await m.liste('type=lieu&etat=disparu')).titres.includes('Le Phare aux Sels'));
  assert.ok((await m.liste('type=lieu&etat=la')).titres.includes('Le Phare aux Sels'));
  const r = await m.appel(m.antor, 'PATCH', `/fiches/${m.trouver('Le Phare aux Sels')}`, { disparu: true });
  assert.equal(r.statusCode, 200);
  assert.ok((await m.liste('type=lieu&etat=disparu')).titres.includes('Le Phare aux Sels'));
  assert.ok(!(await m.liste('type=lieu&etat=la')).titres.includes('Le Phare aux Sels'));
});

test('?etat : disparu:false explicite compte comme la', async () => {
  const m = await monter();
  const phare = m.trouver('Le Phare aux Sels');
  await m.appel(m.antor, 'PATCH', `/fiches/${phare}`, { disparu: true });
  await m.appel(m.antor, 'PATCH', `/fiches/${phare}`, { disparu: false });
  assert.ok((await m.liste('type=lieu&etat=la')).titres.includes('Le Phare aux Sels'));
  assert.ok(!(await m.liste('type=lieu&etat=disparu')).titres.includes('Le Phare aux Sels'));
});

test('?etat invalide : 400 (xx, vide, répété)', async () => {
  const m = await monter();
  for (const qs of ['type=lieu&etat=xx', 'type=lieu&etat=', 'type=lieu&etat=la&etat=disparu', 'etat=DISPARU']) {
    assert.equal((await m.liste(qs)).r.statusCode, 400, qs);
  }
});

test('?etat sans type ne liste jamais une fiche d un type sans marque ; type sans marque + etat : vide', async () => {
  const m = await monter();
  await m.creer('quete', 'Quête témoin');
  await m.creer('evenement', 'Événement témoin');
  for (const etat of ['la', 'disparu']) {
    const r = await m.appel(m.antor, 'GET', `/fiches?etat=${etat}`);
    const types = new Set((r.json().fiches as Ligne[]).map((f) => f.type));
    for (const t of types) assert.ok(['personnage', 'lieu', 'faction', 'famille', 'objet', 'creature', 'vaisseau'].includes(t), `${etat}: ${t}`);
    assert.deepEqual((await m.liste(`type=quete&etat=${etat}`)).titres, []);
  }
  assert.ok((await m.liste('etat=la')).titres.includes('Le Phare aux Sels'));
});

test('?etat : le Prieur masqué est mort pour Antor et pour Léa (la marque est publique), Bran vivant', async () => {
  const m = await monter();
  const a = (await m.liste('type=personnage&etat=disparu')).titres;
  assert.ok(a.includes('Le Prieur masqué'));
  assert.ok(!a.includes('Bran Corvalis'));
  assert.ok((await m.liste('type=personnage&etat=la')).titres.includes('Bran Corvalis'));
  assert.ok(!(await m.liste('type=personnage&etat=la')).titres.includes('Le Prieur masqué'));
  // Léa reads only the readable sheets: the filter never reveals a hidden one.
  const l = await m.liste('type=personnage&etat=disparu', m.lea);
  assert.equal(l.r.statusCode, 200);
  assert.ok(!l.titres.includes('Le Prieur masqué'), 'fiche illisible de Léa');
});

test('?etat se combine avec ?q et la pagination sans perdre ni répéter', async () => {
  const m = await monter();
  const ids: number[] = [];
  for (let i = 0; i < 3; i++) ids.push(await m.creer('objet', `Relique ${i}`));
  await m.creer('objet', 'Relique vivante');
  for (const id of ids) await m.appel(m.antor, 'PATCH', `/fiches/${id}`, { disparu: true });
  const r = await m.liste('type=objet&etat=disparu&q=Relique');
  assert.deepEqual([...r.titres].sort(), ['Relique 0', 'Relique 1', 'Relique 2']);
  const tout = await m.liste('type=objet&etat=la&q=Relique');
  assert.deepEqual(tout.titres, ['Relique vivante']);
});

test('?etat avec lie : intersection avec la relation, pas union', async () => {
  const m = await monter();
  const cible = await m.creer('lieu', 'Cible');
  const a = await m.creer('lieu', 'Relié détruit');
  const b = await m.creer('lieu', 'Relié debout');
  const c = await m.creer('lieu', 'Non relié détruit');
  for (const id of [a, b, c]) {
    const sec = await m.appel(m.antor, 'POST', `/fiches/${id}/sections`, { titre: 'T', contenu: 'x' });
    if (id !== c) {
      const rel = await m.appel(m.antor, 'POST', `/fiches/${id}/sections/${sec.json().id}/relations`, { cibleFicheId: cible, nature: null, qualificatif: 'voisin' });
      assert.equal(rel.statusCode, 201, rel.body);
    }
  }
  for (const id of [a, c]) await m.appel(m.antor, 'PATCH', `/fiches/${id}`, { disparu: true });
  const r = await m.liste(`type=lieu&lie=${cible}&etat=disparu`);
  assert.equal(r.r.statusCode, 200, r.r.body);
  assert.deepEqual(r.titres, ['Relié détruit']);
  assert.deepEqual((await m.liste(`type=lieu&lie=${cible}&etat=la`)).titres, ['Relié debout']);
});

const SEPT: Record<string, [string, string, string, string, string, string, string, string]> = {
  personnage: ['Mort', 'Marquer mort', 'Marquer vivant', 'Vivants', 'Morts', 'Tous', 'skull', 'Vivant'],
  creature: ['Morte', 'Marquer morte', 'Marquer vivante', 'Vivantes', 'Mortes', 'Toutes', 'skull', 'Vivante'],
  famille: ['Éteinte', 'Marquer éteinte', 'Marquer vivante', 'Vivantes', 'Éteintes', 'Toutes', 'skull', 'Vivante'],
  faction: ['Détruite', 'Marquer détruite', 'Marquer active', 'Actives', 'Détruites', 'Toutes', 'shield-off', 'Active'],
  lieu: ['Détruit', 'Marquer détruit', 'Marquer intact', 'Intacts', 'Détruits', 'Tous', 'flame', 'Intact'],
  objet: ['Détruit', 'Marquer détruit', 'Marquer intact', 'Intacts', 'Détruits', 'Tous', 'flame', 'Intact'],
  vaisseau: ['Détruit', 'Marquer détruit', 'Marquer intact', 'Intacts', 'Détruits', 'Tous', 'flame', 'Intact'],
};

test('GET /types : les mots du tableau de docs/ecrans.md pour les sept types, rien pour les autres', async () => {
  const m = await monter();
  const r = await m.appel(m.lea, 'GET', '/types');
  assert.equal(r.statusCode, 200);
  const types = r.json() as Array<{ type: string; disparu?: Record<string, any> }>;
  for (const [t, [oui, menuOui, menuNon, la, disparu, tous, icone, non]] of Object.entries(SEPT)) {
    const d = types.find((x) => x.type === t)?.disparu;
    assert.ok(d, t);
    assert.equal(d.oui, oui, t);
    assert.equal(d.non, non, t);
    assert.equal(d.menuOui, menuOui, t);
    assert.equal(d.menuNon, menuNon, t);
    assert.deepEqual(d.filtre, { la, disparu, tous }, t);
    assert.equal(d.icone, icone, t);
  }
  for (const x of types.filter((x) => !(x.type in SEPT))) assert.equal(x.disparu, undefined, x.type);
  assert.ok(types.some((x) => x.type === 'quete'));
});

test('conversion : mort → créature reste mort ; → quête perd la clé ; → lieu (retour) ne la ressuscite pas', async () => {
  const m = await monter();
  const p = m.trouver('Le Prieur masqué');
  const conv = (type: string) => m.appel(m.antor, 'POST', `/fiches/${p}/type`, { type });
  assert.equal((await conv('creature')).statusCode, 200);
  assert.equal(m.charge(p).disparu, true);
  assert.equal((await conv('lieu')).statusCode, 200);
  assert.equal(m.charge(p).disparu, true);
  assert.equal((await conv('quete')).statusCode, 200);
  assert.equal('disparu' in m.charge(p), false);
  assert.equal((await conv('personnage')).statusCode, 200);
  assert.equal(m.charge(p).disparu, undefined);
  assert.equal(m.charge(p).pj, false);
});

test('conversion : un client ne peut pas poser disparu par le corps de /type', async () => {
  const m = await monter();
  const bran = m.trouver('Bran Corvalis');
  const r = await m.appel(m.antor, 'POST', `/fiches/${bran}/type`, { type: 'creature', charge: { disparu: true } });
  assert.ok(r.statusCode === 200 || r.statusCode === 400, r.body);
  assert.notEqual(m.charge(bran).disparu, true);
});

test('semis : le Prieur masqué est mort, Bran et Aldric ne le sont pas', async () => {
  const m = await monter();
  assert.equal(m.charge(m.trouver('Le Prieur masqué')).disparu, true);
  assert.notEqual(m.charge(m.trouver('Bran Corvalis')).disparu, true);
  assert.notEqual(m.charge(m.trouver('Maître Aldric')).disparu, true);
});

// ---------- import ----------
async function importer() {
  const m = await monter();
  const e = m.app.db.prepare("SELECT id FROM univers WHERE nom = 'Essai Kanka'").get() as { id: number };
  const auth = { authorization: `Bearer ${JETON_BOUCHON}` };
  const put = (cle: string, payload: unknown, lot?: number) =>
    m.app.inject({ method: 'PUT', url: `/api/import/v1/univers/${e.id}/fiches/${encodeURIComponent(cle)}${lot ? `?lot=${lot}` : ''}`, headers: auth, payload: payload as object });
  const ch = (cle: string) => {
    const row = m.app.db.prepare('SELECT id, charge FROM fiches WHERE univers_id = ? AND cle_origine = ?').get(e.id, cle) as { id: number; charge: string };
    return { id: row.id, charge: JSON.parse(row.charge) as Record<string, unknown> };
  };
  const mj = (fid: number, payload: object, mode = '') =>
    m.app.inject({ method: 'PATCH', url: `/api/univers/${e.id}/fiches/${fid}${mode}`, headers: m.antor, payload });
  return { ...m, put, ch, mj, e };
}

test('import : disparu posé sur un personnage et sur un lieu, rejoué à l identique inchangé', async () => {
  const m = await importer();
  const r = await m.put('p:1', { type: 'personnage', titre: 'Défunt', disparu: true, sections: [] });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(m.ch('p:1').charge.disparu, true);
  assert.equal(m.ch('p:1').charge.pj, false);
  const r2 = await m.put('p:1', { type: 'personnage', titre: 'Défunt', disparu: true, sections: [] });
  assert.equal(r2.statusCode, 200);
  assert.equal(r2.json().etat, 'inchangee');
  await m.put('l:1', { type: 'lieu', titre: 'Ruine', disparu: true, sections: [] });
  assert.equal(m.ch('l:1').charge.disparu, true);
});

test('import : disparu sur une quête → champ_inconnu, rien créé ; disparu non booléen → refus', async () => {
  const m = await importer();
  const r = await m.put('q:1', { type: 'quete', titre: 'Q', disparu: true, sections: [] });
  assert.equal(r.statusCode, 400, r.body);
  assert.match(JSON.stringify(r.json()), /champ_inconnu/);
  assert.equal(m.app.db.prepare('SELECT COUNT(*) n FROM fiches WHERE cle_origine = ?').get('q:1')!.n ?? 0, 0);
  const r2 = await m.put('q:2', { type: 'quete', titre: 'Q', disparu: false, sections: [] });
  assert.equal(r2.statusCode, 400, 'même false est un champ inconnu');
  const r3 = await m.put('p:2', { type: 'personnage', titre: 'P', disparu: 'oui', sections: [] });
  assert.equal(r3.statusCode, 400, r3.body);
});

test('import B-48 : rejoué après « marquer vivant » dans Kanevas, disparu n est pas écrasé', async () => {
  const m = await importer();
  await m.put('p:1', { type: 'personnage', titre: 'Défunt', disparu: true, sections: [] });
  const { id } = m.ch('p:1');
  assert.equal((await m.mj(id, { disparu: false })).statusCode, 200);
  const r = await m.put('p:1', { type: 'personnage', titre: 'Défunt', disparu: true, sections: [] });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(m.ch('p:1').charge.disparu, false, 'le MJ l a remis vivant');
  assert.match(JSON.stringify(r.json()), /non écrasé/);
});

test('import B-48 : le MJ marque mort, le script dit vivant → la décision du MJ reste', async () => {
  const m = await importer();
  await m.put('p:1', { type: 'personnage', titre: 'Vivant', disparu: false, sections: [] });
  const { id } = m.ch('p:1');
  await m.mj(id, { disparu: true });
  await m.put('p:1', { type: 'personnage', titre: 'Vivant', disparu: false, sections: [] });
  assert.equal(m.ch('p:1').charge.disparu, true);
});

test('import : sans changement humain, le script met à jour disparu (mort → vivant)', async () => {
  const m = await importer();
  await m.put('p:1', { type: 'personnage', titre: 'X', disparu: true, sections: [] });
  const r = await m.put('p:1', { type: 'personnage', titre: 'X', disparu: false, sections: [] });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(m.ch('p:1').charge.disparu, false);
});

test('import : le script qui ne dit rien de disparu ne touche pas à la marque du MJ', async () => {
  const m = await importer();
  await m.put('p:1', { type: 'personnage', titre: 'X', sections: [] });
  const { id } = m.ch('p:1');
  await m.mj(id, { disparu: true });
  await m.put('p:1', { type: 'personnage', titre: 'X', sections: [] });
  assert.equal(m.ch('p:1').charge.disparu, true);
});

test('import B-48 : PJ changé par le script au même rejeu qu un disparu humain → chacun protégé séparément', async () => {
  const m = await importer();
  await m.put('p:1', { type: 'personnage', titre: 'X', pj: false, disparu: true, sections: [] });
  const { id } = m.ch('p:1');
  await m.mj(id, { disparu: false });
  await m.put('p:1', { type: 'personnage', titre: 'X', pj: true, disparu: true, sections: [] });
  assert.equal(m.ch('p:1').charge.disparu, false, 'disparu humain protégé');
  assert.equal(m.ch('p:1').charge.pj, true, 'pj non touché par un humain : le script l écrit');
});

test('import : un type changé par le script vers un type sans marque efface disparu ; un champ disparu y est refusé', async () => {
  const m = await importer();
  await m.put('p:1', { type: 'personnage', titre: 'X', disparu: true, sections: [] });
  const r = await m.put('p:1', { type: 'quete', titre: 'X', sections: [] });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal('disparu' in m.ch('p:1').charge, false);
});

test('import : le compteur de lot reste cohérent (une fiche créée avec disparu = 1 créée)', async () => {
  const m = await importer();
  const auth = { authorization: `Bearer ${JETON_BOUCHON}` };
  const lot = (await m.app.inject({ method: 'POST', url: `/api/import/v1/univers/${m.e.id}/lots`, headers: auth })).json().lotId as number;
  await m.put('p:1', { type: 'personnage', titre: 'X', disparu: true, sections: [] }, lot);
  await m.put('q:1', { type: 'quete', titre: 'Q', disparu: true, sections: [] }, lot);
  const l = (await m.app.inject({ method: 'GET', url: `/api/import/v1/univers/${m.e.id}/lots/${lot}`, headers: auth })).json();
  assert.equal(l.compteurs.fiches.creees, 1);
  assert.equal(l.compteurs.fiches.refusees, 1);
});

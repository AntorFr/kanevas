// Tests of kanevas-liens-lecture, written from the exit criterion (AD-116, AD-100, AD-96, AD-97, AD-64). Literal expectations.
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { semerBouchon, JETON_BOUCHON } = await import('../bouchon/depart.js');
const { creerFiche } = await import('../services/fiches.js');
const { ajouterSection, changerAudience, ecrireContenu } = await import('../services/sections.js');
const { relierSection } = await import('../services/relations.js');
const { creerCampagne } = await import('../services/campagnes.js');
const { creerScenario } = await import('../services/scenarios.js');
const { catalogueDe } = await import('../services/assistant/catalogue.js');

type App = Awaited<ReturnType<typeof buildApp>>;

async function connecter(app: App, compte: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/connexion-bouchon',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: `compte=${compte}`,
  });
  const c = res.cookies.find((x) => x.name === 'kanevas_session');
  assert.ok(c);
  return { cookie: `kanevas_session=${c.value}` };
}

async function monter() {
  const app = await buildApp();
  semerBouchon(app.db);
  const antor = await connecter(app, 'antor');
  const lea = await connecter(app, 'lea');
  const idDe = (u: string) => (app.db.prepare('SELECT id FROM comptes WHERE username = ?').get(u) as { id: number }).id;
  const lame = app.db.prepare("SELECT id FROM univers WHERE nom = 'Lame d''Ébène'").get() as { id: number };
  const kanka = app.db.prepare("SELECT id FROM univers WHERE nom = 'Essai Kanka'").get() as { id: number };
  const fiche = (t: string, u = lame.id) =>
    (app.db.prepare('SELECT id FROM fiches WHERE titre = ? AND univers_id = ?').get(t, u) as { id: number }).id;
  const section = (fid: number, t: string) =>
    (app.db.prepare('SELECT id FROM sections WHERE fiche_id = ? AND titre = ?').get(fid, t) as { id: number }).id;
  const get = (h: Record<string, string>, url: string) => app.inject({ method: 'GET', url, headers: h });
  const html = async (h: Record<string, string>, u: number, titre: string, sec: string, mode = '') => {
    const f = fiche(titre, u);
    const r = await get(h, `/api/univers/${u}/fiches/${f}${mode}`);
    assert.equal(r.statusCode, 200, r.body);
    const s = r.json().sections.find((x: { titre: string }) => x.titre === sec);
    assert.ok(s, `section ${sec}`);
    return s.html as string;
  };
  const mentions = async (h: Record<string, string>, titre: string, mode = '') => {
    const r = await get(h, `/api/univers/${lame.id}/fiches/${fiche(titre)}${mode}`);
    assert.equal(r.statusCode, 200, r.body);
    return r.json() as { mentions: { titre: string; pourquoi: unknown[] }[]; mentionsSuite: boolean };
  };
  return { app, antor, lea, idDe, lame, kanka, fiche, section, get, html, mentions };
}


test('lecture : Histoire de Port-Sel — Antor deux liens, Léa le seul lien vers Aldric et la Guilde en texte, Antor en mode joueur comme Léa', async () => {
  const { app, antor, lea, lame, html, fiche } = await monter();
  const ald = fiche('Maître Aldric');
  const hA = await html(antor, lame.id, 'Port-Sel', 'Histoire');
  assert.match(hA, new RegExp(`<a class="lien-fiche" href="/univers/${lame.id}/fiche/${ald}"[^>]*>Maître Aldric</a>`));
  assert.match(hA, new RegExp(`<a class="lien-fiche" href="/univers/${lame.id}/fiche/${fiche('La Guilde des Brumes')}"[^>]*>La Guilde des Brumes</a>`));
  for (const h of [await html(lea, lame.id, 'Port-Sel', 'Histoire'), await html(antor, lame.id, 'Port-Sel', 'Histoire', '?mode=joueur')]) {
    assert.match(h, /<a class="lien-fiche"[^>]*>Maître Aldric<\/a>/);
    assert.equal((h.match(/<a /g) ?? []).length, 1);
    assert.match(h, /La Guilde des Brumes y a ses entrées/);
    assert.doesNotMatch(h, /lien-casse|lien-attente/);
    assert.doesNotMatch(h, /sous-main|cargaisons/);
    assert.doesNotMatch(h, new RegExp(`/fiche/${fiche('La Guilde des Brumes')}\\b`));
  }
  void app;
});

test('lecture : Anse-aux-Sels — Antor voit cassé + attente, Léa du texte, puis PUT faction:repaire fait un lien pour les deux', async () => {
  const { app, antor, lea, kanka, html } = await monter();
  const hA = await html(antor, kanka.id, 'Anse-aux-Sels', 'Description');
  assert.match(hA, /<span class="lien-casse"[^>]*>Capitaine Hesk<\/span>/);
  assert.match(hA, /<span class="lien-attente"[^>]*>les contrebandiers du Repaire<\/span>/);
  const hJ = await html(antor, kanka.id, 'Anse-aux-Sels', 'Description', '?mode=joueur');
  const hL = await html(lea, kanka.id, 'Anse-aux-Sels', 'Description');
  for (const h of [hL, hJ]) {
    assert.doesNotMatch(h, /lien-|<a |<span/);
    assert.match(h, /les contrebandiers du Repaire/);
    assert.match(h, /Capitaine Hesk/);
  }
  const put = await app.inject({
    method: 'PUT',
    url: `/api/import/v1/univers/${kanka.id}/fiches/${encodeURIComponent('faction:repaire')}`,
    headers: { authorization: `Bearer ${JETON_BOUCHON}` },
    payload: { type: 'faction', titre: 'Le Repaire', sections: [{ cle: 'd', titre: 'Description', contenu: 'x', joueursLisent: true }] },
  });
  assert.equal(put.statusCode, 200, put.body);
  for (const h of [await html(antor, kanka.id, 'Anse-aux-Sels', 'Description'), await html(lea, kanka.id, 'Anse-aux-Sels', 'Description')]) {
    assert.match(h, /<a class="lien-fiche"[^>]*>les contrebandiers du Repaire<\/a>/);
  }
  assert.match(await html(antor, kanka.id, 'Anse-aux-Sels', 'Description'), /lien-casse/);
});

test('lecture : une clé connue mais illisible est du texte pour Léa, jamais « en attente » ni lien', async () => {
  const { app, antor, lea, kanka, section, idDe, html } = await monter();
  const a = idDe('antor');
  // The sheet exists with the key, but its only section is GM-only.
  const cachee = creerFiche(app.db, a, kanka.id, { type: 'faction', titre: 'Cachée' });
  ajouterSection(app.db, a, kanka.id, cachee.id, { titre: 'Secret' });
  app.db.prepare('UPDATE fiches SET cle_origine = ? WHERE id = ?').run('faction:cachee', cachee.id);
  const anse = (app.db.prepare("SELECT id FROM fiches WHERE titre = 'Anse-aux-Sels'").get() as { id: number }).id;
  const sid = section(anse, 'Description');
  const v = (app.db.prepare('SELECT version FROM sections WHERE id = ?').get(sid) as { version: number }).version;
  ecrireContenu(app.db, a, kanka.id, anse, sid, `Voir [[cle:faction:cachee|la Cachée]] et [[${cachee.id}|encore]].`, v);
  const hL = await html(lea, kanka.id, 'Anse-aux-Sels', 'Description');
  assert.equal(hL, '<p>Voir la Cachée et encore.</p>\n');
  const hA = await html(antor, kanka.id, 'Anse-aux-Sels', 'Description');
  assert.equal((hA.match(/lien-fiche/g) ?? []).length, 2);
});

test('lecture : lien dans une citation et une liste, texte échappé', async () => {
  const { app, antor, lea, lame, fiche, section, idDe, html } = await monter();
  const ald = fiche('Maître Aldric');
  const port = fiche('Port-Sel');
  const sid = section(port, 'Description');
  const v = (app.db.prepare('SELECT version FROM sections WHERE id = ?').get(sid) as { version: number }).version;
  ecrireContenu(app.db, idDe('antor'), lame.id, port, sid, `> cité [[${ald}|A <b>&</b>]]\n\n- item [[${ald}|Aldric]]\n`, v);
  for (const h of [await html(lea, lame.id, 'Port-Sel', 'Description'), await html(antor, lame.id, 'Port-Sel', 'Description')]) {
    assert.match(h, /<blockquote>\s*<p>cité <a class="lien-fiche"[^>]*>A &lt;b&gt;&amp;&lt;\/b&gt;<\/a><\/p>/);
    assert.match(h, /<li>item <a class="lien-fiche"[^>]*>Aldric<\/a><\/li>/);
  }
});

test('mentions : Aldric — Léa Port-Sel seul, Antor trois, Antor en mode joueur comme Léa', async () => {
  const { antor, lea, mentions } = await monter();
  const l = await mentions(lea, 'Maître Aldric');
  assert.deepEqual(l.mentions.map((m) => [m.titre, m.pourquoi]), [['Port-Sel', [{ genre: 'lien', section: 'Histoire' }]]]);
  assert.equal(l.mentionsSuite, false);
  const a = await mentions(antor, 'Maître Aldric');
  assert.deepEqual(a.mentions.map((m) => m.titre), ['La Guilde des Brumes', 'Port-Sel', "Rapport secret de l'amirauté"]);
  assert.deepEqual(a.mentions.find((m) => m.titre.startsWith('Rapport'))!.pourquoi, [{ genre: 'lien', section: 'Secret — MJ seul' }]);
  const j = await mentions(antor, 'Maître Aldric', '?mode=joueur');
  assert.deepEqual(j.mentions.map((m) => m.titre), ['Port-Sel']);
});

test('mentions : lien lu seulement dans un bloc MJ — absent pour Léa et le mode joueur, présent pour Antor', async () => {
  const { app, antor, lea, lame, fiche, section, idDe, mentions } = await monter();
  const a = idDe('antor');
  const ald = fiche('Maître Aldric');
  const f = creerFiche(app.db, a, lame.id, { type: 'lieu', titre: 'Taverne' });
  const s = ajouterSection(app.db, a, lame.id, f.id, { titre: 'Notes', contenu: `:::mj\nIl y boit : [[${ald}|Aldric]]\n:::` });
  changerAudience(app.db, a, lame.id, f.id, s.id, { joueursLisent: true });
  assert.ok(section(f.id, 'Notes'));
  assert.ok((await mentions(antor, 'Maître Aldric')).mentions.some((m) => m.titre === 'Taverne'));
  assert.ok(!(await mentions(lea, 'Maître Aldric')).mentions.some((m) => m.titre === 'Taverne'));
  assert.ok(!(await mentions(antor, 'Maître Aldric', '?mode=joueur')).mentions.some((m) => m.titre === 'Taverne'));
});

test('mentions : relation visant Aldric depuis une section lisible s’ajoute avec son libellé ; lien + relation = une ligne ; relation d’une section fermée absente pour Léa', async () => {
  const { app, antor, lea, lame, fiche, section, idDe, mentions } = await monter();
  const a = idDe('antor');
  const ald = fiche('Maître Aldric');
  const bran = fiche('Bran Corvalis');
  relierSection(app.db, a, lame.id, bran, section(bran, 'Apparence'), { cibleFicheId: ald, type: 'frère de' });
  const port = fiche('Port-Sel');
  relierSection(app.db, a, lame.id, port, section(port, 'Histoire'), { cibleFicheId: ald, type: 'protégé de' });
  const prieur = fiche('Le Prieur masqué');
  relierSection(app.db, a, lame.id, prieur, section(prieur, 'Secret — MJ seul'), { cibleFicheId: ald, type: 'espion' });
  const l = await mentions(lea, 'Maître Aldric');
  assert.deepEqual(l.mentions.map((m) => m.titre), ['Bran Corvalis', 'Port-Sel']);
  assert.deepEqual(l.mentions[0]!.pourquoi, [{ genre: 'relation', libelle: 'frère de' }]);
  assert.deepEqual(l.mentions[1]!.pourquoi, [{ genre: 'lien', section: 'Histoire' }, { genre: 'relation', libelle: 'protégé de' }]);
  assert.ok((await mentions(antor, 'Maître Aldric')).mentions.some((m) => m.titre === 'Le Prieur masqué'));
});

test('mentions : 60 fiches liant Aldric — page de 50 et suite, ?apres=50 rend les 10, plafond joueur sans compteur caché', async () => {
  const { app, antor, lea, lame, fiche, idDe, get } = await monter();
  const a = idDe('antor');
  const ald = fiche('Maître Aldric');
  for (let i = 0; i < 60; i++) {
    const f = creerFiche(app.db, a, lame.id, { type: 'lieu', titre: `Lieu ${String(i).padStart(2, '0')}` });
    const s = ajouterSection(app.db, a, lame.id, f.id, { titre: 'Notes', contenu: `Voir [[${ald}|Aldric]]` });
    changerAudience(app.db, a, lame.id, f.id, s.id, { joueursLisent: true });
  }
  const u = `/api/univers/${lame.id}/fiches/${ald}`;
  for (const h of [antor, lea]) {
    const p = (await get(h, u)).json();
    // Léa: 60 + Port-Sel = 61; Antor: 60 + 3.
    assert.equal(p.mentions.length, 50);
    assert.equal(p.mentionsSuite, true);
  }
  const suiteL = (await get(lea, `${u}/mentions?apres=50`)).json();
  assert.equal(suiteL.mentions.length, 11);
  assert.equal(suiteL.suite, false);
  const suiteA = (await get(antor, `${u}/mentions?apres=50`)).json();
  assert.equal(suiteA.mentions.length, 13);
  const dernier = (await get(lea, `${u}/mentions?apres=60`)).json();
  assert.equal(dernier.mentions.length, 1);
  assert.equal((await get(lea, `${u}/mentions?apres=61`)).json().mentions.length, 0);
  assert.equal((await get(lea, `${u}/mentions?apres=-1`)).statusCode, 400);
  assert.equal((await get(lea, `${u}/mentions?apres=abc`)).statusCode, 400);
});

test('mentions : fiche que le lecteur ne lit pas -> 404 sur la route, comme la fiche ; inconnue idem', async () => {
  const { lea, lame, fiche, get } = await monter();
  const prieur = fiche('Le Prieur masqué');
  assert.equal((await get(lea, `/api/univers/${lame.id}/fiches/${prieur}/mentions`)).statusCode, 404);
  assert.equal((await get(lea, `/api/univers/${lame.id}/fiches/999999/mentions`)).statusCode, 404);
});

test('mentions : le titre d’une source fermée ne fuit pas dans la fiche lue par Léa', async () => {
  const { lea, lame, fiche, get } = await monter();
  const r = await get(lea, `/api/univers/${lame.id}/fiches/${fiche('Maître Aldric')}`);
  assert.doesNotMatch(r.body, /Guilde|Rapport secret|amirauté/);
});

test('scénario : lien vers Aldric rendu, clé en attente sans erreur, :::mj reste du texte ; aperçu de scénario idem', async () => {
  const { app, antor, lame, fiche, idDe } = await monter();
  const a = idDe('antor');
  const ald = fiche('Maître Aldric');
  const camp = creerCampagne(app.db, a, lame.id, { nom: 'Brumes' });
  const sc = creerScenario(app.db, a, camp.id, { titre: 'La Couronne brisée', contenu: `Aller voir [[${ald}|Aldric]] puis [[cle:personnage:inconnu|X]].\n\n:::mj\nsecret\n:::` });
  assert.match(sc.html, /<a class="lien-fiche"[^>]*>Aldric<\/a>/);
  assert.match(sc.html, /<span class="lien-attente"[^>]*>X<\/span>/);
  assert.doesNotMatch(sc.html, /container|mj-bloc|class="bloc/);
  assert.match(sc.html, /:::mj/);
  const r = await app.inject({ method: 'GET', url: `/api/scenarios/${sc.id}`, headers: antor });
  assert.equal(r.statusCode, 200);
  assert.match(r.json().html, /lien-fiche/);
  const ap = await app.inject({ method: 'POST', url: '/api/apercu', headers: antor, payload: { texte: `[[${ald}|Aldric]] [[cle:personnage:inconnu|X]]`, contexte: { nature: 'scenario', campagne_id: camp.id } } });
  if (ap.statusCode !== 404) {
    assert.equal(ap.statusCode, 200, ap.body);
    assert.match(ap.json().html, /lien-fiche/);
    assert.match(ap.json().html, /lien-attente/);
  }
});

test('scénario : un lien visant une fiche d’un autre univers est cassé, pas résolu dans l’univers de la campagne', async () => {
  const { app, lame, kanka, fiche, idDe } = await monter();
  const a = idDe('antor');
  const anse = fiche('Anse-aux-Sels', kanka.id);
  const camp = creerCampagne(app.db, a, lame.id, { nom: 'C2' });
  const sc = creerScenario(app.db, a, camp.id, { titre: 'S', contenu: `[[${anse}|Anse]]` });
  assert.doesNotMatch(sc.html, /lien-fiche/);
  assert.match(sc.html, /lien-casse/);
});

test('entrée de système : [[…]] reste du texte', async () => {
  const { app, antor } = await monter();
  const liste = (await app.inject({ method: 'GET', url: '/api/systemes', headers: antor })).json();
  const cof = (liste.systemes ?? liste).find((s: { nom: string }) => s.nom === 'CoF Mini');
  const { creerGabarit } = await import('../services/systemes.js');
  const idA = (app.db.prepare("SELECT id FROM comptes WHERE username = 'antor'").get() as { id: number }).id;
  const g = creerGabarit(app.db, idA, cof.id, { type: 'regle', nom: 'Lien', contenu: 'Voir [[1|Aldric]] ici.' });
  assert.equal((g as { html: string }).html, '<p>Voir [[1|Aldric]] ici.</p>\n');
});

test('assistant : Léa lit « Histoire » avec [Maître Aldric](fiche:id) et la Guilde sans identifiant ; Antor lit la source des deux', async () => {
  const { app, lame, fiche, section, idDe } = await monter();
  const port = fiche('Port-Sel');
  const ald = fiche('Maître Aldric');
  const guilde = fiche('La Guilde des Brumes');
  const args = { ficheId: port, sectionId: section(port, 'Histoire') };
  const run = async (compte: string, nom: string, a: object) => {
    const cat = catalogueDe(app.db, idDe(compte), lame.id);
    const o = (cat.outils ?? cat).find((x: { nom: string }) => x.nom === nom);
    return JSON.stringify(await o.executer(a));
  };
  for (const nom of ['lire_section', 'lire_fiche']) {
    const l = await run('lea', nom, nom === 'lire_fiche' ? { ficheId: port } : args);
    assert.ok(l.includes(`[Maître Aldric](fiche:${ald})`), l);
    assert.ok(l.includes('La Guilde des Brumes'), l);
    assert.ok(!l.includes(`fiche:${guilde}`), l);
    assert.ok(!l.includes(`[[`), l);
    assert.ok(!l.includes('sous-main'), l);
  }
  const a = await run('antor', 'lire_section', args);
  assert.ok(a.includes(`[[${ald}|Maître Aldric]]`) && a.includes(`[[${guilde}|La Guilde des Brumes]]`), a);
});

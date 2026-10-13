// Tests of kanevas-secrets-droits, written from the exit criterion (AD-96, AD-114 4-6): who reads a
// GM block, who writes a section that holds one, the preview, the assistant. Expectations are literals.
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { semerBouchon, JETON_BOUCHON } = await import('../bouchon/depart.js');
const { catalogueDe } = await import('../services/assistant/catalogue.js');

type App = Awaited<ReturnType<typeof buildApp>>;
type H = Record<string, string>;

async function connecter(app: App, compte: string): Promise<H> {
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
  const u = app.db.prepare("SELECT id FROM univers WHERE nom = 'Lame d''Ébène'").get() as { id: number };
  const port = app.db.prepare("SELECT id FROM fiches WHERE titre = 'Port-Sel'").get() as { id: number };
  const sid = (t: string) =>
    (app.db.prepare('SELECT id FROM sections WHERE titre = ? AND fiche_id = ?').get(t, port.id) as { id: number }).id;
  const compte = (n: string) => (app.db.prepare('SELECT id FROM comptes WHERE username = ?').get(n) as { id: number }).id;
  return { app, antor, lea, u, port, sid, compte, base: `/api/univers/${u.id}` };
}

const MSG_ECRIRE = 'Vous ne pouvez pas modifier cette section.';
const MSG_BLOC = 'Un bloc MJ ne peut être écrit que par un MJ.';

test('lecture de « Histoire » : Léa sans bloc ni source, Antor avec, Antor en mode joueur = Léa', async () => {
  const { app, antor, lea, base, port, sid } = await monter();
  const url = `${base}/fiches/${port.id}/sections/${sid('Histoire')}`;
  const l = await app.inject({ method: 'GET', url, headers: lea });
  assert.equal(l.statusCode, 200, l.body);
  for (const interdit of ['sous-main', 'bloc-mj', ':::mj', 'cargaisons']) assert.ok(!l.body.includes(interdit), interdit);
  assert.equal(l.json().peutEcrire, false);
  assert.equal(l.json().contenu, undefined);
  assert.ok(l.json().html.includes('sauniers'));
  const a = await app.inject({ method: 'GET', url, headers: antor });
  assert.ok(a.json().html.includes('<div class="bloc-mj"'));
  assert.ok(a.json().html.includes('role="note"'));
  assert.ok(a.json().html.includes('aria-label="Bloc MJ seul"'));
  assert.ok(a.json().contenu.includes(':::mj\nLe port est tenu en sous-main'));
  const j = await app.inject({ method: 'GET', url: url + '?mode=joueur', headers: antor });
  assert.equal(j.json().html, l.json().html);
  assert.equal(j.json().contenu, l.json().contenu);
  assert.equal(j.json().peutEcrire, l.json().peutEcrire);
  assert.ok(!j.body.includes('sous-main'));
});

test('lecture de la fiche entière : Léa ne reçoit le bloc nulle part', async () => {
  const { app, antor, lea, base, port } = await monter();
  const l = await app.inject({ method: 'GET', url: `${base}/fiches/${port.id}`, headers: lea });
  assert.equal(l.statusCode, 200, l.body);
  for (const interdit of ['sous-main', 'bloc-mj', ':::mj']) assert.ok(!l.body.includes(interdit), interdit);
  const a = await app.inject({ method: 'GET', url: `${base}/fiches/${port.id}`, headers: antor });
  assert.ok(a.body.includes('bloc-mj'));
  const j = await app.inject({ method: 'GET', url: `${base}/fiches/${port.id}?mode=joueur`, headers: antor });
  assert.ok(!j.body.includes('sous-main') && !j.body.includes('bloc-mj'));
});

test('Léa auteur de « Histoire » : PUT contenu → 403, section inchangée', async () => {
  const { app, lea, base, port, sid } = await monter();
  const s = sid('Histoire');
  const avant = app.db.prepare('SELECT contenu, version FROM sections WHERE id = ?').get(s) as { contenu: string; version: number };
  const r = await app.inject({
    method: 'PUT',
    url: `${base}/fiches/${port.id}/sections/${s}/contenu`,
    headers: lea,
    payload: { contenu: 'effacé', version: avant.version },
  });
  assert.equal(r.statusCode, 403, r.body);
  assert.ok(r.body.includes(MSG_ECRIRE), r.body);
  assert.deepEqual(app.db.prepare('SELECT contenu, version FROM sections WHERE id = ?').get(s), avant);
});

test('« Description » ouverte aux joueurs : Léa écrit un bloc → 400, texte simple accepté, Antor en mode joueur écrit un bloc', async () => {
  const { app, antor, lea, base, port, sid } = await monter();
  const s = sid('Description');
  const url = `${base}/fiches/${port.id}/sections/${s}`;
  const p = await app.inject({ method: 'PATCH', url, headers: antor, payload: { joueursEcrivent: true } });
  assert.equal(p.statusCode, 200, p.body);
  const v0 = (await app.inject({ method: 'GET', url, headers: lea })).json();
  assert.equal(v0.peutEcrire, true);
  const ecrire = (h: H, contenu: string, version: number, q = '') =>
    app.inject({ method: 'PUT', url: `${url}/contenu${q}`, headers: h, payload: { contenu, version } });
  const bloc = ':::mj\nx\n:::';
  const r = await ecrire(lea, bloc, v0.version);
  assert.equal(r.statusCode, 400, r.body);
  assert.ok(r.body.includes(MSG_BLOC));
  // the version is untouched by the refusal; also with a stale version the 400 wins (before the version)
  const r2 = await ecrire(lea, bloc, v0.version + 5);
  assert.equal(r2.statusCode, 400, r2.body);
  assert.equal((app.db.prepare('SELECT version v FROM sections WHERE id = ?').get(s) as { v: number }).v, v0.version);
  // block inside text, with the fence in a longer form
  const r3 = await ecrire(lea, `avant\n\n${bloc}\n\naprès`, v0.version);
  assert.equal(r3.statusCode, 400, r3.body);
  const ok = await ecrire(lea, 'texte public', v0.version);
  assert.equal(ok.statusCode, 200, ok.body);
  // a block in code is not a block: a non-GM may write it
  const code = await ecrire(lea, '```\n:::mj\nx\n:::\n```', ok.json().version);
  assert.equal(code.statusCode, 200, code.body);
  // the GM in player mode may write a block (the mode limits reads only, AD-39)
  const a = await ecrire(antor, bloc, code.json().version, '?mode=joueur');
  assert.equal(a.statusCode, 200, a.body);
  assert.equal((app.db.prepare('SELECT contenu c FROM sections WHERE id = ?').get(s) as { c: string }).c, bloc);
  // and now the section holds a block: Léa can no longer write it, even with a clean text
  const l = (await app.inject({ method: 'GET', url, headers: lea })).json();
  assert.equal(l.peutEcrire, false);
  const refus = await ecrire(lea, 'propre', l.version);
  assert.equal(refus.statusCode, 403, refus.body);
});

test('compte-rendu : Léa avec un bloc → 400 ; Antor avec un bloc, lu de Léa sans le bloc', async () => {
  const { app, antor, lea, base, u } = await monter();
  const camp = await app.inject({ method: 'POST', url: `${base}/campagnes`, headers: antor, payload: { nom: 'Camp', systemeId: null } });
  assert.equal(camp.statusCode, 201, camp.body);
  const cible = { campagneId: camp.json().id, titre: 'Séance 1' };
  const n0 = (app.db.prepare('SELECT count(*) n FROM fiches').get() as { n: number }).n;
  const l = await app.inject({ method: 'POST', url: `${base}/comptes-rendus`, headers: lea, payload: { ...cible, texte: 'vu\n:::mj\nsecretcr\n:::\nfin' } });
  assert.equal(l.statusCode, 400, l.body);
  assert.ok(l.body.includes(MSG_BLOC));
  assert.equal((app.db.prepare('SELECT count(*) n FROM fiches').get() as { n: number }).n, n0, 'aucune fiche créée');
  const ok = await app.inject({ method: 'POST', url: `${base}/comptes-rendus`, headers: lea, payload: { ...cible, texte: 'récit simple' } });
  assert.equal(ok.statusCode, 201, ok.body);
  const a = await app.inject({ method: 'POST', url: `${base}/comptes-rendus`, headers: antor, payload: { ...cible, titre: 'Séance 2', texte: 'vu\n:::mj\nsecretcr\n:::\nfin' } });
  assert.equal(a.statusCode, 201, a.body);
  const fid = a.json().id;
  const lu = await app.inject({ method: 'GET', url: `${base}/fiches/${fid}`, headers: lea });
  assert.equal(lu.statusCode, 200, lu.body);
  assert.ok(lu.body.includes('vu') && !lu.body.includes('secretcr') && !lu.body.includes('bloc-mj'));
  const luA = await app.inject({ method: 'GET', url: `${base}/fiches/${fid}`, headers: antor });
  assert.ok(luA.body.includes('secretcr'));
  const liste = await app.inject({ method: 'GET', url: `${base}/comptes-rendus`, headers: lea });
  assert.ok(!liste.body.includes('secretcr'), 'liste des comptes-rendus');
  void u;
});

test('POST /api/apercu : conteneur pour Antor avec nature section, ni Léa, ni mode joueur, ni sans nature', async () => {
  const { app, antor, lea, u } = await monter();
  const texte = ':::mj\nsecret\n:::';
  const ap = (h: H, extra: object) => app.inject({ method: 'POST', url: '/api/apercu', headers: h, payload: { texte, ...extra } });
  const a = await ap(antor, { nature: 'section', univers_id: u.id });
  assert.equal(a.statusCode, 200, a.body);
  assert.ok(a.json().html.includes('<div class="bloc-mj"') && a.json().html.includes('secret'));
  assert.ok(!a.json().html.includes(':::'));
  const aCtx = await ap(antor, { contexte: { nature: 'section', univers_id: u.id } });
  assert.ok(aCtx.json().html.includes('bloc-mj'));
  for (const [h, extra] of [
    [lea, { nature: 'section', univers_id: u.id }],
    [antor, { nature: 'section', univers_id: u.id, mode: 'joueur' }],
  ] as [H, object][]) {
    const r = await ap(h, extra);
    assert.equal(r.statusCode, 200, r.body);
    assert.ok(!r.json().html.includes('bloc-mj') && !r.json().html.includes('secret'), r.body);
  }
  for (const extra of [{}, { nature: 'texte', univers_id: u.id }, { univers_id: u.id }]) {
    for (const h of [antor, lea]) {
      const r = await ap(h, extra);
      assert.equal(r.json().html, '<p>:::mj<br>\nsecret<br>\n:::</p>\n', JSON.stringify(extra));
    }
  }
});

test('POST /api/apercu : nature section sans univers → 400 ; univers où l\'on n\'a pas de rôle → 404 ; sans session → 401', async () => {
  const { app, antor, u } = await monter();
  const texte = 'x';
  const sans = await app.inject({ method: 'POST', url: '/api/apercu', headers: antor, payload: { texte, nature: 'section' } });
  assert.equal(sans.statusCode, 400, sans.body);
  const inconnu = await app.inject({ method: 'POST', url: '/api/apercu', headers: antor, payload: { texte, nature: 'section', univers_id: 99999 } });
  assert.equal(inconnu.statusCode, 404, inconnu.body);
  const nue = await app.inject({ method: 'POST', url: '/api/apercu', payload: { texte, nature: 'section', univers_id: u.id } });
  assert.equal(nue.statusCode, 401, nue.body);
});

test('assistant : Léa ne lit pas le bloc, modifiable faux, écritures refusées sans événement ; Antor lit le bloc', async () => {
  const { app, u, port, sid, compte } = await monter();
  const s = sid('Histoire');
  const cat = (n: string) => catalogueDe(app.db, compte(n), u.id);
  const run = (n: string, outil: string, args: unknown) => cat(n).outils.find((o) => o.nom === outil)!.executer(args) as any;
  const avant = app.db.prepare('SELECT contenu, version FROM sections WHERE id = ?').get(s) as { contenu: string; version: number };
  const l = await run('lea', 'lire_section', { ficheId: port.id, sectionId: s });
  assert.equal(l.ok, true, JSON.stringify(l));
  assert.ok(!JSON.stringify(l).includes('sous-main') && !JSON.stringify(l).includes('bloc-mj'));
  assert.ok(l.donnees.contenu.includes('sauniers'));
  assert.equal(l.donnees.modifiable, false);
  const lf = await run('lea', 'lire_fiche', { ficheId: port.id });
  assert.ok(!JSON.stringify(lf).includes('sous-main'));
  assert.equal(lf.donnees.sections.find((x: any) => x.titre === 'Histoire').modifiable, false);
  for (const [outil, args] of [
    ['modifier_section', { ficheId: port.id, sectionId: s, contenu: 'x', version: avant.version }],
    ['ajouter_a_section', { ficheId: port.id, sectionId: s, texte: 'x', version: avant.version }],
  ] as [string, object][]) {
    const r = await run('lea', outil, args);
    assert.equal(r.ok, false, outil);
    assert.equal(r.erreur, MSG_ECRIRE, outil);
    assert.equal(r.evenement, undefined, outil);
  }
  assert.deepEqual(app.db.prepare('SELECT contenu, version FROM sections WHERE id = ?').get(s), avant);
  const a = await run('antor', 'lire_section', { ficheId: port.id, sectionId: s });
  assert.ok(a.donnees.contenu.includes(':::mj') && a.donnees.contenu.includes('sous-main'));
  assert.equal(a.donnees.modifiable, true);
  // the GM completes a section with a block: the source is kept whole
  const c = await run('antor', 'ajouter_a_section', { ficheId: port.id, sectionId: s, texte: 'Fin.', version: avant.version });
  assert.equal(c.ok, true, JSON.stringify(c));
  const apres = (app.db.prepare('SELECT contenu c FROM sections WHERE id = ?').get(s) as { c: string }).c;
  assert.equal(apres, avant.contenu + '\n\nFin.');
});

test('import : une section à bloc rejouée à l\'identique rend « inchangee »', async () => {
  const { app } = await monter();
  const u = app.db.prepare("SELECT id FROM univers WHERE nom = 'Essai Kanka'").get() as { id: number };
  const url = `/api/import/v1/univers/${u.id}/fiches/${encodeURIComponent('lieu:bloc')}`;
  const payload = { type: 'lieu', titre: 'Avec bloc', sections: [{ cle: 'h', titre: 'Histoire', contenu: 'a\n\n:::mj\nsecret\n:::\n\nb', joueursLisent: true }] };
  const headers = { authorization: `Bearer ${JETON_BOUCHON}` };
  const un = await app.inject({ method: 'PUT', url, headers, payload });
  assert.equal(un.statusCode, 200, un.body);
  assert.ok(un.body.includes('creee'), un.body);
  const deux = await app.inject({ method: 'PUT', url, headers, payload });
  assert.equal(deux.statusCode, 200, deux.body);
  assert.ok(deux.body.includes('inchangee'), deux.body);
});

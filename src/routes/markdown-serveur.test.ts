// Tests of kanevas-markdown-serveur, written from the exit criterion (Markdown rendered by the
// server for each reader, ceiling of 100 000, preview). Expectations are literals.
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { migrate, openDb } = await import('../db/db.js');
const { assurerCompte } = await import('../services/comptes.js');
const { creerUnivers } = await import('../services/univers.js');
const { ajouterMembre } = await import('../services/membres.js');
const { creerFiche } = await import('../services/fiches.js');
const { ajouterSection, ecrireContenu, changerAudience } = await import('../services/sections.js');
const { creerCampagne } = await import('../services/campagnes.js');
const { creerCompteRendu } = await import('../services/comptes_rendus.js');
const { creerScenario } = await import('../services/scenarios.js');
const { creerProposition } = await import('../services/propositions.js');
const { creerSysteme, rattacherSysteme, creerGabarit } = await import('../services/systemes.js');
const { catalogueDe } = await import('../services/assistant/catalogue.js');
const { rendreMarkdown } = await import('../services/markdown.js');

type App = Awaited<ReturnType<typeof buildApp>>;
type Verbe = 'GET' | 'POST' | 'PUT';
const MESSAGE = 'Contenu trop long : 100 000 caractères au plus.';

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
const appel = (app: App, h: object, method: Verbe, url: string, payload?: object) =>
  app.inject({ method, url, headers: h as Record<string, string>, payload });

async function monter() {
  const app = await buildApp();
  const antor = await connecter(app, 'antor');
  const lea = await connecter(app, 'lea');
  const u = (await appel(app, antor, 'POST', '/api/univers', { nom: 'U' })).json();
  const base = `/api/univers/${u.id}`;
  await appel(app, antor, 'POST', `${base}/membres`, { username: 'lea' });
  const f = (await appel(app, antor, 'POST', `${base}/fiches`, { type: 'personnage', titre: 'Maître Aldric', charge: { pj: false } })).json();
  return { app, antor, lea, base, ficheId: f.id as number };
}

const SOURCE = [
  '## Quartiers',
  '',
  '- un',
  '- deux',
  '',
  '| a | b |',
  '|---|---|',
  '| 1 | 2 |',
  '',
  '**gras** [site](https://exemple.org) [x](javascript:alert(1))',
  '',
  '<script>alert(1)</script>',
].join('\n');

test('critère : la lecture de Léa est rendue et sûre, sans contenu ; Antor a le contenu', async () => {
  const { app, antor, lea, base, ficheId } = await monter();
  const s = (await appel(app, antor, 'POST', `${base}/fiches/${ficheId}/sections`, { titre: 'Apparence', contenu: SOURCE })).json();
  await appel(app, antor, 'PATCH' as never, `${base}/fiches/${ficheId}/sections/${s.id}`, { joueursLisent: true });
  const url = `${base}/fiches/${ficheId}/sections/${s.id}`;
  const rl = await appel(app, lea, 'GET', url);
  assert.equal(rl.statusCode, 200, rl.body);
  const l = rl.json();
  assert.ok(l.html.includes('<h3>Quartiers</h3>'), l.html);
  assert.ok(l.html.includes('<ul>') && l.html.includes('<li>un</li>'));
  assert.ok(l.html.includes('<table>') && l.html.includes('<td>1</td>'));
  assert.ok(l.html.includes('<strong>gras</strong>'));
  assert.ok(l.html.includes('<a href="https://exemple.org" target="_blank" rel="noopener noreferrer">site</a>'));
  assert.ok(l.html.includes('&lt;script&gt;'));
  assert.ok(!rl.body.includes('<script'));
  assert.ok(!rl.body.includes('href=\\"javascript'));
  assert.ok(!('contenu' in l), 'le lecteur ne reçoit pas la source');
  const ra = (await appel(app, antor, 'GET', url)).json();
  assert.equal(ra.contenu, SOURCE);
  // la fiche entière, côté lecteur
  const fl = await appel(app, lea, 'GET', `${base}/fiches/${ficheId}`);
  assert.ok(!fl.body.includes('"contenu"'), 'fiche: pas de contenu pour le lecteur');
  assert.ok(fl.body.includes('<h3>Quartiers</h3>'));
  // aperçu = même HTML
  const ap = await appel(app, lea, 'POST', '/api/apercu', { texte: SOURCE });
  assert.equal(ap.statusCode, 200);
  assert.equal(ap.json().html, l.html);
});

test('texte brut de deux lignes : un paragraphe avec un <br>', () => {
  assert.equal(rendreMarkdown('ligne un\nligne deux'), '<p>ligne un<br>\nligne deux</p>\n');
});

test('images rendues en texte alternatif, schémas data:/vbscript: refusés, # devient h3, niveaux plafonnés à h6', () => {
  assert.equal(rendreMarkdown('![un chat](https://x.org/c.png)'), '<p>un chat</p>\n');
  assert.ok(!rendreMarkdown('[a](data:text/html;base64,AAA)').includes('<a'));
  assert.ok(!rendreMarkdown('[a](vbscript:x)').includes('<a'));
  assert.ok(rendreMarkdown('[a](mailto:a@b.fr)').includes('href="mailto:a@b.fr"'));
  assert.equal(rendreMarkdown('# T'), '<h3>T</h3>\n');
  assert.equal(rendreMarkdown('###### T'), '<h6>T</h6>\n');
  assert.ok(rendreMarkdown('~~x~~').includes('<s>x</s>'));
  assert.ok(!rendreMarkdown('<img src=x onerror=alert(1)>').includes('<img'));
  assert.ok(!rendreMarkdown('http://exemple.org').includes('<a'), 'pas de linkify');
});

test('aperçu : 401 sans session, 400 à 100 001, 200 à 100 000, 400 si texte absent', async () => {
  const { app, lea } = await monter();
  const sans = await app.inject({ method: 'POST', url: '/api/apercu', payload: { texte: 'a' } });
  assert.equal(sans.statusCode, 401);
  assert.equal((await appel(app, lea, 'POST', '/api/apercu', { texte: 'a'.repeat(100000) })).statusCode, 200);
  const trop = await appel(app, lea, 'POST', '/api/apercu', { texte: 'a'.repeat(100001) });
  assert.equal(trop.statusCode, 400);
  assert.equal(trop.json().message, MESSAGE);
  assert.equal((await appel(app, lea, 'POST', '/api/apercu', {})).statusCode, 400);
  assert.equal((await appel(app, lea, 'POST', '/api/apercu', { texte: 3 })).statusCode, 400);
});

test('plafond : section 100 000 accepté, 100 001 refusé (PUT et POST), /api/moi rend 100000', async () => {
  const { app, antor, base, ficheId } = await monter();
  const moi = (await appel(app, antor, 'GET', '/api/moi')).json();
  assert.equal(moi.limites.contenuSection, 100000);
  const s = (await appel(app, antor, 'POST', `${base}/fiches/${ficheId}/sections`, { titre: 'S', contenu: 'a'.repeat(100000) }));
  assert.equal(s.statusCode, 201);
  const refus = await appel(app, antor, 'POST', `${base}/fiches/${ficheId}/sections`, { titre: 'S2', contenu: 'a'.repeat(100001) });
  assert.equal(refus.statusCode, 400);
  assert.equal(refus.json().message, MESSAGE);
  const id = s.json().id;
  const put = await appel(app, antor, 'PUT', `${base}/fiches/${ficheId}/sections/${id}/contenu`, { contenu: 'b'.repeat(100001), version: 1 });
  assert.equal(put.statusCode, 400);
  assert.equal(put.json().message, MESSAGE);
  const ok = await appel(app, antor, 'PUT', `${base}/fiches/${ficheId}/sections/${id}/contenu`, { contenu: 'b'.repeat(100000), version: 1 });
  assert.equal(ok.statusCode, 200);
});

test('plafond : compte-rendu, scénario, entrée de système, proposition à 100 000 / 100 001, même message', () => {
  const db = openDb(':memory:');
  migrate(db);
  const antor = assurerCompte(db, 'antor');
  assurerCompte(db, 'lea');
  const u = creerUnivers(db, antor.id, { nom: 'U' });
  ajouterMembre(db, antor.id, u.id, 'lea', 'joueur');
  const camp = creerCampagne(db, antor.id, u.id, { nom: 'C' });
  const msg = (fn: () => unknown) => {
    try {
      fn();
    } catch (e) {
      return (e as Error).message;
    }
    return null;
  };
  const echecs: string[] = [];
  const step = (nom: string, fn: () => unknown) => {
    try {
      fn();
    } catch (e) {
      echecs.push(`${nom}: ${(e as Error).message}`);
    }
  };
  const N = 'x'.repeat(100000);
  const N1 = 'x'.repeat(100001);
  // compte-rendu
  const cr = creerCompteRendu(db, antor.id, u.id, camp.id, { titre: 'CR', texte: N });
  assert.ok(cr.id);
  assert.equal(msg(() => creerCompteRendu(db, antor.id, u.id, camp.id, { titre: 'CR2', texte: N1 })), MESSAGE);
  // scénario
  step('scenario', () => creerScenario(db, antor.id, camp.id, { titre: 'S', contenu: N }));
  assert.equal(msg(() => creerScenario(db, antor.id, camp.id, { titre: 'S2', contenu: N1 })), MESSAGE);
  // entrée de système
  const sys = creerSysteme(db, antor.id, { nom: 'Sys' });
  rattacherSysteme(db, antor.id, u.id, sys.id);
  step('gabarit', () => creerGabarit(db, antor.id, sys.id, { type: 'regle', nom: 'G', contenu: N }));
  assert.equal(msg(() => creerGabarit(db, antor.id, sys.id, { type: 'objet', nom: 'G2', contenu: N1 })), MESSAGE);
  // proposition
  const f = creerFiche(db, antor.id, u.id, { type: 'lieu', titre: 'L' });
  const sec = ajouterSection(db, antor.id, u.id, f.id, { titre: 'V', contenu: 'a' });
  step('proposition', () => creerProposition(db, antor.id, u.id, { sectionId: sec.id, crId: cr.id, version: sec.version, contenu: N }));
  assert.equal(
    msg(() => creerProposition(db, antor.id, u.id, { sectionId: sec.id, crId: cr.id, version: sec.version, contenu: N1 })),
    MESSAGE,
  );
  assert.deepEqual(echecs, []);
});

test('assistant : lire_section rend le Markdown source (jamais du HTML), même pour un joueur', () => {
  const db = openDb(':memory:');
  migrate(db);
  const antor = assurerCompte(db, 'antor');
  const lea = assurerCompte(db, 'lea');
  const u = creerUnivers(db, antor.id, { nom: 'U' });
  ajouterMembre(db, antor.id, u.id, 'lea', 'joueur');
  const f = creerFiche(db, antor.id, u.id, { type: 'lieu', titre: 'L' });
  const sec = ajouterSection(db, antor.id, u.id, f.id, { titre: 'V', contenu: '## T\n\n**g**' });
  ecrireContenu(db, antor.id, u.id, f.id, sec.id, '## T\n\n**g**', sec.version);
  for (const c of [antor, lea]) {
    const o = catalogueDe(db, c.id, u.id).outils.find((x) => x.nom === 'lire_section')!;
    const r = o.executer({ ficheId: f.id, sectionId: sec.id }) as { ok: boolean; donnees?: { contenu: string } };
    if (c === antor) {
      assert.equal(r.ok, true);
      assert.equal(r.donnees!.contenu, '## T\n\n**g**');
    } else {
      // Léa cannot read a GM-only section: refused, and nothing leaks.
      assert.equal(r.ok, false);
    }
  }
});

test('assistant : un lecteur reçoit la vue rendue sans la source, un écrivain la source (AD-113)', () => {
  const db = openDb(':memory:');
  migrate(db);
  const antor = assurerCompte(db, 'antor');
  const lea = assurerCompte(db, 'lea');
  const u = creerUnivers(db, antor.id, { nom: 'U' });
  ajouterMembre(db, antor.id, u.id, 'lea', 'joueur');
  const f = creerFiche(db, antor.id, u.id, { type: 'lieu', titre: 'L' });
  const sec = ajouterSection(db, antor.id, u.id, f.id, { titre: 'Apparence', contenu: 'x' });
  ecrireContenu(db, antor.id, u.id, f.id, sec.id, '## Quartiers\n\nUn homme **robuste**', sec.version);
  changerAudience(db, antor.id, u.id, f.id, sec.id, { joueursLisent: true });
  const lire = (id: number) => {
    const o = catalogueDe(db, id, u.id).outils.find((x) => x.nom === 'lire_section')!;
    return o.executer({ ficheId: f.id, sectionId: sec.id }) as { ok: boolean; donnees?: { contenu: string } };
  };
  const rl = lire(lea.id);
  assert.equal(rl.ok, true);
  assert.ok(!rl.donnees!.contenu.includes('## Quartiers'));
  assert.ok(!rl.donnees!.contenu.includes('**robuste**'));
  assert.ok(rl.donnees!.contenu.includes('<strong>robuste</strong>'));
  assert.equal(lire(antor.id).donnees!.contenu, '## Quartiers\n\nUn homme **robuste**');
});

// kanevas-mediatheque-fiche (B-55, E-9): a closed reference renders a neutral frame that leaks nothing of the file.
test('référence fermée : cadre neutre, image distinguée, aucun nom ni adresse du fichier', () => {
  const fichiers = (id: number) => (id === 7 ? { genre: 'ferme' as const } : { genre: 'rien' as const });
  const html = rendreMarkdown('![plan-secret-de-la-guilde.png](fichier:7)\n\n[regles-secretes.pdf](fichier:7)', { nature: 'section', fichiers });
  assert.ok(html.includes('<span class="fichier-reserve image-reservee">Image réservée au MJ.</span>'), html);
  assert.ok(html.includes('<span class="fichier-reserve">Fichier réservé au MJ.</span>'), html);
  assert.doesNotMatch(html, /plan-secret|regles-secretes|fichier:7|<img|<a /);
});

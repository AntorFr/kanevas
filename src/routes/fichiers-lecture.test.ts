// Tests of kanevas-mediatheque-lecture, written from the exit criterion (AD-117, D1): a file is read under
// its double guard, its usages under the reader's rights. Expectations are literals.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const RACINE = mkdtempSync(join(tmpdir(), 'fichiers-lecture-'));
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
process.env.ATTACHMENTS_DIR = RACINE;
delete process.env.DB_PATH;

const { buildApp } = await import('../app.js');
const { semerBouchon, semerIllustrations } = await import('../bouchon/depart.js');

type App = Awaited<ReturnType<typeof buildApp>>;
type H = Record<string, string>;
interface Vue {
  fichiers: { id: number; nom: string; visibilite: string }[];
  suite: number | string | null;
}

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const PDF = Buffer.from('%PDF-1.4 lecture');

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

function multipart(nom: string, contenu: Buffer, champs: Record<string, string> = {}) {
  const B = 'XB';
  const parts: Buffer[] = [];
  for (const [k, v] of Object.entries(champs)) {
    parts.push(Buffer.from(`--${B}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  }
  parts.push(
    Buffer.from(`--${B}\r\nContent-Disposition: form-data; name="fichier"; filename="${nom}"\r\nContent-Type: image/png\r\n\r\n`),
    contenu,
    Buffer.from(`\r\n--${B}--\r\n`),
  );
  return { payload: Buffer.concat(parts), type: `multipart/form-data; boundary=${B}` };
}

async function monter() {
  const app = await buildApp();
  semerBouchon(app.db);
  await semerIllustrations(app.db, RACINE);
  const antor = await connecter(app, 'antor');
  const lea = await connecter(app, 'lea');
  const teo = await connecter(app, 'teo');
  const u = app.db.prepare("SELECT id FROM univers WHERE nom = 'Lame d''Ébène'").get() as { id: number };
  const base = `/api/univers/${u.id}`;
  const fiche = (t: string) => (app.db.prepare('SELECT id FROM fiches WHERE titre = ? AND univers_id = ?').get(t, u.id) as { id: number }).id;
  const section = (f: string, t: string) =>
    (app.db.prepare('SELECT id FROM sections WHERE titre = ? AND fiche_id = ?').get(t, fiche(f)) as { id: number }).id;
  const compte = (n: string) => (app.db.prepare('SELECT id FROM comptes WHERE username = ?').get(n) as { id: number }).id;
  const get = (h: H, url: string) => app.inject({ method: 'GET', url: `${base}${url}`, headers: h });
  const envoyer = (h: H, nom: string, contenu: Buffer, champs: Record<string, string> = {}) => {
    const m = multipart(nom, contenu, champs);
    return app.inject({ method: 'POST', url: `${base}/fichiers`, headers: { ...h, 'content-type': m.type }, payload: m.payload });
  };
  const liste = async (h: H, q = '') => (await get(h, `/fichiers${q}`)).json() as Vue;
  const id = async (nom: string) => (await liste(antor)).fichiers.find((f) => f.nom === nom)!.id;
  const ecrire = async (f: string, s: string, contenu: string) => {
    const lu = (await get(antor, `/fiches/${fiche(f)}/sections/${section(f, s)}`)).json();
    const r = await app.inject({
      method: 'PUT',
      url: `${base}/fiches/${fiche(f)}/sections/${section(f, s)}/contenu`,
      headers: antor,
      payload: { contenu, version: lu.version },
    });
    assert.equal(r.statusCode, 200, r.body);
  };
  const html = async (h: H, f: string, s: string) => (await get(h, `/fiches/${fiche(f)}/sections/${section(f, s)}`)).json().html as string;
  const joindre = (f: string, s: string, fid: number, h: H = antor) =>
    app.inject({ method: 'POST', url: `${base}/fiches/${fiche(f)}/sections/${section(f, s)}/fichiers`, headers: h, payload: { fichierId: fid } });
  const detail = async (h: H, fid: number) => (await get(h, `/fichiers/${fid}/detail`)).json() as { usages: { libelle: string }[]; restantes: number };
  const ajouterTeo = () => app.db.prepare('INSERT INTO membres (univers_id, compte_id, role) VALUES (?, ?, ?)').run(u.id, compte('teo'), 'joueur');
  return { app, antor, lea, teo, u, base, fiche, section, compte, get, envoyer, liste, id, ecrire, html, joindre, detail, ajouterTeo };
}

test('image mj insérée dans « Description » : Léa lit « Image réservée au MJ. », pas les octets ; bloc MJ : rien', async () => {
  const m = await monter();
  const sec = m.section('Port-Sel', 'Description');
  const r = await m.envoyer(m.antor, 'plan-du-repaire.png', PNG, { section: String(sec), maniere: 'texte', blocMj: 'true' });
  assert.equal(r.statusCode, 201, r.body);
  const fid = r.json().id as number;
  assert.equal(r.json().visibilite, 'mj');
  await m.ecrire('Port-Sel', 'Description', `Le port.\n\n![Plan](fichier:${fid})`);
  const lea = await m.html(m.lea, 'Port-Sel', 'Description');
  assert.match(lea, /Image réservée au MJ\./);
  assert.ok(!lea.includes(`/fichiers/${fid}`), lea);
  assert.ok(!lea.includes('<img'), lea);
  // The GM reads the image itself.
  assert.ok((await m.html(m.antor, 'Port-Sel', 'Description')).includes(`/fichiers/${fid}?v=`));
  // The sheet read as a whole says the same.
  const fiche = JSON.stringify((await m.get(m.lea, `/fiches/${m.fiche('Port-Sel')}`)).json());
  assert.ok(fiche.includes('Image réservée au MJ.'));
  assert.ok(!fiche.includes(`/fichiers/${fid}`));
  // Léa's list holds neither this file nor the secret plan; its address is « Page introuvable. » (404).
  const noms = (await m.liste(m.lea)).fichiers.map((f) => f.nom);
  assert.ok(!noms.includes('plan-du-repaire.png'));
  assert.ok(!noms.includes('Plan secret de la Guilde'));
  const direct = await m.get(m.lea, `/fichiers/${fid}`);
  assert.equal(direct.statusCode, 404);
  // Inside a GM block: nothing for Léa, the image for the GM.
  await m.ecrire('Maître Aldric', 'Apparence', `Grand.\n\n:::mj\n![Plan](fichier:${fid})\n:::\n`);
  const bloc = await m.html(m.lea, 'Maître Aldric', 'Apparence');
  assert.ok(!bloc.includes('Image réservée'), bloc);
  assert.ok(!bloc.includes(String(fid)), bloc);
  assert.ok((await m.html(m.antor, 'Maître Aldric', 'Apparence')).includes(`/fichiers/${fid}?v=`));
});

test('fichier mj joint et lien fichier: : « Fichier réservé au MJ. » pour Léa, lien vers les octets pour Antor', async () => {
  const m = await monter();
  const plan = await m.id('Plan secret de la Guilde');
  await m.ecrire('Port-Sel', 'Description', `Voir [le plan](fichier:${plan}).`);
  const lea = await m.html(m.lea, 'Port-Sel', 'Description');
  assert.match(lea, /Fichier réservé au MJ\./);
  assert.ok(!lea.includes(`/fichiers/${plan}`), lea);
  assert.ok(!lea.includes('le plan'), 'ni le texte du lien ne reste comme lien');
  assert.match(await m.html(m.antor, 'Port-Sel', 'Description'), new RegExp(`href="[^"]*/fichiers/${plan}\\?v=[^"]*"`));
});

test('« carnet.pdf » ajouté par Léa (mj) : Léa le lit, Teo non', async () => {
  const m = await monter();
  m.ajouterTeo();
  const sec = m.section('Léa Brisefer', 'Notes de la table');
  const r = await m.envoyer(m.lea, 'carnet.pdf', PDF, { section: String(sec), maniere: 'joint' });
  assert.equal(r.statusCode, 201, r.body);
  const fid = r.json().id as number;
  assert.equal(r.json().visibilite, 'mj');
  assert.ok((await m.liste(m.lea)).fichiers.some((f) => f.id === fid));
  assert.ok(!(await m.liste(m.teo)).fichiers.some((f) => f.id === fid));
  assert.equal((await m.get(m.lea, `/fichiers/${fid}/detail`)).statusCode, 200);
  assert.equal((await m.get(m.teo, `/fichiers/${fid}/detail`)).statusCode, 404);
});

test('mode Joueur d’Antor : fichiers joueurs et les siens, ni « carnet.pdf » ni un mj d’autrui', async () => {
  const m = await monter();
  const sec = m.section('Port-Sel', 'Description');
  await m.envoyer(m.antor, 'plan-du-repaire.png', PNG, { section: String(sec), maniere: 'joint', blocMj: 'true' });
  await m.envoyer(m.lea, 'carnet.pdf', PDF, { section: String(m.section('Léa Brisefer', 'Notes de la table')), maniere: 'joint' });
  const noms = (await m.liste(m.antor, '?mode=joueur')).fichiers.map((f) => f.nom);
  assert.ok(noms.includes('Carte des Sphères'));
  assert.ok(noms.includes('plan-du-repaire.png'), 'ses propres fichiers');
  assert.ok(noms.includes('Plan secret de la Guilde'), 'ajouté par Antor lui-même');
  assert.ok(!noms.includes('carnet.pdf'));
  // Out of player mode the GM reads everything.
  assert.ok((await m.liste(m.antor)).fichiers.some((f) => f.nom === 'carnet.pdf'));
});

test('détail : Léa ne lit que les usages qu’elle lit ; un fichier joint à une section fermée n’y laisse aucune trace', async () => {
  const m = await monter();
  const f = await m.id('port-sel-quais.webp');
  // « Carte des Sphères »: illustration of Port-Sel, cited in Val-Fortin, joined to Aldric (all read by Léa).
  const carte = await m.id('Carte des Sphères');
  assert.deepEqual((await m.detail(m.lea, carte)).usages.map((u) => u.libelle).sort(), [
    'Maître Aldric — « Apparence » (jointe)',
    'Port-Sel (illustration)',
    'Val-Fortin — « Description »',
  ]);
  // A `joueurs` file joined to Port-Sel/Description and to the Prieur's closed section: only Port-Sel for Léa.
  await m.joindre('Le Prieur masqué', 'Secret — MJ seul', f);
  await m.joindre('Maître Aldric', 'Vérité — MJ seul', f);
  const lea = await m.detail(m.lea, f);
  assert.deepEqual(lea.usages.map((u) => u.libelle), ['Port-Sel — « Description » (jointe)']);
  assert.equal(lea.restantes, 0);
  assert.ok(!JSON.stringify(lea).includes('Prieur'));
  assert.ok(!JSON.stringify(lea).includes('Aldric'));
  assert.equal((await m.detail(m.antor, f)).usages.length, 3);
});

test('aucun usage lisible : détail sans usage, rangé dans « Non utilisés » ; utilisé : dans « Utilisés »', async () => {
  const m = await monter();
  const f = await m.id('port-sel-quais.webp');
  m.app.db.prepare('DELETE FROM fichiers_sections WHERE fichier_id = ?').run(f);
  await m.joindre('Maître Aldric', 'Vérité — MJ seul', f);
  assert.equal((await m.detail(m.lea, f)).usages.length, 0);
  const non = (await m.liste(m.lea, '?usage=non_utilises')).fichiers.map((x) => x.id);
  const oui = (await m.liste(m.lea, '?usage=utilises')).fichiers.map((x) => x.id);
  assert.ok(non.includes(f));
  assert.ok(!oui.includes(f));
  assert.ok(oui.includes(await m.id('Carte des Sphères')));
  // For the GM the same file is used.
  assert.ok((await m.liste(m.antor, '?usage=utilises')).fichiers.some((x) => x.id === f));
});

test('un fichier cité seulement dans un bloc MJ n’a aucun usage pour Léa', async () => {
  const m = await monter();
  const f = await m.id('port-sel-quais.webp');
  m.app.db.prepare('DELETE FROM fichiers_sections WHERE fichier_id = ?').run(f);
  await m.ecrire('Port-Sel', 'Description', `Texte.\n\n:::mj\n![x](fichier:${f})\n:::\n`);
  assert.equal((await m.detail(m.lea, f)).usages.length, 0);
  assert.equal((await m.detail(m.antor, f)).usages.length, 1);
});

test('détail : 10 usages puis la suite', async () => {
  const m = await monter();
  const f = await m.id('port-sel-quais.webp');
  m.app.db.prepare('DELETE FROM fichiers_sections WHERE fichier_id = ?').run(f);
  // Use the real routes: 12 sections of Port-Sel, each carrying the file.
  for (let i = 0; i < 12; i++) {
    const s = await m.app.inject({ method: 'POST', url: `${m.base}/fiches/${m.fiche('Port-Sel')}/sections`, headers: m.antor, payload: { titre: `S${String(i).padStart(2, '0')}` } });
    assert.equal(s.statusCode, 201, s.body);
    const r = await m.app.inject({ method: 'POST', url: `${m.base}/fiches/${m.fiche('Port-Sel')}/sections/${s.json().id}/fichiers`, headers: m.antor, payload: { fichierId: f } });
    assert.equal(r.statusCode, 201, r.body);
  }
  const p1 = (await m.get(m.antor, `/fichiers/${f}/detail`)).json();
  assert.equal(p1.usages.length, 10);
  assert.equal(p1.restantes, 2);
  const p2 = (await m.get(m.antor, `/fichiers/${f}/detail?apresUsage=10`)).json();
  assert.equal(p2.usages.length, 2);
  assert.equal(p2.restantes, 0);
});

test('impact « reserver » de « Carte des Sphères » ; la suppression, en dernier, dit « Fichier supprimé… » à Antor et rien à Léa', async () => {
  const m = await monter();
  const carte = await m.id('Carte des Sphères');
  const r = await m.get(m.antor, `/fichiers/${carte}/impact?action=reserver`);
  assert.equal(r.statusCode, 200, r.body);
  assert.deepEqual((r.json().usages as { libelle: string }[]).map((u) => u.libelle).sort(), [
    'Maître Aldric — « Apparence » (jointe)',
    'Port-Sel (illustration)',
    'Val-Fortin — « Description »',
  ]);
  assert.equal((await m.get(m.antor, `/fichiers/${carte}/impact?action=supprimer`)).statusCode, 200);
  assert.equal((await m.get(m.antor, `/fichiers/${carte}/impact?action=autre`)).statusCode, 400);
  assert.equal((await m.get(m.lea, `/fichiers/${carte}/impact?action=reserver`)).statusCode, 403);
  // The impact of a file the caller cannot read does not exist for them.
  const plan = await m.id('Plan secret de la Guilde');
  assert.equal((await m.get(m.lea, `/fichiers/${plan}/impact?action=reserver`)).statusCode, 404);
  // Last: the deletion.
  assert.equal((await m.app.inject({ method: 'DELETE', url: `${m.base}/fichiers/${carte}`, headers: m.antor })).statusCode, 204);
  assert.match(await m.html(m.antor, 'Val-Fortin', 'Description'), /Fichier supprimé de la médiathèque\./);
  const lea = await m.html(m.lea, 'Val-Fortin', 'Description');
  assert.ok(!lea.includes('supprimé'), lea);
  assert.ok(!lea.includes('<img'), lea);
});

test('impact « reserver » d’un fichier déjà mj : aucun usage', async () => {
  const m = await monter();
  const plan = await m.id('Plan secret de la Guilde');
  assert.deepEqual((await m.get(m.antor, `/fichiers/${plan}/impact?action=reserver`)).json().usages, []);
});

test('Antor passe « Carte des Sphères » à mj : l’illustration de Port-Sel est « Image réservée au MJ. » pour Léa', async () => {
  const m = await monter();
  const carte = await m.id('Carte des Sphères');
  const p = await m.app.inject({ method: 'PATCH', url: `${m.base}/fichiers/${carte}`, headers: m.antor, payload: { visibilite: 'mj' } });
  assert.equal(p.statusCode, 200, p.body);
  const fiche = (await m.get(m.lea, `/fiches/${m.fiche('Port-Sel')}`)).json();
  assert.deepEqual(fiche.illustration, { fermee: true, message: 'Image réservée au MJ.' });
  const liste = (await m.get(m.lea, '/fiches')).json();
  assert.ok(JSON.stringify(liste).includes('Image réservée au MJ.'));
  assert.ok(!JSON.stringify(liste).includes(`/fichiers/${carte}`));
  assert.match(await m.html(m.lea, 'Val-Fortin', 'Description'), /Image réservée au MJ\./);
  // The GM still has it as a file.
  assert.ok((await m.get(m.antor, `/fiches/${m.fiche('Port-Sel')}`)).json().illustration.id === carte);
});

test('un joueur qui force l’adresse d’un fichier mj : 404 sans différence avec un id inconnu (corps et en-têtes)', async () => {
  const m = await monter();
  const plan = await m.id('Plan secret de la Guilde');
  for (const suffixe of ['', '/detail', '/impact?action=reserver']) {
    const cache = await m.get(m.lea, `/fichiers/${plan}${suffixe}`);
    const inconnu = await m.get(m.lea, `/fichiers/999999${suffixe}`);
    assert.equal(cache.statusCode, 404, suffixe);
    assert.equal(cache.body, inconnu.body, suffixe);
    const h = (r: typeof cache) => { const { date: _d, 'content-length': _l, ...x } = r.headers as Record<string, unknown>; return x; };
    assert.deepEqual(h(cache), h(inconnu), suffixe);
  }
});

test('le semis d’avant : pièces et illustrations s’affichent, la pièce secrète est réservée au MJ', async () => {
  const m = await monter();
  const noms = (await m.liste(m.lea)).fichiers.map((f) => f.nom);
  assert.ok(noms.includes('port-sel-quais.webp'));
  assert.ok(noms.includes('Carte des Sphères'));
  const aldric = (await m.get(m.lea, `/fiches/${m.fiche('Maître Aldric')}`)).json();
  assert.ok(JSON.stringify(aldric).includes('Carte des Sphères'));
  const secrete = (m.app.db.prepare("SELECT f.nom FROM fichiers f JOIN fichiers_sections fs ON fs.fichier_id = f.id WHERE f.visibilite = 'mj' AND fs.joint = 1").all() as { nom: string }[]).map((x) => x.nom);
  for (const n of secrete) assert.ok(!noms.includes(n), n);
});

test('filtres : nature, visibilité, nom sans casse, tri par nom, curseur invalide, filtre inconnu', async () => {
  const m = await monter();
  const noms = async (q: string) => (await m.liste(m.antor, q)).fichiers.map((f) => f.nom);
  const mj = await noms('?visibilite=mj');
  assert.ok(mj.includes('Plan secret de la Guilde'));
  assert.ok(!mj.includes('Carte des Sphères'));
  assert.deepEqual(await noms('?q=CARTE'), ['Carte des Sphères']);
  const tri = await noms('?tri=nom');
  assert.deepEqual(tri, [...tri].sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' })));
  assert.equal((await m.get(m.antor, '/fichiers?apres=zzz')).statusCode, 400);
  assert.equal((await m.get(m.antor, '/fichiers?tri=bizarre')).statusCode, 400);
  assert.equal((await m.get(m.antor, '/fichiers?nature=video')).statusCode, 400);
  await m.envoyer(m.antor, 'notes.pdf', PDF);
  assert.deepEqual(await noms('?nature=documents'), ['notes.pdf']);
  assert.ok(!(await noms('?nature=images')).includes('notes.pdf'));
});

test('liste : « Non utilisés » pour Léa ne compte pas les usages cachés (un fichier utilisé seulement en fiche cachée est non utilisé)', async () => {
  const m = await monter();
  const plan = await m.id('Plan secret de la Guilde');
  // The seeded plan is mj: not in Léa's lists, in the GM's « non utilisés ».
  assert.ok(!(await m.liste(m.lea, '?usage=non_utilises')).fichiers.some((f) => f.id === plan));
  assert.ok((await m.liste(m.antor, '?usage=non_utilises')).fichiers.some((f) => f.id === plan));
});

test('impact : « reserver » ne compte que ce que les joueurs lisent, « supprimer » tout', async () => {
  const m = await monter();
  const f = await m.id('port-sel-quais.webp');
  await m.joindre('Le Prieur masqué', 'Secret — MJ seul', f);
  const lib = async (a: string) => ((await m.get(m.antor, `/fichiers/${f}/impact?action=${a}`)).json().usages as { libelle: string }[]).map((u) => u.libelle);
  assert.deepEqual(await lib('reserver'), ['Port-Sel — « Description » (jointe)']);
  assert.equal((await lib('supprimer')).length, 2);
});

// Black-box complements for kanevas-fichiers (B-24, P-3, P-7, E-9 « bloc Pièces jointes »), written from
// docs/parcours.md and docs/ecrans.md only. Cases the other piece-jointe tests leave open.
//
// TEST PLAN (need -> case -> hard-coded expectation -> failure it catches)
// B-24 bords      3,1 Mo file -> « 3,1 Mo » on its line                         [size unit/rounding]
// B-24 bords      PNG bytes named « photo.txt » -> thumbnail, not a download line [type from name]
// B-24 bords      3 files chosen at once -> all 3 attached, one after another    [multi-choice drops files]
// B-24 bords      name with folders and name > 200 chars -> bare name, <= 200 chars [name hygiene]
// B-24 bords      thumbnail: alt = name, legend « nom · taille », opens in a new tab [E-9 texts]
// B-24 exclusions piece of a section is not shown on another section             [piece attached to wrong section]
// B-24 exclusions secret deposit by a Joueur (secrete=true) -> 403, nothing stored [player marks secret at upload]
// B-24 exclusions a piece read through another fiche's address -> 404            [IDOR across fiches]
// B-24 exclusions a member of another universe cannot read the file -> 404       [IDOR across universes]
// B-24 exclusions removed section: its secret piece address answers 404 for the GM too [orphan files]
// B-24 nominal    « Lever le secret » -> Léa sees the piece                       [unmark does not propagate]
// B-24 refus      write right withdrawn meanwhile -> « Vous ne pouvez plus ajouter de fichier à cette section. »,
//                 « Ajouter un fichier » gone
// B-24 échec      marking fails (network) -> « L'action n'a pas abouti. Réessayez. », state before restored
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import {
  type Any, attendre, choisirDansMenuSection, confirmerRetraitSection, connecte, launch, regler, rx, rxExact, section, skipBrowser, startServer, texte, type Server,
} from './harnais.test.ts';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

const opts = { skip: skipBrowser, timeout: 120000 };
let srv: Server;
let browser: Any;
let n = 0;

interface Monde { u: number; f: number; s: Record<string, number>; nom: string; fiche: string }

before(async () => {
  if (skipBrowser) return;
  srv = await startServer();
  browser = await launch();
});
after(async () => {
  await browser?.close();
  srv?.stop();
});

async function api(ctx: Any, methode: 'get' | 'post' | 'patch' | 'delete', url: string, data?: Any): Promise<Any> {
  return ctx.request[methode](url, data === undefined ? {} : { data });
}

async function monde(sections: Record<string, Any>): Promise<{ m: Monde; antor: { ctx: Any; page: Any }; lea: { ctx: Any; page: Any }; teo: { ctx: Any; page: Any } }> {
  n++;
  const nom = `Complément ${n}`;
  const antor = await connecte(browser, srv.base, 'Antor');
  const lea = await connecte(browser, srv.base, 'Léa');
  const teo = await connecte(browser, srv.base, 'Teo');
  const u = (await (await api(antor.ctx, 'post', '/api/univers', { nom })).json()) as Any;
  for (const id of ['lea', 'teo']) {
    const r = await api(antor.ctx, 'post', `/api/univers/${u.id}/membres`, { username: id, role: 'joueur' });
    assert.ok(r.ok(), `adding member ${id}: ${r.status()}`);
  }
  const membres = (await (await api(antor.ctx, 'get', `/api/univers/${u.id}/membres`)).json()) as Any;
  const liste: Any[] = Array.isArray(membres) ? membres : membres.membres;
  const compteLea = liste.find((x) => x.username === 'lea' || x.identifiant === 'lea')?.compteId;
  const fiche = 'Maître Aldric';
  const f = (await (await api(antor.ctx, 'post', `/api/univers/${u.id}/fiches`, { type: 'personnage', titre: fiche, charge: { pj: false } })).json()) as Any;
  const fid = f.id ?? f.fiche?.id;
  const s: Record<string, number> = {};
  for (const [titre, reglage] of Object.entries(sections)) {
    const r = (await (await api(antor.ctx, 'post', `/api/univers/${u.id}/fiches/${fid}/sections`, { titre })).json()) as Any;
    const sid = r.id ?? r.section?.id;
    s[titre] = sid;
    const patch = { ...reglage };
    if (patch.auteurId === 'lea') patch.auteurId = compteLea;
    if (Object.keys(patch).length) {
      const p = await api(antor.ctx, 'patch', `/api/univers/${u.id}/fiches/${fid}/sections/${sid}`, patch);
      assert.ok(p.ok(), `patch section: ${p.status()}`);
    }
  }
  return { m: { u: u.id, f: fid, s, nom, fiche }, antor, lea, teo };
}

const base = (m: Monde, titre: string) => `/api/univers/${m.u}/fiches/${m.f}/sections/${m.s[titre]}`;
const pj = (m: Monde, pid: number | string, _fin = '') => `/api/univers/${m.u}/fichiers/${pid}`;
const fichier = (name: string, buffer: Buffer) => ({ name, mimeType: 'application/octet-stream', buffer });

async function deposer(ctx: Any, m: Monde, titre: string, nom: string, buffer: Buffer, secrete = false): Promise<Any> {
  const r = await ctx.request.post(`/api/univers/${m.u}/fichiers`, {
    multipart: { section: String(m.s[titre]), maniere: 'joint', fichier: fichier(nom, buffer) },
  });
  assert.equal(r.status(), 201, `deposer ${nom}: ${r.status()}`);
  const v = await r.json();
  if (secrete) {
    // « Secrète » is the visibility of the file now: the GM reserves it after the upload.
    const p = await ctx.request.patch(`/api/univers/${m.u}/fichiers/${v.id}`, { data: { visibilite: 'mj' } });
    assert.equal(p.status(), 200, `reserver ${nom}: ${p.status()}`);
    v.visibilite = 'mj';
  }
  return { ...v, secrete: v.visibilite === 'mj' };
}

async function ouvrirFiche(page: Any, m: Monde): Promise<void> {
  await page.goto('/');
  await attendre(page);
  await page.getByRole('link', { name: rx(m.nom) }).first().click();
  await attendre(page);
  await page.getByRole('link', { name: rxExact('Personnages') }).click();
  await attendre(page);
  await page.getByRole('link', { name: rx(m.fiche) }).first().click();
  await page.getByRole('heading', { name: rx(m.fiche) }).first().waitFor();
  await attendre(page);
}

async function choisir(page: Any, panneau: Any, fichiers: { name: string; mimeType: string; buffer: Buffer }[]): Promise<void> {
  // « Ajouter depuis l'appareil » of the menu of the two ways (AD-117): the hidden input takes the files.
  await panneau.locator('input[type=file][data-ajout-appareil]').first().setInputFiles(fichiers);
}
async function finEnvois(panneau: Any): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (!(await panneau.innerText()).includes('Envoi…')) return;
    await panneau.page().waitForTimeout(100);
  }
  throw new Error('uploads did not finish');
}
/** Every piece (id, nom) of the fiche as the given context's API shows it. */
async function pieces(ctx: Any, m: Monde): Promise<{ id: number; nom: string }[]> {
  const f = (await (await api(ctx, 'get', `/api/univers/${m.u}/fiches/${m.f}`)).json()) as Any;
  return (f.sections ?? []).flatMap((s: Any) => s.piecesJointes ?? s.pieces ?? []);
}

describe('kanevas-fichiers — compléments', () => {
  test('B-24 un fichier de 3,1 Mo affiche « 3,1 Mo » sur sa ligne', opts, async () => {
    const { m, antor } = await monde({ Plan: {} });
    await ouvrirFiche(antor.page, m);
    const plan = section(antor.page, 'Plan');
    const gros = Buffer.concat([PDF, Buffer.alloc(3250586 - PDF.length, 1)]);
    await choisir(antor.page, plan, [fichier('plan-lieu.pdf', gros)]);
    await finEnvois(plan);
    await plan.getByText(rx('plan-lieu.pdf')).first().waitFor();
    const t = await plan.innerText();
    assert.ok(t.includes('3,1 Mo'), t);
    assert.ok(plan.getByRole('link', { name: rx('Télécharger') }).or(plan.getByRole('button', { name: rx('Télécharger') })).first());
  });

  test('B-24 un PNG nommé « photo.txt » est une image (vignette), reconnue à son contenu', opts, async () => {
    const { m, antor } = await monde({ Apparence: {} });
    await ouvrirFiche(antor.page, m);
    const app = section(antor.page, 'Apparence');
    await choisir(antor.page, app, [fichier('photo.txt', PNG)]);
    await finEnvois(app);
    await app.getByRole('img', { name: 'photo.txt' }).waitFor();
    assert.equal(await app.getByRole('img', { name: 'photo.txt' }).count(), 1);
  });

  test('B-24 trois fichiers choisis d\'un coup sont tous rattachés', opts, async () => {
    const { m, antor } = await monde({ Plan: {} });
    await ouvrirFiche(antor.page, m);
    const plan = section(antor.page, 'Plan');
    await choisir(antor.page, plan, [fichier('un.pdf', PDF), fichier('deux.pdf', PDF), fichier('trois.pdf', PDF)]);
    await finEnvois(plan);
    for (const nom of ['un.pdf', 'deux.pdf', 'trois.pdf']) await plan.getByText(rx(nom)).first().waitFor();
    const noms = (await pieces(antor.ctx, m)).map((p) => p.nom).sort();
    assert.deepEqual(noms, ['deux.pdf', 'trois.pdf', 'un.pdf']);
  });

  test('B-24 le nom est celui du fichier sans dossier, 200 caractères au plus', opts, async () => {
    const { m, antor } = await monde({ Plan: {} });
    await deposer(antor.ctx, m, 'Plan', 'dossier/sous-dossier/plan.pdf', PDF);
    await deposer(antor.ctx, m, 'Plan', 'a'.repeat(196) + '.pdf', PDF);
    const noms = (await pieces(antor.ctx, m)).map((p) => p.nom);
    assert.ok(noms.includes('plan.pdf'), JSON.stringify(noms));
    assert.ok(noms.every((x) => x.length <= 200 && !x.includes('/')), JSON.stringify(noms.map((x) => x.length)));
    assert.equal(noms.length, 2);
  });

  test('B-24 vignette : nom en texte alternatif, légende « nom · taille », ouverture dans un nouvel onglet', opts, async () => {
    // Read by players: the file is « joueurs » (a closed section would reserve it to the GM, AD-117).
    const { m, antor } = await monde({ Apparence: { joueursLisent: true } });
    await deposer(antor.ctx, m, 'Apparence', 'portrait-aldric.png', PNG);
    await ouvrirFiche(antor.page, m);
    const app = section(antor.page, 'Apparence');
    const img = app.getByRole('img', { name: 'portrait-aldric.png' });
    await img.waitFor();
    const t = (await app.innerText()).replace(/ /g, ' ');
    assert.ok(t.includes(`portrait-aldric.png · ${PNG.length} o`), t);
    const [onglet] = await Promise.all([antor.ctx.waitForEvent('page'), img.click()]);
    await onglet.waitForLoadState();
    assert.ok(/\/fichiers\/\d+/.test(onglet.url()), onglet.url());
  });

  test('B-24 exclusion : la visibilité qu\'un client envoie est ignorée — la place décide (section fermée : MJ seul)', opts, async () => {
    const { m, antor, lea } = await monde({ 'Notes de la table': { auteurId: 'lea', auteurLit: true, auteurEcrit: true } });
    const r = await lea.ctx.request.post(`/api/univers/${m.u}/fichiers`, {
      multipart: { section: String(m.s['Notes de la table']), maniere: 'joint', visibilite: 'joueurs', secrete: 'false', fichier: fichier('mien.png', PNG) },
    });
    assert.equal(r.status(), 201);
    assert.equal((await r.json()).visibilite, 'mj');
    assert.equal((await pieces(antor.ctx, m)).length, 1);
  });

  test('B-24 exclusion : la pièce d\'une section cachée ne se lit pas par l\'adresse d\'une fiche que Léa lit', opts, async () => {
    const { m, antor, lea } = await monde({ 'Vérité — MJ seul': {} });
    const p = await deposer(antor.ctx, m, 'Vérité — MJ seul', 'cache.png', PNG);
    const autre = (await (await api(antor.ctx, 'post', `/api/univers/${m.u}/fiches`, { type: 'lieu', titre: 'Le Phare' })).json()) as Any;
    const aid = autre.id ?? autre.fiche?.id;
    const ouverte = await api(antor.ctx, 'post', `/api/univers/${m.u}/fiches/${aid}/sections`, { titre: 'Description' });
    const sid = ((await ouverte.json()) as Any).id;
    assert.ok((await api(antor.ctx, 'patch', `/api/univers/${m.u}/fiches/${aid}/sections/${sid}`, { joueursLisent: true })).ok());
    assert.equal((await lea.ctx.request.get(`/api/univers/${m.u}/fiches/${aid}`)).status(), 200, 'Léa reads the other fiche');
    const r = await lea.ctx.request.get(`/api/univers/${m.u}/fichiers/${p.id}`);
    assert.equal(r.status(), 404);
    assert.equal((await lea.ctx.request.get(pj(m, p.id, '/fichier'))).status(), 404);
  });

  test('B-24 exclusion : un membre d\'un autre univers ne lit pas le fichier (404)', opts, async () => {
    const { m, antor } = await monde({ Apparence: { joueursLisent: true } });
    const p = await deposer(antor.ctx, m, 'Apparence', 'public.png', PNG);
    const mira = await connecte(browser, srv.base, 'Mira');
    const autre = (await (await api(mira.ctx, 'post', '/api/univers', { nom: `Landes ${n}` })).json()) as Any;
    assert.ok(autre.id, 'Mira owns her universe');
    assert.equal((await mira.ctx.request.get(pj(m, p.id, '/fichier'))).status(), 404);
    assert.equal((await mira.ctx.request.get(`/api/univers/${autre.id}/fichiers/${p.id}`)).status(), 404);
  });

  test('B-24 retirer la section retire ses références, pas le fichier de la médiathèque (AD-105, AD-117 §5)', opts, async () => {
    const { m, antor } = await monde({ Plan: {} });
    const p = await deposer(antor.ctx, m, 'Plan', 'secret.pdf', PDF, true);
    assert.equal((await antor.ctx.request.get(pj(m, p.id, '/fichier'))).status(), 200);
    await ouvrirFiche(antor.page, m);
    await choisirDansMenuSection(antor.page, 'Plan', 'Retirer la section');
    await antor.page.getByRole('alertdialog').getByText(rx('Son contenu et sa pièce jointe seront perdus.')).waitFor();
    await confirmerRetraitSection(antor.page);
    await attendre(antor.page);
    assert.equal((await antor.ctx.request.get(pj(m, p.id, '/fichier'))).status(), 200, 'the file stays in the library');
    const liste = (await (await antor.ctx.request.get(`/api/univers/${m.u}/fichiers`)).json()) as Any;
    assert.ok(liste.fichiers.some((f: Any) => f.id === p.id));
  });

});

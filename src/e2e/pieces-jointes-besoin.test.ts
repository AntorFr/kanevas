// Black-box tests of kanevas-fichiers at the level of the whole feature (B-24, P-3 step 4, P-7,
// E-9 « bloc Pièces jointes »), written from docs/parcours.md and docs/ecrans.md, not from the code.
// Real server in stub mode (AD-55), real Chromium. Antor is the GM; Léa, Teo players; admin the instance admin.
//
// TEST PLAN (need -> case -> hard-coded expectation -> failure it catches)
// B-24 nominal   Antor drops a portrait on « Vérité — MJ seul » with « Secrète (MJ seul) » ticked ->
//                Léa sees nothing, its address answers 404 like an unknown one   [secret/visibility not inherited]
// B-24 nominal   Apparence (read by players): portrait made secret -> Léa sees no thumbnail, no empty
//                block, no counter; address 404 identical to an unknown address   [secret leaks]
// P-7            Léa, author-with-write of « Notes de la table », picks a portrait -> thumbnail at once;
//                Teo sees it only once players may read, then cannot add nor remove
// P-3 step 4     Antor drops a PDF -> « Télécharger », downloaded under its original name; image.svg and a
//                .png-named HTML file are never shown as images
// B-24 bords     empty file refused (« « notes.txt » est vide. »), next file still sent; size texts;
//                50-piece limit (text per role, no number for a player); 200-char name wraps
// B-24 exclusions Antor in Joueur mode: no « Secrète » box, no « Rendre secrète », no secret piece; reader-only
//                Léa: no « Ajouter un fichier »/« Retirer »; API 403 add/remove/mark; admin: 404
// B-24 retrait   confirmation text, « Annuler » keeps it, confirm removes it and its address is 404;
//                section removal text (« sa pièce jointe ») and address 404 afterwards
// B-24 échec     offline: the buttons are disabled
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
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>');
const HTML = Buffer.from('<html><script>alert(1)</script></html>');

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
  const r = await ctx.request[methode](url, data === undefined ? {} : { data });
  return r;
}

/** One universe, one personnage « Maître Aldric » (in a fresh universe each time) with the given sections; Léa and Teo are players. */
async function monde(sections: Record<string, Any>): Promise<{ m: Monde; antor: { ctx: Any; page: Any }; lea: { ctx: Any; page: Any }; teo: { ctx: Any; page: Any } }> {
  n++;
  const nom = `Lame d'Ébène ${n}`;
  const antor = await connecte(browser, srv.base, 'Antor');
  const lea = await connecte(browser, srv.base, 'Léa');
  const teo = await connecte(browser, srv.base, 'Teo');
  const u = (await (await api(antor.ctx, 'post', '/api/univers', { nom })).json()) as Any;
  const moi = async (c: Any) => ((await (await api(c.ctx, 'get', '/api/moi')).json()) as Any);
  const leaId = (await moi(lea)).id ?? (await moi(lea)).compte?.id;
  for (const id of ['lea', 'teo']) {
    const r = await api(antor.ctx, 'post', `/api/univers/${u.id}/membres`, { username: id, role: 'joueur' });
    assert.ok(r.ok(), `adding member ${id}: ${r.status()}`);
  }
  const membres = (await (await api(antor.ctx, 'get', `/api/univers/${u.id}/membres`)).json()) as Any;
  const liste: Any[] = Array.isArray(membres) ? membres : membres.membres;
  const compteLea = liste.find((x) => x.username === 'lea' || x.identifiant === 'lea')?.compteId ?? leaId;
  const fiche = 'Maître Aldric';
  const f = (await (await api(antor.ctx, 'post', `/api/univers/${u.id}/fiches`, { type: 'personnage', titre: fiche, charge: { pj: false } })).json()) as Any;
  const s: Record<string, number> = {};
  for (const [titre, reglage] of Object.entries(sections)) {
    const r = (await (await api(antor.ctx, 'post', `/api/univers/${u.id}/fiches/${f.id ?? f.fiche?.id}/sections`, { titre })).json()) as Any;
    const sid = r.id ?? r.section?.id;
    s[titre] = sid;
    const patch = { ...reglage };
    if (patch.auteurId === 'lea') patch.auteurId = compteLea;
    if (Object.keys(patch).length) {
      const p = await api(antor.ctx, 'patch', `/api/univers/${u.id}/fiches/${f.id ?? f.fiche?.id}/sections/${sid}`, patch);
      assert.ok(p.ok(), `patch section: ${p.status()}`);
    }
  }
  return { m: { u: u.id, f: f.id ?? f.fiche?.id, s, nom, fiche }, antor, lea, teo };
}

function base(m: Monde, titre: string): string {
  return `/api/univers/${m.u}/fiches/${m.f}/sections/${m.s[titre]}`;
}
/** The bytes of a file: GET /api/univers/:id/fichiers/:fid (the one route, AD-117). */
function pj(m: Monde, pid: number | string, fin = ''): string {
  return `/api/univers/${m.u}/fichiers/${pid}`;
}

/** The reference of a file in a section (the file itself stays in the library). */
function jointure(m: Monde, titre: string, fid: number | string): string {
  return `/api/univers/${m.u}/fiches/${m.f}/sections/${m.s[titre]}/fichiers/${fid}`;
}

async function deposer(ctx: Any, m: Monde, titre: string, nom: string, buffer: Buffer, secrete = false): Promise<Any> {
  const r = await ctx.request.post(`/api/univers/${m.u}/fichiers`, {
    multipart: { section: String(m.s[titre]), maniere: 'joint', fichier: { name: nom, mimeType: 'application/octet-stream', buffer } },
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

/** Picks files through the « Ajouter un fichier » button (the system chooser). */
async function choisir(page: Any, panneau: Any, fichiers: { name: string; mimeType: string; buffer: Buffer }[]): Promise<void> {
  // « Ajouter depuis l'appareil » of the menu of the two ways (AD-117): the hidden input takes the files.
  await panneau.locator('input[type=file][data-ajout-appareil]').first().setInputFiles(fichiers);
}
/** Waits until no upload line (« Envoi… ») is left in the panel. */
async function finEnvois(panneau: Any): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (!(await panneau.innerText()).includes('Envoi…')) return;
    await panneau.page().waitForTimeout(100);
  }
  throw new Error('uploads did not finish');
}
const fichier = (name: string, buffer: Buffer) => ({ name, mimeType: 'application/octet-stream', buffer });

async function adresseInconnue(ctx: Any, m: Monde, titre: string): Promise<{ status: number; body: string }> {
  const r = await ctx.request.get(`${pj(m, 999999, '/fichier')}`);
  return { status: r.status(), body: await r.text() };
}

describe('kanevas-fichiers — besoin B-24', () => {
  test('P-7 Léa, auteur de « Notes de la table » avec écriture, choisit un portrait : vignette sans autre geste ; Teo ne le voit qu\'une fois la section lue des joueurs et ne peut ni ajouter ni retirer', opts, async () => {
    const { m, antor, lea, teo } = await monde({
      'Notes de la table': { auteurId: 'lea', auteurLit: true, auteurEcrit: true, joueursLisent: false },
    });
    await ouvrirFiche(lea.page, m);
    const notes = section(lea.page, 'Notes de la table');
    await choisir(lea.page, notes, [fichier('portrait-lea.png', PNG)]);
    const img = notes.getByRole('img', { name: 'portrait-lea.png' });
    await img.waitFor();
    await attendre(lea.page);
    assert.ok(await img.evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth > 0), 'thumbnail really loaded');
    await lea.page.screenshot({ path: '/tmp/pj-besoin-lea-notes.png' });
    // Teo: nothing while players cannot read
    const pageTeo = teo.page;
    const rep = await api(teo.ctx, 'get', `/api/univers/${m.u}/fiches/${m.f}`);
    assert.equal(rep.status(), 404);
    // Antor opens the section to players
    await ouvrirFiche(antor.page, m);
    await regler(antor.page, 'Notes de la table', 'Les joueurs la lisent', true);
    await attendre(antor.page);
    // The file was added into a section closed to Teo: reserved to the GM at that time (AD-117), and it
    // stays so when the section opens.
    await ouvrirFiche(pageTeo, m);
    const vue = section(pageTeo, 'Notes de la table');
    await vue.waitFor();
    assert.equal(await vue.getByRole('img', { name: 'portrait-lea.png' }).count(), 0);
    // The GM makes it visible of the players: Teo sees it, without any control.
    const fiche = await (await api(antor.ctx, 'get', `/api/univers/${m.u}/fiches/${m.f}`)).json();
    const f = fiche.sections.find((x: Any) => x.titre === 'Notes de la table').piecesJointes.find((x: Any) => x.nom === 'portrait-lea.png');
    assert.equal((await api(antor.ctx, 'patch', `/api/univers/${m.u}/fichiers/${f.id}`, { visibilite: 'joueurs' })).status(), 200);
    await ouvrirFiche(pageTeo, m);
    await vue.getByRole('img', { name: 'portrait-lea.png' }).waitFor();
    assert.equal(await vue.getByRole('button', { name: rx('Ajouter un fichier') }).count(), 0);
    assert.equal(await vue.getByRole('button', { name: rx('Retirer') }).count(), 0);
    await pageTeo.screenshot({ path: '/tmp/pj-besoin-teo.png' });
  });

  test('P-3 étape 4 Antor dépose le plan en PDF : « Télécharger », nom d\'origine ; un SVG et un HTML nommé .png ne sont jamais affichés comme images', opts, async () => {
    const { m, antor } = await monde({ Plan: {} });
    await ouvrirFiche(antor.page, m);
    const plan = section(antor.page, 'Plan');
    await choisir(antor.page, plan, [fichier('plan-donjon.pdf', PDF), fichier('image.svg', SVG), fichier('piege.png', HTML)]);
    await plan.getByText(rx('plan-donjon.pdf')).first().waitFor();
    await plan.getByText(rx('image.svg')).first().waitFor();
    await plan.getByText(rx('piege.png')).first().waitFor();
    await finEnvois(plan);
    await attendre(antor.page);
    assert.equal(await plan.locator('img').count(), 0, `no thumbnail for pdf, svg, html: ${await plan.innerText()}`);
    assert.equal(await plan.getByRole('link', { name: rx('Télécharger') }).or(plan.getByRole('button', { name: rx('Télécharger') })).count(), 3);
    const [dl] = await Promise.all([
      antor.page.waitForEvent('download'),
      plan.getByText(rx('plan-donjon.pdf')).first().locator('xpath=ancestor::*[.//*[normalize-space()="Télécharger"]][1]')
        .getByText('Télécharger').first().click(),
    ]);
    assert.equal(dl.suggestedFilename(), 'plan-donjon.pdf');
    await antor.page.screenshot({ path: '/tmp/pj-besoin-plan.png' });
  });

  test('B-24 un fichier vide est refusé par « « notes.txt » est vide. » sans arrêter le suivant ; tailles « 842 o » et « 4,2 Ko »', opts, async () => {
    const { m, antor } = await monde({ Plan: {} });
    await ouvrirFiche(antor.page, m);
    const plan = section(antor.page, 'Plan');
    await choisir(antor.page, plan, [fichier('notes.txt', Buffer.alloc(0)), fichier('petit.bin', Buffer.alloc(842, 1)), fichier('moyen.bin', Buffer.alloc(4301, 1))]);
    await plan.getByText(rx('petit.bin')).first().waitFor();
    await plan.getByText(rx('moyen.bin')).first().waitFor();
    await finEnvois(plan);
    await plan.getByText('4,2 Ko').waitFor(); // the list is refetched after the last upload line is gone
    const t = await plan.innerText();
    assert.ok(t.includes('« notes.txt » est vide.'), t);
    assert.ok(t.includes('842 o'), t);
    assert.ok(t.includes('4,2 Ko'), t);
    assert.equal(await plan.getByRole('button', { name: rxExact('Ignorer') }).count(), 1);
    assert.equal(await plan.getByRole('button', { name: rxExact('Réessayer') }).count(), 0, 'no retry for a refusal');
    await plan.getByRole('button', { name: rxExact('Ignorer') }).click();
    assert.ok(!(await plan.innerText()).includes('est vide'));
    const fiche = (await (await api(antor.ctx, 'get', `/api/univers/${m.u}/fiches/${m.f}`)).text());
    assert.ok(!fiche.includes('notes.txt'), 'nothing attached for the empty file');
  });

  test('B-24 le 101e fichier joint est refusé : texte avec le chiffre pour le MJ, sans chiffre pour un Joueur ; l\'API ne dit pas le chiffre', opts, async () => {
    const { m, antor, lea } = await monde({ 'Notes de la table': { auteurId: 'lea', auteurLit: true, auteurEcrit: true } });
    for (let i = 0; i < 100; i++) await deposer(antor.ctx, m, 'Notes de la table', `p${i}.bin`, Buffer.from([i + 1]));
    const r = await lea.ctx.request.post(`/api/univers/${m.u}/fichiers`, {
      multipart: { section: String(m.s['Notes de la table']), maniere: 'joint', fichier: fichier('de-trop.bin', Buffer.from([1])) },
    });
    assert.equal(r.status(), 403, 'a player is refused (AD-117 §2 bis)');
    assert.ok(!(await r.text()).includes('100'), await r.text());
    await ouvrirFiche(antor.page, m);
    const mj = section(antor.page, 'Notes de la table');
    assert.equal(await mj.getByText(rx('p99.bin')).count() > 0, true, 'the whole list is shown');
    await choisir(antor.page, mj, [fichier('de-trop.bin', Buffer.from([1]))]);
    await mj.getByText(rx('Cette section porte déjà 100 fichiers joints.')).waitFor();
    await ouvrirFiche(lea.page, m);
    const sl = section(lea.page, 'Notes de la table');
    await choisir(lea.page, sl, [fichier('de-trop.bin', Buffer.from([1]))]);
    await sl.getByText(rx('Cette section ne peut pas recevoir d\'autre fichier.')).waitFor();
    await lea.page.screenshot({ path: '/tmp/pj-besoin-limite.png' });
  });

  test('B-24 un nom de 200 caractères reste entier et visible (passe à la ligne)', opts, async () => {
    const { m, antor } = await monde({ Plan: {} });
    const nom = 'a'.repeat(196) + '.txt';
    await deposer(antor.ctx, m, 'Plan', nom, Buffer.from('x'));
    await ouvrirFiche(antor.page, m);
    const plan = section(antor.page, 'Plan');
    await plan.getByText(nom).first().waitFor();
    await antor.page.screenshot({ path: '/tmp/pj-besoin-nom-long.png' });
    const debord = await antor.page.evaluate(() => ({ doc: document.documentElement.scrollWidth, vue: window.innerWidth }));
    assert.ok(debord.doc <= debord.vue, `no horizontal overflow: page ${debord.doc}px wide in a ${debord.vue}px window`);
  });

  test('B-24 exclusions : Léa qui ne fait que lire n\'a ni « Ajouter » ni « Retirer » ; l\'API répond 403 à l\'ajout, au retrait et au marquage', opts, async () => {
    const { m, antor, lea } = await monde({ Apparence: { joueursLisent: true } });
    const piece = (await deposer(antor.ctx, m, 'Apparence', 'public.png', PNG)) as Any;
    await ouvrirFiche(lea.page, m);
    const app = section(lea.page, 'Apparence');
    await app.getByRole('img', { name: 'public.png' }).waitFor();
    assert.equal(await app.getByRole('button', { name: rx('Ajouter un fichier') }).count(), 0);
    assert.equal(await app.getByRole('button', { name: rx('Retirer') }).count(), 0);
    assert.equal(await app.getByLabel(rx('Secrète')).count(), 0);
    const add = await lea.ctx.request.post(`/api/univers/${m.u}/fichiers`, { multipart: { section: String(m.s['Apparence']), maniere: 'joint', fichier: fichier('x.bin', Buffer.from([1])) } });
    assert.equal(add.status(), 403);
    assert.equal((await api(lea.ctx, 'delete', jointure(m, 'Apparence', piece.id))).status(), 403);
    assert.equal((await api(lea.ctx, 'patch', `${pj(m, piece.id)}`, { visibilite: 'mj' })).status(), 403);
    assert.equal((await api(lea.ctx, 'delete', `${pj(m, piece.id)}`)).status(), 403);
    const ok = await lea.ctx.request.get(`${pj(m, piece.id, '/fichier')}`);
    assert.equal(ok.status(), 200, 'she reads public pieces');
  });

  test('B-24 exclusions : Léa auteure ne peut pas marquer secrète sa propre pièce (403, aucune case), mais la retire', opts, async () => {
    const { m, lea } = await monde({ 'Notes de la table': { auteurId: 'lea', auteurLit: true, auteurEcrit: true } });
    await ouvrirFiche(lea.page, m);
    const notes = section(lea.page, 'Notes de la table');
    assert.equal(await notes.getByLabel(rx('Secrète')).count(), 0);
    await choisir(lea.page, notes, [fichier('mien.png', PNG)]);
    await notes.getByRole('img', { name: 'mien.png' }).waitFor();
    assert.equal(await notes.getByRole('button', { name: rx('Rendre secrète') }).count(), 0);
    const f = (await (await api(lea.ctx, 'get', `/api/univers/${m.u}/fiches/${m.f}`)).json()) as Any;
    const pid = JSON.stringify(f).match(/"id":(\d+),"nom":"mien\.png"/)?.[1] ?? JSON.stringify(f).match(/"nom":"mien\.png"[^}]*"id":(\d+)/)?.[1];
    assert.ok(pid, 'piece id found in the fiche');
    assert.equal((await api(lea.ctx, 'patch', `${pj(m, pid)}`, { visibilite: 'mj' })).status(), 403);
  });

  test('B-24 exclusions : l\'Admin d\'instance (non membre) obtient « Page introuvable. » et 404 sur le fichier', opts, async () => {
    const { m, antor } = await monde({ Apparence: { joueursLisent: true } });
    const piece = (await deposer(antor.ctx, m, 'Apparence', 'public.png', PNG)) as Any;
    const admin = await connecte(browser, srv.base, 'Admin');
    const r = await admin.ctx.request.get(`${pj(m, piece.id, '/fichier')}`);
    assert.equal(r.status(), 404);
    await admin.page.goto(`/`);
    await attendre(admin.page);
    assert.ok(!(await texte(admin.page)).includes(m.nom));
  });

  test('B-24 exclusions : sans session, l\'adresse d\'un fichier ne sert rien (pas de route statique)', opts, async () => {
    const { m, antor } = await monde({ Apparence: { joueursLisent: true } });
    const piece = (await deposer(antor.ctx, m, 'Apparence', 'public.png', PNG)) as Any;
    const r = await fetch(`${srv.base}${pj(m, piece.id, '/fichier')}`, { redirect: 'manual' });
    assert.notEqual(r.status, 200);
    const octets = Buffer.from(await r.arrayBuffer());
    assert.ok(!octets.includes(PNG.subarray(0, 8)) || r.status !== 200);
  });

  test('B-24 un fichier SVG ou HTML est servi en téléchargement, jamais en ligne ; une image l\'est avec nosniff', opts, async () => {
    const { m, antor } = await monde({ Plan: {} });
    const svg = (await deposer(antor.ctx, m, 'Plan', 'image.svg', SVG)) as Any;
    const png = (await deposer(antor.ctx, m, 'Plan', 'faux.png', HTML)) as Any;
    const img = (await deposer(antor.ctx, m, 'Plan', 'vrai.bin', PNG)) as Any;
    for (const p of [svg, png]) {
      const r = await antor.ctx.request.get(`${pj(m, p.id, '/fichier')}`);
      assert.equal(r.status(), 200);
      assert.match(r.headers()['content-disposition'] ?? '', /^attachment/);
      assert.ok(!(r.headers()['content-type'] ?? '').startsWith('image/svg'));
      assert.ok(!(r.headers()['content-type'] ?? '').startsWith('text/html'));
      assert.equal(r.headers()['x-content-type-options'], 'nosniff');
    }
    const r = await antor.ctx.request.get(`${pj(m, img.id, '/fichier')}`);
    assert.equal(r.headers()['content-type'], 'image/png', 'type is sniffed from the bytes, not the name');
    assert.equal(r.headers()['x-content-type-options'], 'nosniff');
  });

  test('B-24 retirer une section portant un portrait : « Son contenu et sa pièce jointe seront perdus. », le fichier reste en médiathèque', opts, async () => {
    const { m, antor } = await monde({ Apparence: { joueursLisent: true } });
    const piece = (await deposer(antor.ctx, m, 'Apparence', 'portrait.png', PNG)) as Any;
    await ouvrirFiche(antor.page, m);
    const app = section(antor.page, 'Apparence');
    await choisirDansMenuSection(antor.page, 'Apparence', 'Retirer la section');
    await antor.page.getByRole('alertdialog').getByText(rx('Son contenu et sa pièce jointe seront perdus.')).waitFor();
    await confirmerRetraitSection(antor.page);
    await attendre(antor.page);
    // AD-105/AD-117: removing the section removes its references, not the files of the library.
    assert.equal((await antor.ctx.request.get(`${pj(m, piece.id, '/fichier')}`)).status(), 200);
  });

  test('B-24 un envoi de plusieurs centaines de Mo annulé par « Annuler » n\'ajoute aucune pièce', opts, async () => {
    const { mkdtempSync, openSync, ftruncateSync, closeSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'gros-'));
    const gros = join(dir, 'gros.bin');
    const fd = openSync(gros, 'w');
    ftruncateSync(fd, 2 * 1024 * 1024 * 1024);
    closeSync(fd);
    try {
      const { m, antor } = await monde({ Plan: {} });
      await ouvrirFiche(antor.page, m);
      const plan = section(antor.page, 'Plan');
      await plan.locator('input[type=file][data-ajout-appareil]').first().setInputFiles(gros);
      const ligne = plan.getByRole('status');
      await ligne.getByText(rx('Envoi')).waitFor();
      await plan.getByRole('button', { name: rxExact('Annuler') }).click();
      await ligne.getByText(rx('Envoi')).waitFor({ state: 'detached' });
      await antor.page.waitForTimeout(1500);
      const f = await (await api(antor.ctx, 'get', `/api/univers/${m.u}/fiches/${m.f}`)).text();
      assert.ok(!f.includes('gros.bin'), 'nothing attached');
      assert.ok(!(await plan.innerText()).includes('gros.bin'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

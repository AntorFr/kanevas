// Black-box second complements for kanevas-fichiers (B-24, E-9 « bloc Pièces jointes »), written from
// docs/ecrans.md only.
//
// TEST PLAN
// B-24 refus      write right withdrawn meanwhile, at REMOVAL -> « Vous ne pouvez plus ajouter de fichier à cette
//                 section. », « Retirer » gone, the piece is still attached        [removal skips the right check]
// B-24 exclusions GM in Joueur mode: « Retirer » only where players write (present on Journal, absent on Apparence)
//                 [mode switch ignored by the removal gesture]
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import {
  type Any, attendre, connecte, launch, rx, rxExact, section, skipBrowser, startServer, texte, type Server,
} from './harnais.test.ts';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

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
const pj = (m: Monde, pid: number | string, fin = '') => `/api/univers/${m.u}/fiches/${m.f}/pieces-jointes/${pid}${fin}`;
const fichier = (name: string, buffer: Buffer) => ({ name, mimeType: 'application/octet-stream', buffer });

async function deposer(ctx: Any, m: Monde, titre: string, nom: string, buffer: Buffer, secrete = false): Promise<Any> {
  const r = await ctx.request.post(`${base(m, titre)}/pieces-jointes`, {
    multipart: { secrete: String(secrete), fichier: fichier(nom, buffer) },
  });
  assert.equal(r.status(), 201, `deposer ${nom}: ${r.status()}`);
  return r.json();
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
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    panneau.getByRole('button', { name: rxExact('Ajouter un fichier') }).click(),
  ]);
  await chooser.setFiles(fichiers);
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

describe('kanevas-fichiers — compléments 2', () => {
  test('B-24 droit d\'écriture retiré entre-temps, au retrait : message, « Retirer » disparaît, la pièce reste', opts, async () => {
    const { m, antor, lea } = await monde({ 'Notes de la table': { auteurId: 'lea', auteurLit: true, auteurEcrit: true } });
    await deposer(lea.ctx, m, 'Notes de la table', 'mien.png', PNG);
    await ouvrirFiche(lea.page, m);
    const notes = section(lea.page, 'Notes de la table');
    await notes.getByRole('img', { name: 'mien.png' }).waitFor();
    const r = await api(antor.ctx, 'patch', base(m, 'Notes de la table'), { auteurEcrit: false });
    assert.ok(r.ok(), `withdraw write: ${r.status()}`);
    await notes.getByRole('button', { name: rx('Retirer « mien.png »') }).click();
    await notes.getByRole('button', { name: rxExact('Retirer le fichier') }).click();
    await lea.page.getByText(rx('Vous ne pouvez plus ajouter de fichier à cette section.')).waitFor();
    await attendre(lea.page);
    assert.equal(await section(lea.page, 'Notes de la table').getByRole('button', { name: rx('Retirer') }).count(), 0);
    assert.equal((await pieces(antor.ctx, m)).length, 1);
  });

  test('B-24 Antor en mode Joueur : « Retirer » seulement là où les joueurs écrivent', opts, async () => {
    const { m, antor } = await monde({ Apparence: { joueursLisent: true }, Journal: { joueursLisent: true, joueursEcrivent: true } });
    await deposer(antor.ctx, m, 'Apparence', 'a.png', PNG);
    await deposer(antor.ctx, m, 'Journal', 'j.png', PNG);
    await ouvrirFiche(antor.page, m);
    await antor.page.getByLabel('Mode Joueur').check();
    await attendre(antor.page);
    // the switch reloads the fiche: wait until the read-only section has lost its « Retirer », then assert
    await section(antor.page, 'Journal').getByRole('button', { name: rx('Retirer « j.png »') }).waitFor();
    await section(antor.page, 'Apparence').getByRole('button', { name: rx('Retirer') }).waitFor({ state: 'detached' });
    await attendre(antor.page);
    assert.equal(await section(antor.page, 'Journal').getByRole('button', { name: rx('Retirer « j.png »') }).count(), 1);
    assert.equal(await section(antor.page, 'Apparence').getByRole('button', { name: rx('Retirer') }).count(), 0);
  });
});

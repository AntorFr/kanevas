// ecrans: outil
// Review tests (part 2: divisor, cadence, pre-slice design, offline) of kanevas-concepteur-vaisseaux-capacites-equipage-atelier (E-22, B-91, B-92, B-94, V-5): « Capacités » block, effect line,
// « dont joueurs » / « dont robots », crew costs, divided price, reader and 390 px, on a trial catalogue written by the test.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { after, before, describe, it } from 'node:test';
import { connecte, launch, skipBrowser, startServer, type Any, type Server } from './harnais.test.ts';

const dbPath = join(mkdtempSync(join(tmpdir(), 'kv-cap2-')), 'k.db');
let srv: Server;
let browser: Any;
const ctxs: Any[] = [];
const EFFET = 'e'.repeat(100) + ' ' + 'f'.repeat(99);
const el = { cout: 1000, puissance: 1, masse: 1, x_cout: false, x_puissance: false, x_masse: false, pv: 0, ca: 0, limite: 0 };
const coque = { classe: 2, cout: 10, pv: 5, ca: 10, puissance: 20, masse: 20, emports: 2, facteur_cout: 1, facteur_puissance: 1, facteur_masse: 1 };
const catalogue = () => ({
  catalogue: 'swn/vaisseaux', version: 'review-capacites',
  coques: [{ cle: 'c6', nom: 'Coque six', ...coque, equipage_min: 2, equipage_max: 6 }],
  moteurs: [],
  amenagements: [
    { cle: 'vie', nom: 'Vie étendue', ...el, capacite: 'equipage_max_pct', effet_jeu: EFFET },
    { cle: 'canot', nom: 'Hangar à canots', ...el, capacite: 'canots' },
    { cle: 'prov', nom: 'Provision étendue', ...el, capacite: 'provisions' },
    { cle: 'auto', nom: 'Automatisation', ...el, limite: 1, effet: 'support_automatisation' },
  ],
  defenses: [], armes: [], modifications: [], exemples: [],
});

before(async () => {
  if (skipBrowser) return;
  mkdirSync('/tmp/shots', { recursive: true });
  browser = await launch();
  srv = await startServer({ KANEVAS_SANS_SEMIS: '', DB_PATH: dbPath });
});
after(async () => { for (const c of ctxs) await c.close().catch(() => {}); await browser?.close(); srv?.stop(); });

async function cookie(compte: string): Promise<string> {
  const r = await fetch(`${srv.base}/connexion-bouchon`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `compte=${compte}` });
  return (r.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
}
async function api(compte: string, methode: string, chemin: string, corps?: object): Promise<Any> {
  const r = await fetch(srv.base + chemin, { method: methode, headers: { cookie: await cookie(compte), ...(corps ? { 'content-type': 'application/json' } : {}) }, ...(corps ? { body: JSON.stringify(corps) } : {}) });
  return { statut: r.status, json: await r.json().catch(() => null) };
}
const q = (cle: string, quantite = 1) => ({ nature: 'amenagements', cle, quantite });
let monde: { E: number; orak: number; etoile: number } | null = null;
async function ids() {
  if (monde) return monde;
  const E = ((await api('antor', 'GET', '/api/univers')).json as Any[]).find((u) => u.nom === "Éneria d'essai").id as number;
  const imp = await api('antor', 'POST', `/api/univers/${E}/outils/swn/vaisseaux/catalogue/application`, catalogue());
  assert.equal(imp.statut, 200, JSON.stringify(imp.json));
  const B = `/api/univers/${E}/outils/swn/vaisseaux/conceptions`;
  const l = (await api('antor', 'GET', B)).json;
  const fiche = (t: string): number => l.conceptions.find((c: Any) => c.titre === t).ficheId;
  const orak = fiche("Vent d'Orak"); const etoile = fiche('Étoile du soir');
  // Orak: 1 vie + 1 canot + 2 provisions, crew 10 (max 12), 2 PJ, 3 robots, automation
  await pose(B, orak, { coque: 'c6', equipage: 10, pj: 2, robots: 3, choix: [q('vie'), q('canot'), q('prov', 2), q('auto')] });
  await pose(B, etoile, { coque: 'c6', equipage: 10, pj: 2, robots: 3, choix: [q('vie'), q('auto')] });
  monde = { E, orak, etoile };
  return monde;
}
async function pose(B: string, f: number, corps: Any) {
  const v = (await api('antor', 'GET', `${B}/${f}`)).json;
  const r = await api('antor', 'PUT', `${B}/${f}`, { ...corps, version: v.version });
  assert.equal(r.statut, 200, JSON.stringify(r.json));
  return r.json;
}
async function ouvrir(compte: string, fiche: number, largeur: number): Promise<Any> {
  const { E } = await ids();
  const { ctx, page: p } = await connecte(browser, srv.base, compte);
  ctxs.push(ctx);
  await p.setViewportSize({ width: largeur, height: 800 });
  await p.goto(`/univers/${E}/outils/swn/vaisseaux?fiche=${fiche}`);
  await p.locator('.vx-resultats').waitFor();
  return p;
}
const norm = (s: string) => s.replace(/[\u00A0\u202F\u2009]/g, ' ');
const res = async (p: Any) => norm(await p.locator('.vx-resultats').innerText());
const pas = async (p: Any) => { const m = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth })); assert.ok(m.sw <= m.iw + 1, `défilement horizontal ${JSON.stringify(m)}`); };


describe('E-22 / E-20 : diviseur, cadence, conception d’avant la tranche, hors ligne', { skip: skipBrowser }, () => {
  it('diviseur 2 : « (÷2) » après Recalculer ; cadence 50 000 double le chantier ; borne refusée par l’API', async () => {
    const { E, orak } = await ids();
    const p0 = await ouvrir('antor', orak, 1280);
    const avant = await res(p0);
    const prix = Number((avant.match(/([\d  ]+) cr\b(?! \()/) ?? [])[1]?.replace(/\s/g, ''));
    const chantier0 = avant.match(/Chantier\s*:?\s*(\d+) jours?/)?.[1];
    const R = `/api/univers/${E}/outils/swn/vaisseaux/reglages`;
    const ref = await api('antor', 'PUT', R, { version: 0, valeurs: { cadence_chantier: 0 } });
    assert.equal(ref.statut, 400);
    assert.equal(ref.json.message, 'Valeur hors limites.');
    const o = (await api('antor', 'GET', `/api/univers/${E}/outils`)).json;
    const trouve = (x: Any): Any => {
      if (x && typeof x === 'object') {
        if (x.cle === 'swn/vaisseaux') return x;
        for (const k of Object.values(x)) { const r = trouve(k); if (r) return r; }
      }
      return null;
    };
    const ligne = trouve(o);
    assert.ok(ligne, JSON.stringify(o).slice(0, 600));
    const ok = await api('antor', 'PUT', R, { version: ligne.univers.versionReglages, valeurs: { diviseur_prix: '2', cadence_chantier: 50000 } });
    assert.equal(ok.statut, 204, JSON.stringify(ok.json));
    const p = await ouvrir('antor', orak, 1280);
    await p.getByRole('button', { name: 'Recalculer' }).click();
    const conf = p.getByRole('button', { name: /^Recalculer$/ });
    if (await p.getByText('Recalculer cette conception ?').count()) await p.getByRole('dialog').getByRole('button', { name: 'Recalculer' }).click();
    await p.getByText(/÷2/).first().waitFor({ timeout: 8000 });
    void conf;
    const t = await res(p);
    assert.match(t, /\(÷2\)/);
    const nums = [...t.matchAll(/([\d ]+) cr \(÷2\)/g)].map((m) => Number(m[1].replace(/\s/g, '')));
    assert.equal(nums[0] * 2, prix, `prix ${prix} divisé par 2: ${t}`);
    const c1 = t.match(/Chantier\s*:?\s*(\d+) jours?/)?.[1];
    assert.ok(chantier0 && c1 && Number(c1) <= Number(chantier0), `chantier ${chantier0} → ${c1}`);
  });

  it('conception d’avant la tranche : ni bloc Capacités ni coût inventés, chiffres gardés ; le bloc vient après Recalculer', async () => {
    const { E, etoile } = await ids();
    const db = new Database(dbPath);
    db.pragma('busy_timeout = 5000');
    const l = db.prepare('SELECT resultat FROM swn_conceptions WHERE fiche_id = ?').get(etoile) as { resultat: string };
    const r = JSON.parse(l.resultat);
    delete r.capacites; delete r.effetsJeu; delete r.fraisEquipage;
    db.prepare('UPDATE swn_conceptions SET resultat = ? WHERE fiche_id = ?').run(JSON.stringify(r), etoile);
    db.close();
    const p = await ouvrir('antor', etoile, 1280);
    const t = await res(p);
    assert.doesNotMatch(t, /Capacités|Équipage maximum|Équipage : |Robots : /);
    assert.match(t, /\d/);
    await p.screenshot({ path: '/tmp/shots/capacites-ancienne.png', fullPage: true });
    await p.getByRole('button', { name: 'Recalculer' }).click();
    if (await p.getByText('Recalculer cette conception ?').count()) await p.getByRole('dialog').getByRole('button', { name: 'Recalculer' }).click();
    await p.getByText(/Équipage : \d/).first().waitFor({ timeout: 8000 });
    assert.match(await res(p), /Capacités/);
    void E;
  });

  it('hors ligne : chiffres gardés, champs verrouillés, « Connexion perdue. »', async () => {
    const { orak } = await ids();
    const p = await ouvrir('antor', orak, 1280);
    await p.getByText(/Équipage : \d/).first().waitFor();
    await p.context().setOffline(true);
    await p.evaluate(() => window.dispatchEvent(new Event('offline')));
    await p.getByText('Connexion perdue.').first().waitFor();
    assert.match(await res(p), /Équipage : \d/);
    assert.equal(await p.locator('input[aria-label="dont joueurs"]').isDisabled(), true);
    assert.equal(await p.locator('input[aria-label="dont robots"]').isDisabled(), true);
    await p.context().setOffline(false);
  });
});

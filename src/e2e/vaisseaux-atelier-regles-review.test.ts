// ecrans: outil
// Revue de kanevas-concepteur-vaisseaux-regles-calcul-atelier (E-22, B-88, B-90, B-94, V-5): navigateur piloté, catalogue d'essai écrit par le test.
// Attendus écrits à la main depuis la fiche : vitesse « −1 », « Vitesse : N/A », listes de moteurs vides sur station, alertes du serveur.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { connecte, launch, skipBrowser, startServer, type Any, type Server } from './harnais.test.ts';

let srv: Server;
let browser: Any;
const ctxs: Any[] = [];
const el = { cout: 1000, puissance: 1, masse: 1, x_cout: false, x_puissance: false, x_masse: false, pv: 0, ca: 0, limite: 0 };
const coque = { classe: 2, cout: 300000, pv: 5, ca: 10, puissance: 40, masse: 40, emports: 3, facteur_cout: 1, facteur_puissance: 1, facteur_masse: 1 };
const catalogue = (spikeStation = 0) => ({
  catalogue: 'swn/vaisseaux', version: 'rev-regles',
  coques: [
    { cle: 'lente', nom: 'Coque lente', ...coque, vitesse: 0, armure: 0 },
    { cle: 'station', nom: 'Station d’essai', ...coque, vitesse: 0, armure: 0, moteur_spike: spikeStation },
    { cle: 'ancienne', nom: 'Coque ancienne', ...coque, vitesse: 3, armure: 0 },
  ],
  moteurs: [{ cle: 'mot-1', nom: 'Moteur un', niveau: 1, ...el }],
  amenagements: [
    { cle: 'moteur-sys', nom: 'Moteur système', ...el, effet: 'moteur_systeme', rend_puissance: [2, 3, 4, 5], rend_masse: [1, 1.5, 2, 2.5] },
    { cle: 'cabine', nom: 'Cabine', ...el },
    { cle: 'cible', nom: 'Auto-ciblage', ...el, limite_par: 'armes' },
  ],
  defenses: [{ cle: 'rotors', nom: 'Rotors lourds', ...el, bonus_vitesse: -1 }],
  armes: [
    { cle: 'canon', nom: 'Canon simple', ...el, emport: 1, munitions: 0, cout_munition: 0 },
    { cle: 'lance', nom: 'Lance de classe 3', ...el, emport: 1, munitions: 0, cout_munition: 0, classe_min: 3 },
  ],
  modifications: [], exemples: [],
});
let cookieAntor = '';
let E = 0; let fiche = 0;
const B = () => `/api/univers/${E}/outils/swn/vaisseaux`;
async function api(methode: string, chemin: string, corps?: object): Promise<Any> {
  const r = await fetch(srv.base + chemin, { method: methode, headers: { cookie: cookieAntor, ...(corps ? { 'content-type': 'application/json' } : {}) }, ...(corps ? { body: JSON.stringify(corps) } : {}) });
  return { statut: r.status, json: await r.json().catch(() => null) };
}
before(async () => {
  if (skipBrowser) return;
  mkdirSync('/tmp/shots', { recursive: true });
  browser = await launch();
  srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
  const c = await fetch(`${srv.base}/connexion-bouchon`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'compte=antor' });
  cookieAntor = (c.headers.getSetCookie?.() ?? []).map((x) => x.split(';')[0]).join('; ');
  E = ((await api('GET', '/api/univers')).json as Any[]).find((u) => u.nom === "Éneria d'essai").id as number;
  const imp = await api('POST', `${B()}/catalogue/application`, catalogue());
  assert.equal(imp.statut, 200, JSON.stringify(imp.json));
  fiche = (await api('GET', `${B()}/conceptions`)).json.conceptions.find((x: Any) => x.titre === "Vent d'Orak").ficheId;
});
after(async () => { for (const c of ctxs) await c.close().catch(() => {}); await browser?.close(); srv?.stop(); });

async function poser(corps: object) {
  const v = (await api('GET', `${B()}/conceptions/${fiche}`)).json;
  const r = await api('PUT', `${B()}/conceptions/${fiche}`, { ...corps, version: v.version });
  assert.equal(r.statut, 200, JSON.stringify(r.json));
}
async function ouvrir(largeur: number): Promise<Any> {
  const { ctx, page } = await connecte(browser, srv.base, 'antor');
  ctxs.push(ctx);
  await page.setViewportSize({ width: largeur, height: 900 });
  await page.goto(`/univers/${E}/outils/swn/vaisseaux?fiche=${fiche}`);
  await page.locator('.vx-resultats').waitFor();
  return page;
}
const norm = (s: string) => s.replace(/[  ]/g, ' ');
const res = async (p: Any) => norm(await p.locator('.vx-resultats').innerText());
const corps = async (p: Any) => norm(await p.locator('body').innerText());
const enregistrer = (p: Any) => p.getByRole('button', { name: 'Enregistrer' });
async function ajouter(p: Any, ouvreur: string, nom: string) {
  await p.getByRole('button', { name: ouvreur }).first().click();
  await p.locator('li').filter({ hasText: nom }).last().getByRole('button').first().click();
  await p.getByRole('button', { name: `Retirer : ${nom}` }).waitFor();
}
const textePresent = (p: Any, re: RegExp) => p.waitForFunction((src: string) => new RegExp(src).test(document.body.innerText.replace(/[  ]/g, ' ')), re.source, { timeout: 15000 });

for (const largeur of [1280, 390]) {
  describe(`E-22 règles de calcul, ${largeur} px`, { skip: skipBrowser, timeout: 240000 }, () => {
    it('vitesse 0 et bonus −1 : « −1 » et alerte à surveiller', async () => {
      await poser({ coque: 'lente', choix: [{ nature: 'defenses', cle: 'rotors', quantite: 1 }] });
      const p = await ouvrir(largeur);
      await textePresent(p, /Vitesse\s*−1/);
      await textePresent(p, /Vitesse négative : malus aux jets de Pilotage/);
      assert.doesNotMatch(await res(p), /Vitesse\s*-1/);
      await p.screenshot({ path: `/tmp/shots/regles-${largeur}-vitesse.png`, fullPage: true });
    });

    it('station : « Vitesse : N/A », aucun moteur proposé, pas d’alerte moteur absent', async () => {
      await poser({ coque: 'station', choix: [] });
      const p = await ouvrir(largeur);
      assert.match(await res(p), /Vitesse\s*:?\s*N\/A/);
      assert.doesNotMatch(await corps(p), /Aucun moteur de saut/);
      await p.getByRole('button', { name: 'Ajouter un moteur' }).first().click();
      await p.getByRole('group', { name: 'Ajouter un moteur' }).waitFor();
      assert.doesNotMatch(await corps(p), /Moteur un/);
      await p.getByRole('button', { name: 'Ajouter un aménagement' }).first().click();
      await p.locator('li').filter({ hasText: 'Cabine' }).last().waitFor();
      assert.doesNotMatch(await corps(p), /Moteur système/);
      await p.screenshot({ path: `/tmp/shots/regles-${largeur}-station.png`, fullPage: true });
    });

    it('conception enregistrée avec moteur sur station : ouverte telle quelle, bloquante au premier changement', async () => {
      // the API refuses to save it on a station: it is written while the hull still has a Spike drive, then the catalogue turns it into a station
      assert.equal((await api('POST', `${B()}/catalogue/application`, { ...catalogue(1), version: 'rev-regles-0' })).statut, 200);
      await poser({ coque: 'station', choix: [{ nature: 'moteurs', cle: 'mot-1', quantite: 1 }] });
      assert.equal((await api('POST', `${B()}/catalogue/application`, { ...catalogue(0), version: 'rev-regles-1' })).statut, 200);
      const p = await ouvrir(largeur);
      assert.doesNotMatch(await corps(p), /une station n'a pas de moteur/);
      await ajouter(p, 'Ajouter un aménagement', 'Cabine');
      await textePresent(p, /« Moteur un » : une station n'a pas de moteur de saut ni de moteur système\./);
      assert.equal(await enregistrer(p).isDisabled(), true);
      await p.screenshot({ path: `/tmp/shots/regles-${largeur}-moteur-station.png`, fullPage: true });
    });

    it('arme de classe 3 sur coque de classe 2 : bloquante, retirée on enregistre', async () => {
      await poser({ coque: 'ancienne', choix: [] });
      const p = await ouvrir(largeur);
      await ajouter(p, 'Ajouter une arme', 'Lance de classe 3');
      await textePresent(p, /« Lance de classe 3 » : classe de coque 3 au moins\./);
      assert.equal(await enregistrer(p).isDisabled(), true);
      await p.getByRole('button', { name: 'Retirer : Lance de classe 3' }).click();
      await p.waitForFunction(() => !/classe de coque 3 au moins/.test(document.body.innerText), null, { timeout: 15000 });
      await ajouter(p, 'Ajouter une arme', 'Canon simple');
      await p.waitForFunction(() => !(Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Enregistrer') as HTMLButtonElement)?.disabled, null, { timeout: 15000 });
      const rep = p.waitForResponse((r: Any) => r.request().method() === 'PUT' && r.url().includes('/conceptions/'));
      await enregistrer(p).click();
      assert.equal((await rep).status(), 200);
    });

    it('auto-ciblage : deux pour une arme bloquent, une seconde arme lève l’alerte', async () => {
      await poser({ coque: 'ancienne', choix: [{ nature: 'armes', cle: 'canon', quantite: 1 }] });
      const p = await ouvrir(largeur);
      await ajouter(p, 'Ajouter un aménagement', 'Auto-ciblage');
      await p.getByRole('button', { name: 'Ajouter : Aménagements' }).click();
      await p.locator('li').filter({ hasText: 'Auto-ciblage' }).getByRole('button', { name: /^Ajouter / }).click();
      await textePresent(p, /Limite dépassée : 2 système\(s\) d'auto-ciblage pour 1 arme\(s\)/);
      assert.equal(await enregistrer(p).isDisabled(), true);
      await p.screenshot({ path: `/tmp/shots/regles-${largeur}-cible.png`, fullPage: true });
      await p.getByRole('button', { name: 'Ajouter : Armes' }).click();
      await p.locator('li').filter({ hasText: 'Canon simple' }).getByRole('button', { name: /^Ajouter / }).click();
      await p.waitForFunction(() => !/Limite dépassée/.test(document.body.innerText), null, { timeout: 15000 });
    });

    it('conception d’avant la tranche : chiffres enregistrés, aucune alerte neuve sans changement', async () => {
      await poser({ coque: 'ancienne', choix: [] });
      const p = await ouvrir(largeur);
      assert.match(await res(p), /Vitesse\s*3/);
      assert.doesNotMatch(await corps(p), /Vitesse négative|N\/A|Limite dépassée/);
    });
  });
}

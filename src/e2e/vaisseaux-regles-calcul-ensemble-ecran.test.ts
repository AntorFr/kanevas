// ecrans: outil
// Tests d'ensemble (écran E-22) de kanevas-concepteur-vaisseaux-regles-calcul (B-90, H-1, P-19): navigateur piloté, catalogue d'essai écrit par le test.
// Les effets (arrondi, stations, auto-ciblage, vitesse, classe) sont prouvés à leur porte dans `src/routes/vaisseaux-regles-calcul-ensemble-api-lot-vaisseaux.test.ts` ;
// ici ce que le MJ lit : la masse libre d'un croiseur de masse 30 et de facteur de masse 3 portant trois « Atelier » (masse 0,5 #) est « 24 », jamais « 25,5 » ni « 25 ».
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { connecte, launch, skipBrowser, startServer, type Any, type Server } from './harnais.test.ts';

let srv: Server;
let browser: Any;
const ctxs: Any[] = [];
const el = { cout: 0, puissance: 0, masse: 0, x_cout: false, x_puissance: false, x_masse: false, pv: 0, ca: 0, limite: 0 };
const catalogue = {
  catalogue: 'swn/vaisseaux', version: 'ens-calcul-1',
  coques: [
    { cle: 'croiseur-f3', nom: 'Croiseur F3', classe: 2, cout: 300000, pv: 20, ca: 12, puissance: 30, masse: 30, emports: 4, facteur_cout: 1, facteur_puissance: 1, facteur_masse: 3, vitesse: 3, armure: 5 },
    { cle: 'fregate-f2', nom: 'Frégate F2', classe: 1, cout: 300000, pv: 20, ca: 12, puissance: 30, masse: 30, emports: 4, facteur_cout: 1, facteur_puissance: 1, facteur_masse: 2, vitesse: 3, armure: 5 },
  ],
  moteurs: [], defenses: [], armes: [], modifications: [], exemples: [],
  amenagements: [{ cle: 'atelier', nom: 'Atelier', ...el, masse: 0.5, x_masse: true }],
};
let cookieLea = '';
let E = 0; let fiche = 0;
const B = () => `/api/univers/${E}/outils/swn/vaisseaux`;
const api = async (methode: string, chemin: string, corps?: object): Promise<Any> => {
  const r = await fetch(srv.base + chemin, { method: methode, headers: { cookie: cookieLea, ...(corps ? { 'content-type': 'application/json' } : {}) }, ...(corps ? { body: JSON.stringify(corps) } : {}) });
  return { statut: r.status, json: await r.json().catch(() => null) };
};
before(async () => {
  if (skipBrowser) return;
  mkdirSync('/tmp/shots', { recursive: true });
  browser = await launch();
  srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
  const connexion = async (compte: string) => {
    const c = await fetch(`${srv.base}/connexion-bouchon`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `compte=${compte}` });
    return (c.headers.getSetCookie?.() ?? []).map((x) => x.split(';')[0]).join('; ');
  };
  const antor = await connexion('antor');
  cookieLea = await connexion('lea');
  E = ((await api('GET', '/api/univers')).json as Any[]).find((u) => u.nom === "Éneria d'essai").id as number;
  const imp = await fetch(`${srv.base}${B()}/catalogue/application`, { method: 'POST', headers: { cookie: antor, 'content-type': 'application/json' }, body: JSON.stringify(catalogue) });
  assert.equal(imp.status, 200, await imp.text());
  fiche = (await api('GET', `${B()}/conceptions`)).json.conceptions.find((x: Any) => x.titre === 'Étoile du soir').ficheId;
});
after(async () => { for (const c of ctxs) await c.close().catch(() => {}); await browser?.close(); srv?.stop(); });

const norm = (s: string) => s.replace(/[  ]/g, ' ');
for (const largeur of [1280, 390]) {
  describe(`E-22 arrondi du dièse, ${largeur} px`, { skip: skipBrowser, timeout: 240000 }, () => {
    it('trois « Atelier » sur le croiseur : masse libre « 24 » ; un seul « Atelier » sur la frégate de facteur 2 : « 29 »', async () => {
      for (const [coque, quantite, attendu] of [['croiseur-f3', 3, '24'], ['fregate-f2', 1, '29']] as const) {
        const v = (await api('GET', `${B()}/conceptions/${fiche}`)).json;
        const s = await api('PUT', `${B()}/conceptions/${fiche}`, { coque, choix: [{ nature: 'amenagements', cle: 'atelier', quantite }], version: v.version });
        assert.equal(s.statut, 200, JSON.stringify(s.json));
        const { ctx, page } = await connecte(browser, srv.base, 'antor');
        ctxs.push(ctx);
        await page.setViewportSize({ width: largeur, height: 900 });
        await page.goto(`/univers/${E}/outils/swn/vaisseaux?fiche=${fiche}`);
        await page.locator('.vx-resultats').waitFor();
        await page.waitForFunction((src: string) => new RegExp(src).test(document.querySelector('.vx-resultats')!.textContent!.replace(/[  ]/g, ' ')), `Masse libre\\s*:?\\s*${attendu}(?![\\d,])`, { timeout: 15000 });
        assert.doesNotMatch(norm(await page.locator('.vx-resultats').innerText()), /Masse libre\s*:?\s*(25|25,5|27|28,5)(?![\d])/);
        await page.screenshot({ path: `/tmp/shots/ens-calcul-${largeur}-${coque}.png`, fullPage: true });
      }
    });
  });
}

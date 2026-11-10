// Feature-level browser test of kanevas-outils-format-vaisseaux-fiches (B-82, E-22): the captions of the choice rows.
// Written from docs/ecrans.md (« Choice rows »). Expected values are literals, calculated by hand; the trial catalogue is
// written here and absent from the seed. Selectors are roles and visible texts.
//
// TEST PLAN (world « Éneria d'essai », Léa Player author of « Étoile du soir »)
// B-82 nominal : a hull row reads « vitesse 3 · armure 5 · équipage 6 à 20 »; a defence row « vitesse +1 »; a weapon row
//                « dégâts 1d8 · PA 3 · qualités : Bruyant · NT 3 »; fittings « classe 2 à 3 », « classe 3 au moins »,
//                « classe 2 au plus », « classe 2 seulement », plus the condition as plain text
//   bords      : a weapon that states only its damage shows « dégâts 1d8 » with no « PA », « qualités » nor « NT »
//   exclusion  : a fitting that states nothing (and a hull that states nothing) shows no « classe », « vitesse », « — » in its row
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { connecte, launch, skipBrowser, startServer, type Any, type Server } from './harnais.test.ts';

mkdirSync('/tmp/shots', { recursive: true });
const SHOTS = '/tmp/shots/vaisseaux-fiches-legendes';
const el = { cout: 1000, puissance: 1, masse: 1, x_cout: false, x_puissance: false, x_masse: false, pv: 0, ca: 0, limite: 0 };
const coque = { cout: 100000, pv: 20, ca: 12, puissance: 20, masse: 20, emports: 3, facteur_cout: 1, facteur_puissance: 1, facteur_masse: 1 };
const arme = { emport: 1, munitions: 0, cout_munition: 0, ...el };
const catalogue = () => ({
  catalogue: 'swn/vaisseaux', version: 'fiches-legendes-1',
  coques: [
    { cle: 'fregate-r', nom: 'Frégate R', classe: 2, ...coque, vitesse: 3, armure: 5, equipage_min: 6, equipage_max: 20 },
    { cle: 'muette-r', nom: 'Muette R', classe: 2, ...coque },
  ],
  amenagements: [
    { cle: 'salle', nom: 'Salle intervalle', ...el, classe_min: 2, classe_max: 3, condition: 'Technologie 4 | 5, coût doublé' },
    { cle: 'hangar', nom: 'Hangar minimum', ...el, classe_min: 3 },
    { cle: 'etroit', nom: 'Étroit maximum', ...el, classe_max: 1 },
    { cle: 'cale', nom: 'Cale seule', ...el, classe_min: 2, classe_max: 2 },
    { cle: 'libre', nom: 'Libre muet', ...el },
  ],
  defenses: [{ cle: 'voiles', nom: 'Voiles bonus', ...el, bonus_vitesse: 1 }],
  armes: [
    { cle: 'canon-r', nom: 'Canon complet', ...arme, degats: '1d8', perforation: 3, qualites: 'Bruyant', niveau_tech: 3 },
    { cle: 'pistolet-r', nom: 'Pistolet degats', ...arme, degats: '1d6' },
  ],
});

let srv: Server;
let browser: Any;
const ctxs: Any[] = [];
before(async () => { if (!skipBrowser) browser = await launch(); });
after(async () => { for (const c of ctxs) await c.close().catch(() => {}); await browser?.close(); srv?.stop(); });

const norm = (s: string) => s.replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();

describe('B-82 · E-22 : les légendes des lignes de choix', { skip: skipBrowser, timeout: 240000 }, () => {
  it('Léa lit la vitesse, l’armure et l’équipage d’une coque, la classe et la condition d’un élément, les dégâts d’une arme', async () => {
    srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
    const cookies: Record<string, string> = {};
    const api = async (compte: string, methode: string, chemin: string, corps?: unknown) => {
      if (!cookies[compte]) {
        const r = await fetch(`${srv.base}/connexion-bouchon`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `compte=${compte}` });
        cookies[compte] = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
      }
      const r = await fetch(srv.base + chemin, { method: methode, headers: { cookie: cookies[compte], ...(corps === undefined ? {} : { 'content-type': 'application/json' }) }, body: corps === undefined ? undefined : JSON.stringify(corps) });
      const t = await r.text();
      let json: Any = null;
      try { json = JSON.parse(t); } catch { /* not json */ }
      return { status: r.status, json };
    };
    const E = ((await api('antor', 'GET', '/api/univers')).json as Any[]).find((u) => u.nom === "Éneria d'essai").id as number;
    const V = `/api/univers/${E}/outils/swn/vaisseaux`;
    assert.equal((await api('antor', 'POST', `${V}/catalogue/application`, catalogue())).status, 200);
    const liste = (await api('antor', 'GET', `${V}/conceptions`)).json;
    const fiche = liste.conceptions.find((c: Any) => c.titre === 'Étoile du soir').ficheId as number;
    const v = (await api('antor', 'GET', `${V}/conceptions/${fiche}`)).json;
    assert.equal((await api('antor', 'PUT', `${V}/conceptions/${fiche}`, { coque: 'fregate-r', choix: [], version: v.version })).status, 200);

    const { ctx, page: p } = await connecte(browser, srv.base, 'Léa');
    ctxs.push(ctx);
    await p.setViewportSize({ width: 1280, height: 900 });
    await p.goto(`/univers/${E}/outils/swn/vaisseaux?fiche=${fiche}`);
    await p.getByRole('complementary', { name: 'Résultats' }).waitFor();
    const ligne = (nom: string) => p.locator('li').filter({ hasText: nom }).last();
    const texte = async (nom: string) => { await ligne(nom).waitFor(); return norm(await ligne(nom).innerText()); };

    // hulls
    await p.getByRole('button', { name: 'Changer de coque' }).click();
    assert.match(await texte('Frégate R'), /vitesse 3 · armure 5 · équipage 6 à 20/);
    const muette = await texte('Muette R');
    assert.doesNotMatch(muette, /vitesse|armure|équipage|—/, `a hull that states nothing: ${muette}`);
    await p.screenshot({ path: `${SHOTS}-coques.png`, fullPage: true });
    await p.getByRole('button', { name: 'Fermer' }).click();

    // fittings
    await p.getByRole('button', { name: 'Ajouter un aménagement' }).click();
    const salle = await texte('Salle intervalle');
    assert.match(salle, /classe 2 à 3/);
    assert.match(salle, /Technologie 4 \| 5, coût doublé/);
    assert.match(await texte('Hangar minimum'), /classe 3 au moins/);
    assert.match(await texte('Étroit maximum'), /classe 1 au plus/);
    assert.match(await texte('Cale seule'), /classe 2 seulement/);
    const libre = await texte('Libre muet');
    assert.doesNotMatch(libre, /classe|vitesse|—/, `a fitting that states nothing: ${libre}`);
    await p.screenshot({ path: `${SHOTS}-amenagements.png`, fullPage: true });
    await p.getByRole('button', { name: 'Fermer' }).click();

    // defences and weapons
    await p.getByRole('button', { name: 'Ajouter une défense' }).click();
    assert.match(await texte('Voiles bonus'), /vitesse \+1/);
    await p.getByRole('button', { name: 'Fermer' }).click();
    await p.getByRole('button', { name: 'Ajouter une arme' }).click();
    assert.match(await texte('Canon complet'), /dégâts 1d8 · PA 3 · qualités : Bruyant · NT 3/);
    const pistolet = await texte('Pistolet degats');
    assert.match(pistolet, /dégâts 1d6/);
    assert.doesNotMatch(pistolet, /PA|qualités|NT/, `a weapon that states only its damage: ${pistolet}`);
    await p.screenshot({ path: `${SHOTS}-armes.png`, fullPage: true });
  });
});

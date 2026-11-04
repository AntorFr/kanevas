import assert from 'node:assert/strict';
import { test } from 'node:test';

// Critère de sortie de kanevas-outils-vaisseaux-regles-peremption (R-8) : attendus écrits en dur, jamais lus du code.
process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;

const { buildApp } = await import('../../app.js');
const { catalogueDe } = await import('../../services/assistant/catalogue.js');
const { semerBouchon } = await import('../../bouchon/depart.js');
const { encoderSession, SESSION_COOKIE } = await import('../../services/session.js');
const cat = await import('../../services/catalogues.js');
const o = await import('../../services/outils.js');

type App = Awaited<ReturnType<typeof buildApp>>;
const one = (app: App, sql: string, ...a: unknown[]) => app.db.prepare(sql).get(...a) as any;
const OUTIL = 'swn/vaisseaux';

async function monde() {
  const app = await buildApp();
  assert.equal(semerBouchon(app.db), true);
  const cid = (u: string) => one(app, 'SELECT id FROM comptes WHERE username = ?', u).id as number;
  const h = (u: string) => ({ cookie: `${SESSION_COOKIE}=${app.signCookie(encoderSession({ id: cid(u), groups: [] }))}` });
  const E = one(app, 'SELECT id FROM univers WHERE nom = ?', "Éneria d'essai").id as number;
  const S = one(app, 'SELECT id FROM systemes_jeu WHERE nom = ?', "Système d'essai").id as number;
  const fiche = (t: string) => one(app, 'SELECT id FROM fiches WHERE univers_id = ? AND titre = ?', E, t).id as number;
  const B = `/api/univers/${E}/outils/swn/vaisseaux`;
  const req = (u: string | null, method: 'GET' | 'POST', url: string, payload?: object) =>
    app.inject({ method, url, headers: u ? h(u) : {}, ...(payload ? { payload } : {}) });
  const lire = (u: string, f: number, q = '') => req(u, 'GET', `${B}/conceptions/${f}${q}`);
  const sec = (f: number) => one(app, 'SELECT * FROM sections WHERE fiche_id = ? AND gere_par IS NOT NULL', f);
  const ligne = (f: number) => one(app, 'SELECT * FROM swn_conceptions WHERE fiche_id = ?', f);
  const portee = (n: number) => o.poserReglages(app.db, { compteId: cid('antor') }, { niveau: 'univers', id: E }, 'swn',
    { version: o.lireLigneOutil(app.db, { niveau: 'univers', id: E }, 'swn')?.version_reglages ?? 0, valeurs: { portee_saut: n } });
  const recalcul = (u: string, f: number, version: number, q = '') =>
    req(u, 'POST', `/api/univers/${E}/fiches/${f}/sections/${sec(f).id}/recalcul${q}`, { version });
  return { app, cid, h, E, S, B, req, lire, sec, ligne, portee, recalcul,
    orak: fiche("Vent d'Orak"), etoile: fiche('Étoile du soir') };
}
const CHAMPS = ['perime', 'peutRecalculer', 'sectionId', 'sectionVersion'] as const;

test("à jour : Vent d'Orak ne se déclare pas périmée, quatre champs présents et typés", async () => {
  const w = await monde();
  const v = (await w.lire('lea', w.orak)).json();
  assert.equal(v.perime, false);
  assert.equal(v.peutRecalculer, true);
  assert.equal(v.sectionId, w.sec(w.orak).id);
  assert.equal(v.sectionVersion, w.sec(w.orak).version);
  const liste = (await w.req('lea', 'GET', `${w.B}/conceptions`)).json().conceptions;
  assert.deepEqual(liste.map((c: any) => [c.titre, c.perime]).sort(), [["Vent d'Orak", false], ['Étoile du soir', false]]);
});

test('réglage changé : Léa périmée sans rien bouger, Roxane lectrice sans recalcul, listes filtrées', async () => {
  const w = await monde();
  const avant = (await w.lire('lea', w.orak)).json();
  const sAvant = w.sec(w.orak), lAvant = w.ligne(w.orak);
  w.portee(6);
  const v = (await w.lire('lea', w.orak)).json();
  assert.equal(v.perime, true);
  assert.equal(v.peutRecalculer, true);
  assert.equal(v.version, avant.version);
  assert.equal(v.sectionVersion, avant.sectionVersion);
  assert.deepEqual(v.resultat, avant.resultat);
  assert.deepEqual(w.sec(w.orak), sAvant); // contenu et version octet pour octet
  assert.deepEqual(w.ligne(w.orak), lAvant);
  const r = (await w.lire('roxane', w.etoile)).json();
  assert.equal(r.perime, true);
  assert.equal(r.peutRecalculer, false);
  const ll = (await w.req('lea', 'GET', `${w.B}/conceptions`)).json().conceptions;
  assert.deepEqual(ll.map((c: any) => [c.titre, c.perime]).sort(), [["Vent d'Orak", true], ['Étoile du soir', true]]);
  const lr = (await w.req('roxane', 'GET', `${w.B}/conceptions`)).json().conceptions;
  assert.deepEqual(lr.map((c: any) => [c.titre, c.perime]), [['Étoile du soir', true]]);
  assert.ok(!JSON.stringify(lr).includes("Vent d'Orak"));
});

test("Antor en mode joueur sur une conception qu'il ne lit pas : introuvable, jamais peutRecalculer", async () => {
  const w = await monde();
  w.portee(6);
  const v = await w.lire('antor', w.orak, '?mode=joueur');
  assert.equal(v.statusCode, 404, v.body);
  assert.doesNotMatch(v.body, /peutRecalculer/);
  const r = await w.recalcul('antor', w.orak, w.sec(w.orak).version, '?mode=joueur');
  assert.ok([403, 404].includes(r.statusCode), String(r.statusCode));
  assert.ok(w.sec(w.orak).contenu.includes('15 cases'));
  assert.equal((await w.lire('antor', w.orak)).json().peutRecalculer, true);
});

test('import du catalogue : arme modifiée périme ; import identique ne périme pas', async () => {
  const w = await monde();
  const antor = { compteId: w.cid('antor') };
  const lecat = (cout: number, version = 'v-peremption') => ({ catalogue: OUTIL, version, armes: [{ cle: 'laser', nom: 'Laser', emport: 1, munitions: 0,
    cout_munition: 0, cout, puissance: 2, masse: 1, x_cout: true, x_puissance: true, x_masse: false, pv: 0, ca: 0, limite: 0 }] });
  const cible = { niveau: 'univers' as const, id: w.E };
  const rap = cat.appliquerCatalogue(w.app.db, antor, cible, OUTIL, lecat(26000));
  assert.equal(rap.natures.armes?.ajoutes, 1, JSON.stringify(rap)); // surcharge d'univers d'une arme du système
  assert.equal((await w.lire('lea', w.orak)).json().perime, true);
  assert.equal((await w.lire('roxane', w.etoile)).json().perime, true);
  // Léa recalcule : à jour. Le même fichier, « 0 modifié » : rien ne se périme.
  assert.equal((await w.recalcul('lea', w.orak, w.sec(w.orak).version)).statusCode, 200);
  const ident = cat.appliquerCatalogue(w.app.db, antor, cible, OUTIL, lecat(26000));
  assert.deepEqual([ident.natures.armes?.ajoutes, ident.natures.armes?.modifies], [0, 0], JSON.stringify(ident));
  assert.equal((await w.lire('lea', w.orak)).json().perime, false);
  // Une arme modifiée : périmée de nouveau.
  const modif = cat.appliquerCatalogue(w.app.db, antor, cible, OUTIL, lecat(27000, 'v-peremption-2')); // la version du catalogue est l'étiquette du fichier
  assert.equal(modif.natures.armes?.modifies, 1, JSON.stringify(modif));
  assert.equal((await w.lire('lea', w.orak)).json().perime, true);
});

test('recalcul par la route du cœur : 18 cases, résultat et deux versions renouvelés, choix inchangés, perime faux', async () => {
  const w = await monde();
  const lAvant = w.ligne(w.orak), sAvant = w.sec(w.orak);
  w.portee(6);
  const vue = (await w.lire('lea', w.orak)).json();
  const r = await w.recalcul('lea', w.orak, vue.sectionVersion);
  assert.equal(r.statusCode, 200, r.body);
  const s = w.sec(w.orak), l = w.ligne(w.orak);
  assert.ok(s.contenu.includes('18 cases'), s.contenu);
  assert.ok(!s.contenu.includes('15 cases'));
  assert.equal(JSON.parse(l.resultat).porteeSaut, 18);
  assert.equal(s.version, sAvant.version + 1);
  assert.equal(l.version, lAvant.version + 1);
  assert.equal(l.choix, lAvant.choix);
  assert.equal(l.coque_cle, lAvant.coque_cle);
  assert.notEqual(l.version_reglages, lAvant.version_reglages);
  const apres = (await w.lire('lea', w.orak)).json();
  assert.equal(apres.perime, false);
  assert.equal(apres.sectionVersion, s.version);
  assert.equal(apres.resultat.porteeSaut, 18);
  // à jour : recalculer renvoie la vue sans bouger la version
  const bis = await w.recalcul('lea', w.orak, s.version);
  assert.equal(bis.statusCode, 200, bis.body);
  assert.equal(w.sec(w.orak).version, s.version);
  assert.equal(w.ligne(w.orak).version, l.version);
});

test('recalcul : sectionVersion ancienne → 409 donnee_modifiee ; Roxane refusée 403 ; hors droits 404', async () => {
  const w = await monde();
  w.portee(6);
  const sv = w.sec(w.orak).version, s0 = w.sec(w.orak), l0 = w.ligne(w.orak);
  const vieux = await w.recalcul('lea', w.orak, sv - 1);
  assert.equal(vieux.statusCode, 409, vieux.body);
  assert.match(vieux.body, /section_modifiee|donnee_modifiee/);
  const rox = await w.recalcul('roxane', w.etoile, w.sec(w.etoile).version);
  assert.equal(rox.statusCode, 403, rox.body);
  const sansRole = await w.recalcul('teo', w.orak, sv);
  assert.equal(sansRole.statusCode, 404);
  const roxCache = await w.req('roxane', 'POST', `/api/univers/${w.E}/fiches/${w.orak}/sections/${w.sec(w.orak).id}/recalcul`, { version: sv });
  assert.equal(roxCache.statusCode, 404);
  assert.deepEqual(w.sec(w.orak), s0);
  assert.deepEqual(w.ligne(w.orak), l0);
  assert.equal((await w.lire('teo', w.orak)).statusCode, 404);
  assert.equal((await w.lire('roxane', w.orak)).statusCode, 404);
});

test('éclaireur retiré : recalcul refusé avec le message exact, ni texte ni ligne ne bougent', async () => {
  const w = await monde();
  const antor = { compteId: w.cid('antor') };
  // Étoile du soir porte « Moteur 1 » ; Vent d'Orak une coque fregate. On retire la coque de la conception périmée.
  const coque = JSON.parse(w.ligne(w.etoile).resultat).coque;
  w.portee(6);
  cat.retirerElement(w.app.db, antor, w.E, OUTIL, 'coques', coque.cle, { retire: true });
  const s0 = w.sec(w.etoile), l0 = w.ligne(w.etoile);
  const r = await w.recalcul('antor', w.etoile, s0.version);
  assert.equal(r.statusCode, 400, r.body);
  assert.equal(coque.nom, 'Éclaireur');
  assert.equal(r.json().message, 'Élément retiré de cet univers : Éclaireur. Remplacez-le dans le concepteur.');
  assert.deepEqual(w.sec(w.etoile), s0);
  assert.deepEqual(w.ligne(w.etoile), l0);
});

test("enregistrement après le changement de réglage : perime faux", async () => {
  const w = await monde();
  w.portee(6);
  const v = (await w.lire('lea', w.orak)).json();
  assert.equal(v.perime, true);
  const put = await w.app.inject({ method: 'PUT', url: `${w.B}/conceptions/${w.orak}`, headers: w.h('lea'),
    payload: { coque: v.coque.cle, choix: v.lignes.map((l: any) => ({ nature: l.nature, cle: l.cle, quantite: l.quantite })), version: v.version } });
  assert.equal(put.statusCode, 200, put.body);
  assert.equal((await w.lire('lea', w.orak)).json().perime, false);
});

test("outil d'assistant : perime vrai après le réglage, faux avant ; outil désactivé : tout introuvable", async () => {
  const w = await monde();
  const outil = (u: string) => catalogueDe(w.app.db, w.cid(u), w.E).outils.find((t) => t.nom === 'swn_vaisseau_calculer')!;
  assert.equal(((await outil('lea').executer({ conception: "Vent d'Orak" })) as any).donnees.perime, false);
  w.portee(6);
  const r: any = await outil('lea').executer({ conception: "Vent d'Orak" });
  assert.equal(r.ok, true);
  assert.equal(r.donnees.perime, true);
  assert.equal(r.evenement, undefined);
  await w.app.inject({ method: 'PUT', url: `/api/systemes/${w.S}/outils/swn/vaisseaux/activation`, headers: w.h('antor'), payload: { active: false } });
  const ref = await w.app.inject({ method: 'GET', url: `${w.B}/nexiste`, headers: w.h('lea') });
  for (const u of ['antor', 'lea']) {
    const g = await w.lire(u, w.orak);
    assert.equal(g.statusCode, 404);
    assert.equal(g.body, ref.body);
    assert.equal((await w.req(u, 'GET', `${w.B}/conceptions`)).statusCode, 404);
    const rc = await w.req(u, 'POST', `/api/univers/${w.E}/fiches/${w.orak}/sections/${w.sec(w.orak).id}/recalcul`, { version: w.sec(w.orak).version });
    assert.ok([403, 404].includes(rc.statusCode), String(rc.statusCode));
  }
});
void CHAMPS;

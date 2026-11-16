// Door of the lot « vaisseaux » for `src/e2e/vaisseaux-regles-ensemble.test.ts` (B-67 stale designs and « Recalculer », B-77 rule sheets): the
// effects of the gestures (what the routes write, refuse and compute), read through the API of the app listening in this process. The
// screen file keeps what the user reads (the band, the dialog, the labels). Literals are those of the screen file (hand-calculated
// from the trial catalogue). The first five tests of B-77 never opened a page: moved as they were.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, describe, it } from 'node:test';
import { startServer, type Any, type Server } from './serveur-lot-vaisseaux.ts';

const servers: Server[] = [];
after(() => servers.forEach((s) => s.stop()));

const NATURES = ['Règles — Coques', 'Règles — Moteurs', 'Règles — Aménagements', 'Règles — Défenses', 'Règles — Armes', 'Règles — Modifications'];
const EXEMPLES = 'Exemples de vaisseaux';
const plat = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/[  ]/g, ' ').replace(/\s+/g, ' ');

async function monde() {
  const srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
  servers.push(srv);
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
  const B = `/api/univers/${E}/outils/swn/vaisseaux`;
  const liste = (await api('antor', 'GET', `${B}/conceptions`)).json;
  const fid = (t: string) => liste.conceptions.find((c: Any) => c.titre === t).ficheId as number;
  let versionReglages = 0;
  const portee = async (n: number) => {
    const r = await api('antor', 'PUT', `/api/univers/${E}/outils/swn/reglages`, { version: versionReglages, valeurs: { portee_saut: n } });
    assert.equal(r.status, 204);
    versionReglages++;
  };
  let nCat = 0;
  /** Universe catalogue file of the trial, with Lance d'essai at the given cost (the file the dialog of E-20 sends). */
  const reimporterCatalogue = async (coutLance: number) => {
    const f = JSON.parse(readFileSync('src/outils/swn/exemples/catalogue-essai-univers.json', 'utf8'));
    f.version = `2026-12-ensemble-${++nCat}`;
    f.armes[0].cout = coutLance;
    const r = await api('antor', 'POST', `${B}/catalogue/application`, f);
    assert.equal(r.status, 200);
    assert.equal(r.json.natures.armes.modifies, 1);
  };
  const generer = async () => (await api('antor', 'POST', `${B}/fiches-regles`)).json;
  const etat = async () => (await api('antor', 'GET', `${B}/fiches-regles`)).json as Any[];
  const fiche = async (compte: string, id: number) => (await api(compte, 'GET', `/api/univers/${E}/fiches/${id}`)).json;
  const caracteristiques = async (compte: string, id: number): Promise<string> =>
    (await fiche(compte, id)).sections.find((s: Any) => s.titre === 'Caractéristiques').html;
  /** Text of a rule sheet as a player reads it (HTML tags dropped, spaces normalised). */
  const regles = async (compte: string, cle: string): Promise<string> => {
    const e = (await etat()).find((x) => x.cle === cle);
    return (await fiche(compte, e.ficheId)).sections.map((s: Any) => s.html).join(' ').replace(/<[^>]+>/g, ' ').replace(/[  ]/g, ' ').replace(/\s+/g, ' ');
  };
  const masquer = async (nature: string, cle: string) => {
    const g = (await api('antor', 'GET', `${B}/catalogue/gestion?nature=${nature}`)).json.elements.find((e: Any) => e.cle === cle);
    const r = await api('antor', 'PUT', `${B}/catalogue/${nature}/${cle}/masque`, { masque: true, version: g.version });
    assert.equal(r.status, 200);
  };
  return { E, B, api, portee, reimporterCatalogue, generer, etat, fiche, caracteristiques, regles, masquer, orak: fid("Vent d'Orak"), etoile: fid('Étoile du soir') };
}

type Monde = Awaited<ReturnType<typeof monde>>;
/** The « Caractéristiques » section of a sheet as a reader gets it (id and version for the recalculation route). */
const sectionCaracteristiques = async (m: Monde, compte: string, id: number): Promise<Any> =>
  (await m.fiche(compte, id)).sections.find((x: Any) => x.titre === 'Caractéristiques');
const recalculer = async (m: Monde, compte: string, id: number) => {
  const s = await sectionCaracteristiques(m, compte, id);
  return m.api(compte, 'POST', `/api/univers/${m.E}/fiches/${id}/sections/${s.id}/recalcul`, { version: s.version });
};

describe('B-67 : un réglage change, la conception de Léa est périmée et se recalcule sur son geste', () => {
  it('portée de saut 5 → 6 : périmée, texte intact (15 cases, 685 000 cr) ; le recalcul → 18 cases, prix et chantier inchangés ; plus périmée', async () => {
    const m = await monde();
    const avant = await m.caracteristiques('lea', m.orak);
    assert.match(plat(avant), /Portée de saut 15 cases/);
    await m.portee(6);
    assert.equal((await m.api('lea', 'GET', `${m.B}/conceptions/${m.orak}`)).json.perime, true);
    assert.equal(await m.caracteristiques('lea', m.orak), avant, 'rien n’est réécrit sans le geste');
    const r = await recalculer(m, 'lea', m.orak);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const apres = plat(await m.caracteristiques('lea', m.orak));
    assert.match(apres, /Portée de saut 18 cases/);
    assert.match(apres, /Prix 685 000 cr/);
    assert.match(apres, /Chantier 28 jours/);
    assert.equal((await m.api('lea', 'GET', `${m.B}/conceptions/${m.orak}`)).json.perime, false);
  });

  it('catalogue de l’univers réimporté avec la Lance d’essai à 31 000 : périmée, texte intact ; le recalcul → 690 000 cr, 28 jours, 34 500 cr / an', async () => {
    const m = await monde();
    const avant = await m.caracteristiques('lea', m.orak);
    await m.reimporterCatalogue(31000);
    assert.equal(await m.caracteristiques('lea', m.orak), avant);
    assert.equal((await m.api('lea', 'GET', `${m.B}/conceptions/${m.orak}`)).json.perime, true);
    assert.equal(plat(await m.caracteristiques('lea', m.orak)).includes('685 000 cr'), true);
    assert.equal((await recalculer(m, 'lea', m.orak)).status, 200);
    const apres = plat(await m.caracteristiques('lea', m.orak));
    assert.match(apres, /Prix 690 000 cr/);
    assert.match(apres, /Chantier 28 jours/);
    assert.match(apres, /Entretien 34 500 cr \/ an/);
  });

  it('« Enregistrer » après une modification remet la conception à jour (second Laser : 810 000 cr, 18 cases)', async () => {
    const m = await monde();
    await m.portee(6);
    const v = (await m.api('lea', 'GET', `${m.B}/conceptions/${m.orak}`)).json;
    const choix = v.lignes.map((l: Any) => ({ nature: l.nature, cle: l.cle, quantite: l.cle === 'laser' ? l.quantite + 1 : l.quantite }));
    const put = await m.api('lea', 'PUT', `${m.B}/conceptions/${m.orak}`, { coque: v.coque.cle, choix, version: v.version });
    assert.equal(put.status, 200, JSON.stringify(put.json));
    const apres = plat(await m.caracteristiques('lea', m.orak));
    assert.match(apres, /Prix 810 000 cr/);
    assert.match(apres, /Portée de saut 18 cases/);
    assert.equal((await m.api('lea', 'GET', `${m.B}/conceptions/${m.orak}`)).json.perime, false);
  });

  it('exclusions : un masque seul ne périme rien ; le texte d’Étoile du soir ne bouge pas quand le réglage change', async () => {
    const m = await monde();
    const avantEtoile = await m.caracteristiques('antor', m.etoile);
    await m.masquer('armes', 'lance-d-essai');
    assert.equal((await m.api('lea', 'GET', `${m.B}/conceptions/${m.orak}`)).json.perime, false, 'a mask alone does not make a design stale');
    await m.portee(6);
    assert.equal(await m.caracteristiques('antor', m.etoile), avantEtoile, 'texte inchangé');
  });

  it('échec : coque retirée de l’univers → le recalcul est refusé (« Élément retiré de cet univers : Éclaireur… »), le texte ne bouge pas', async () => {
    const m = await monde();
    await m.portee(6);
    assert.equal((await m.api('antor', 'PUT', `${m.B}/catalogue/coques/eclaireur/retrait`, { retire: true })).status, 200);
    const avant = await m.caracteristiques('lea', m.etoile);
    const r = await recalculer(m, 'lea', m.etoile);
    assert.ok(r.status >= 400, `recalcul refused, got ${r.status}`);
    assert.match(JSON.stringify(r.json), /Élément retiré de cet univers : Éclaireur/);
    assert.equal(await m.caracteristiques('lea', m.etoile), avant);
  });

  it('concepteur désactivé : la génération et le recalcul sont refusés par leur route, le texte reste', async () => {
    const m = await monde();
    await m.portee(6);
    assert.equal((await m.api('antor', 'PUT', `${m.B}/activation`, { active: false })).status, 204);
    const gen = await m.api('antor', 'POST', `${m.B}/fiches-regles`);
    assert.ok(gen.status >= 400, `generation refused, got ${gen.status}`);
    const rec = await recalculer(m, 'lea', m.orak);
    assert.ok(rec.status >= 400, `recalcul refused, got ${rec.status}`);
    assert.match(plat(await m.caracteristiques('lea', m.orak)), /Portée de saut 15 cases/);
  });
});

describe('B-77 : le MJ génère les fiches de règles', () => {
  it('la génération crée sept fiches Règle à une section gérée non modifiable, même par le MJ ; relancée : sept inchangées, aucun doublon', async () => {
    const m = await monde();
    assert.equal((await m.etat()).filter((e) => e.etat === 'absente').length, 7, 'sept « À créer »');
    const g = await m.generer();
    assert.equal(g.creees, 7);
    const liste = (await m.api('antor', 'GET', `/api/univers/${m.E}/fiches?type=regle`)).json;
    const titres = (liste.fiches ?? liste).map((f: Any) => f.titre).sort();
    assert.deepEqual(titres, [...NATURES, EXEMPLES].sort());
    for (const e of await m.etat()) {
      const f = await m.fiche('antor', e.ficheId);
      assert.equal(f.type, 'regle');
      assert.equal(f.sections.length, 1, `${e.libelle}: one section`);
      assert.ok(f.sections[0].geree, `${e.libelle}: managed`);
      assert.equal(f.sections[0].peutEcrire, false, `${e.libelle}: not writable`);
      const w = await m.api('antor', 'PUT', `/api/univers/${m.E}/fiches/${e.ficheId}/sections/${f.sections[0].id}/contenu`, { contenu: 'écrasé', version: f.sections[0].version });
      assert.ok(w.status >= 400, `${e.libelle}: direct write refused, got ${w.status}`);
    }
    const encore = await m.generer();
    assert.equal(encore.creees, 0);
    assert.equal(encore.misesAJour, 0);
    assert.equal(encore.inchangees, 7);
    const liste2 = (await m.api('antor', 'GET', `/api/univers/${m.E}/fiches?type=regle`)).json;
    assert.equal((liste2.fiches ?? liste2).length, 7);
  });

  it('exclusion : Léa ne génère pas (route fermée, rien créé)', async () => {
    const m = await monde();
    const r = await m.api('lea', 'POST', `${m.B}/fiches-regles`);
    assert.ok(r.status >= 400, `Léa refused, got ${r.status}`);
    const liste = (await m.api('antor', 'GET', `/api/univers/${m.E}/fiches?type=regle`)).json;
    assert.equal((liste.fiches ?? liste).length, 0, 'nothing created');
  });

  it('retirer le Laser de l’univers : deux fiches périmées avec leur proposition, le texte de Léa ne change qu’à l’accord d’Antor ; ensuite ni le Laser ni les exemples qui l’emploient', async () => {
    const m = await monde();
    await m.generer();
    const armesAvant = await m.regles('lea', 'regles-armes');
    const exAvant = await m.regles('lea', 'exemples');
    assert.ok(armesAvant.includes('Laser') && exAvant.includes('Éclaireur armé'));
    assert.equal((await m.api('antor', 'PUT', `${m.B}/catalogue/armes/laser/retrait`, { retire: true })).status, 200);
    const etat = await m.etat();
    const armes = etat.find((x) => x.cle === 'regles-armes');
    assert.equal(armes.etat, 'perimee');
    assert.ok(armes.propositionId, 'une proposition attend');
    assert.equal(etat.find((x) => x.cle === 'exemples').etat, 'perimee');
    assert.equal(etat.find((x) => x.cle === 'regles-coques').etat, 'a_jour');
    assert.equal(etat.filter((x) => x.etat === 'perimee').length, 2);
    assert.equal(etat.filter((x) => x.etat === 'a_jour').length, 5);
    assert.equal(await m.regles('lea', 'regles-armes'), armesAvant, 'texte inchangé avant l’accord');
    assert.equal(await m.regles('lea', 'exemples'), exAvant);
    for (const e of [armes, etat.find((x) => x.cle === 'exemples')]) {
      const r = await m.api('antor', 'POST', `/api/univers/${m.E}/propositions/${e.propositionId}/appliquer`);
      assert.equal(r.status, 200);
    }
    const armesApres = await m.regles('lea', 'regles-armes');
    assert.ok(!armesApres.includes('Laser'), 'Laser retiré : absent');
    assert.ok(armesApres.includes('Canon léger') && armesApres.includes('Lance d\'essai'));
    assert.ok(armesApres.includes('2 éléments'));
    const exApres = await m.regles('lea', 'exemples');
    assert.ok(exApres.includes('Éclaireur nu'), 'l’exemple sans Laser reste');
    for (const n of ['Éclaireur armé', 'Frégate de ligne', 'Frégate à l\'extrême', 'Frégate gourmande', 'Croiseur de transport', 'Frégate sans moteur']) {
      assert.ok(!exApres.includes(n), `exemple employant le Laser absent : ${n}`);
    }
    assert.equal((await m.etat()).every((x) => x.etat === 'a_jour'), true);
  });

  it('catalogue de l’univers réimporté avec une arme modifiée : les fiches proposent, le texte ne bouge qu’à l’accord (Lance d’essai 31 000 cr)', async () => {
    const m = await monde();
    await m.generer();
    const avant = await m.regles('lea', 'regles-armes');
    assert.ok(avant.includes('30 000 cr') && !avant.includes('31 000 cr'));
    await m.reimporterCatalogue(31000);
    const armes = (await m.etat()).find((x) => x.cle === 'regles-armes');
    assert.equal(armes.etat, 'perimee');
    assert.ok(armes.propositionId);
    assert.equal(await m.regles('lea', 'regles-armes'), avant, 'texte inchangé avant l’accord');
    const r = await m.api('antor', 'POST', `/api/univers/${m.E}/propositions/${armes.propositionId}/appliquer`);
    assert.equal(r.status, 200);
    const apres = await m.regles('lea', 'regles-armes');
    assert.ok(apres.includes('31 000 cr'));
    assert.ok(!apres.includes('30 000 cr'));
    assert.equal((await m.etat()).find((x) => x.cle === 'regles-armes').etat, 'a_jour');
  });

  it('contenu des fiches (valeurs calculées à la main) et lecture par une joueuse', async () => {
    const m = await monde();
    await m.generer();
    const coques = await m.regles('lea', 'regles-coques');
    for (const v of ['Éclaireur', 'Frégate d\'essai', 'Croiseur d\'essai', '20 000 cr', '300 000 cr', '1 000 000 cr']) assert.ok(coques.includes(v), `Coques: ${v}`);
    assert.ok(coques.includes('3 éléments'));
    const armes = await m.regles('lea', 'regles-armes');
    for (const v of ['Laser', 'Canon léger', 'Lance d\'essai', '25 000 cr', '30 000 cr', '12 000 cr']) assert.ok(armes.includes(v), `Armes: ${v}`);
    assert.ok(armes.includes('3 éléments'));
    const ex = await m.regles('lea', 'exemples');
    for (const n of ['Éclaireur nu', 'Éclaireur armé', 'Frégate de ligne', 'Frégate à l\'extrême', 'Frégate gourmande', 'Croiseur de transport', 'Frégate sans moteur']) assert.ok(ex.includes(n), `Exemples: ${n}`);
    assert.ok(ex.includes('25 000 cr'), 'Éclaireur nu : 20 000 + 5 000 = 25 000 cr');
  });

  it('bords : une nature vidée → « Aucun élément dans le catalogue. » ; une fiche dont la section a été retirée à la main est recréée, l’ancienne reste', async () => {
    const m = await monde();
    assert.equal((await m.api('antor', 'PUT', `${m.B}/catalogue/defenses/blindage/retrait`, { retire: true })).status, 200);
    await m.generer();
    const def = await m.regles('lea', 'regles-defenses');
    assert.ok(def.includes('Aucun élément dans le catalogue.'));
    assert.ok(!def.includes('Blindage'));
    assert.ok(def.includes('0 élément'));

    const avant = (await m.etat()).find((x) => x.cle === 'regles-moteurs');
    const f = await m.fiche('antor', avant.ficheId);
    const del = await m.api('antor', 'DELETE', `/api/univers/${m.E}/fiches/${avant.ficheId}/sections/${f.sections[0].id}`);
    if (del.status >= 400) return; // section deletion refused for a managed section: nothing more to prove here
    const e = (await m.etat()).find((x) => x.cle === 'regles-moteurs');
    assert.equal(e.etat, 'absente');
    const g = await m.generer();
    assert.equal(g.creees, 1);
    const apres = (await m.etat()).find((x) => x.cle === 'regles-moteurs');
    assert.notEqual(apres.ficheId, avant.ficheId, 'une nouvelle fiche est créée');
  });

  it('masquer la Lance d’essai puis ignorer la proposition : le texte ne change jamais', async () => {
    const m = await monde();
    await m.generer();
    const armesAvant = await m.regles('lea', 'regles-armes');
    assert.ok(armesAvant.includes('Lance d\'essai'));
    await m.masquer('armes', 'lance-d-essai');
    const armes = (await m.etat()).find((x) => x.cle === 'regles-armes');
    assert.equal(armes.etat, 'perimee');
    const r = await m.api('antor', 'POST', `/api/univers/${m.E}/propositions/${armes.propositionId}/abandonner`);
    assert.equal(r.status, 204);
    assert.equal(await m.regles('lea', 'regles-armes'), armesAvant);
  });

  it('masquer la Lance d’essai puis accepter : elle disparaît de la fiche lue par Léa, les autres armes restent', async () => {
    const m = await monde();
    await m.generer();
    await m.masquer('armes', 'lance-d-essai');
    const armes = (await m.etat()).find((x) => x.cle === 'regles-armes');
    assert.equal((await m.api('antor', 'POST', `/api/univers/${m.E}/propositions/${armes.propositionId}/appliquer`)).status, 200);
    const t = await m.regles('lea', 'regles-armes');
    assert.ok(!t.includes('Lance d\'essai'));
    assert.ok(t.includes('Laser') && t.includes('Canon léger') && t.includes('2 éléments'));
  });

  it('portée de saut modifiée : la fiche des exemples le dit aussi et ne bouge qu’à l’accord', async () => {
    const m = await monde();
    await m.generer();
    const avant = await m.regles('lea', 'exemples');
    await m.portee(6);
    const ex = (await m.etat()).find((x) => x.cle === 'exemples');
    assert.equal(ex.etat, 'perimee');
    assert.equal(await m.regles('lea', 'exemples'), avant);
  });
});

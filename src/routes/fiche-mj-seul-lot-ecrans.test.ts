// Doors of `src/e2e/fiche-mj-seul-ensemble-besoin.test.ts` (lot « écrans »): `visibleJoueurs` and the `visibilite` filter (B-57, rule 11
// of docs/donnees.md) through the API, in-process. That file's first block opened no browser; it runs here on the same literals.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { type Any, type Hote, monter } from './monde-lot-ecrans.js';

const monde0 = await monter();

/** Same shape as the browser contexts of the screen files: `ctx.request.get|post|patch` answering `status()` and `json()`. */
function contexte(h: Hote) {
  const faire = (method: 'GET' | 'POST' | 'PATCH') => async (url: string, o?: { data?: object }) => {
    const r = await monde0.appel(h, method, url, o?.data);
    return { status: () => r.statusCode, json: async () => JSON.parse(r.body) };
  };
  return { request: { get: faire('GET'), post: faire('POST'), patch: faire('PATCH') } };
}
interface Monde {
  antor: { ctx: Any };
  lea: { ctx: Any };
}
const partage: Monde = { antor: { ctx: contexte(monde0.antor) }, lea: { ctx: contexte(monde0.lea) } };
async function monde(): Promise<Monde> {
  return partage;
}

let compteur = 0;
/** A fresh universe where Antor is GM and Léa a player: tests do not share data. */
async function univers(m: Monde): Promise<number> {
  const r = await m.antor.ctx.request.post('/api/univers', { data: { nom: `Lame d'Ébène ${++compteur}`, description: 'd' } });
  assert.equal(r.status(), 201);
  const id = (await r.json()).id as number;
  const a = await m.antor.ctx.request.post(`/api/univers/${id}/membres`, { data: { username: 'lea', role: 'joueur' } });
  assert.equal(a.status(), 201);
  return id;
}

/** A personnage with the given sections: `[titre, lueDesJoueurs]`. Returns its id. */
async function fiche(m: Monde, u: number, titre: string, sections: Array<[string, boolean]>): Promise<number> {
  const r = await m.antor.ctx.request.post(`/api/univers/${u}/fiches`, { data: { type: 'personnage', titre, charge: { pj: false } } });
  assert.equal(r.status(), 201);
  const id = (await r.json()).id as number;
  for (const [t, lue] of sections) {
    const s = await m.antor.ctx.request.post(`/api/univers/${u}/fiches/${id}/sections`, { data: { titre: t, contenu: 'Texte.' } });
    assert.equal(s.status(), 201);
    const sid = (await s.json()).id as number;
    const p = await m.antor.ctx.request.patch(`/api/univers/${u}/fiches/${id}/sections/${sid}`, { data: { joueursLisent: lue } });
    assert.equal(p.status(), 200);
  }
  return id;
}

async function liste(ctx: Any, u: number, query = 'type=personnage'): Promise<{ status: number; corps: Any }> {
  const r = await ctx.request.get(`/api/univers/${u}/fiches?${query}`);
  return { status: r.status(), corps: await r.json().catch(() => null) };
}
const titres = (corps: Any): string[] => (corps.fiches as Any[]).map((f) => f.titre as string);

/** The standard world of the criteria: Aldric (Apparence read by players) and the Prieur (Secret only for the GM). */
async function dePlus(m: Monde) {
  const u = await univers(m);
  const aldric = await fiche(m, u, 'Maître Aldric', [['Apparence', true], ['Vérité — MJ seul', false]]);
  const prieur = await fiche(m, u, 'Le Prieur masqué', [['Secret — MJ seul', false]]);
  return { u, aldric, prieur };
}

describe('B-57 API : visibleJoueurs et filtre visibilite', () => {
  // Panne visée : la visibilité n'est plus déduite des sections (constante, ou lue d'un champ).
  it('le_mj_lit_visibleJoueurs_deduit_des_sections', async () => {
    const m = await monde();
    const { u } = await dePlus(m);
    const { status, corps } = await liste(m.antor.ctx, u);
    assert.equal(status, 200);
    const par = Object.fromEntries((corps.fiches as Any[]).map((f) => [f.titre, f.visibleJoueurs]));
    assert.deepEqual(par, { 'Maître Aldric': true, 'Le Prieur masqué': false });
  });

  // Panne visée : le filtre visibilite=mj laisse passer une fiche lue des joueurs, ou l'inverse.
  it('filtre_visibilite_separe_les_deux_populations', async () => {
    const m = await monde();
    const { u } = await dePlus(m);
    assert.deepEqual(titres((await liste(m.antor.ctx, u, 'type=personnage&visibilite=mj')).corps), ['Le Prieur masqué']);
    assert.deepEqual(titres((await liste(m.antor.ctx, u, 'type=personnage&visibilite=joueurs')).corps), ['Maître Aldric']);
  });

  // Panne visée : une fiche sans section est comptée « visible » (le besoin : nul ne la lit).
  it('fiche_sans_section_est_reservee_au_mj', async () => {
    const m = await monde();
    const u = await univers(m);
    await fiche(m, u, 'Fiche vide', []);
    const mj = await liste(m.antor.ctx, u, 'type=personnage&visibilite=mj');
    assert.deepEqual(titres(mj.corps), ['Fiche vide']);
    assert.equal(mj.corps.fiches[0].visibleJoueurs, false);
    assert.deepEqual(titres((await liste(m.antor.ctx, u, 'type=personnage&visibilite=joueurs')).corps), []);
  });

  // Panne visée : une seule section lue suffit, mais le compte ne doit pas exiger toutes les sections.
  it('une_section_lue_des_joueurs_parmi_plusieurs_suffit', async () => {
    const m = await monde();
    const u = await univers(m);
    await fiche(m, u, 'Mixte', [['A', false], ['B', false], ['C', true]]);
    assert.deepEqual(titres((await liste(m.antor.ctx, u, 'type=personnage&visibilite=joueurs')).corps), ['Mixte']);
    assert.deepEqual(titres((await liste(m.antor.ctx, u, 'type=personnage&visibilite=mj')).corps), []);
  });

  // Panne visée : le droit de lecture de l'auteur joueur compte comme « visible des joueurs ».
  it('section_lue_de_son_seul_auteur_joueur_ne_compte_pas', async () => {
    const m = await monde();
    const u = await univers(m);
    const id = await fiche(m, u, 'Carnet de Léa', [['Notes', false]]);
    const lea = await (await m.antor.ctx.request.get(`/api/univers/${u}/membres`)).json();
    const compteLea = (lea.membres ?? lea).find((x: Any) => x.username === 'lea' || x.identifiant === 'lea');
    const cid = compteLea.compteId ?? compteLea.id;
    const sid = (await (await m.antor.ctx.request.get(`/api/univers/${u}/fiches/${id}`)).json()).sections[0].id;
    const p = await m.antor.ctx.request.patch(`/api/univers/${u}/fiches/${id}/sections/${sid}`, { data: { auteurId: cid, auteurLit: true } });
    assert.equal(p.status(), 200);
    // Léa reads her own section (her right) ...
    assert.deepEqual(titres((await liste(m.lea.ctx, u)).corps), ['Carnet de Léa']);
    // ... yet for the GM the sheet is still reserved.
    const mj = await liste(m.antor.ctx, u, 'type=personnage&visibilite=mj');
    assert.deepEqual(titres(mj.corps), ['Carnet de Léa']);
    assert.equal(mj.corps.fiches[0].visibleJoueurs, false);
  });

  // Panne visée : l'état est figé (stocké) et ne suit pas le réglage d'une section.
  it('ouvrir_la_seule_section_aux_joueurs_fait_passer_la_fiche_cote_joueurs_a_la_lecture_suivante', async () => {
    const m = await monde();
    const { u, prieur } = await dePlus(m);
    const sid = (await (await m.antor.ctx.request.get(`/api/univers/${u}/fiches/${prieur}`)).json()).sections[0].id;
    const p = await m.antor.ctx.request.patch(`/api/univers/${u}/fiches/${prieur}/sections/${sid}`, { data: { joueursLisent: true } });
    assert.equal(p.status(), 200);
    assert.deepEqual(titres((await liste(m.antor.ctx, u, 'type=personnage&visibilite=mj')).corps), []);
    const lecture = await (await m.antor.ctx.request.get(`/api/univers/${u}/fiches/${prieur}`)).json();
    assert.equal(lecture.visibleJoueurs ?? lecture.fiche?.visibleJoueurs, true);
    // and closing it again brings the sheet back
    await m.antor.ctx.request.patch(`/api/univers/${u}/fiches/${prieur}/sections/${sid}`, { data: { joueursLisent: false } });
    assert.deepEqual(titres((await liste(m.antor.ctx, u, 'type=personnage&visibilite=mj')).corps), ['Le Prieur masqué']);
  });

  // Panne visée : le filtre ne s'applique pas à l'arbre, ou la fiche d'arbre ne porte pas l'état.
  it('arbre_porte_visibleJoueurs_et_accepte_le_filtre', async () => {
    const m = await monde();
    const { u } = await dePlus(m);
    const arbre = await liste(m.antor.ctx, u, 'type=personnage&parent=racine&visibilite=mj');
    assert.equal(arbre.status, 200);
    assert.deepEqual(titres(arbre.corps), ['Le Prieur masqué']);
    assert.equal(arbre.corps.fiches[0].visibleJoueurs, false);
  });

  // Panne visée : la recherche et le filtre ne se combinent pas (ET).
  it('recherche_et_filtre_visibilite_se_combinent', async () => {
    const m = await monde();
    const { u } = await dePlus(m);
    assert.deepEqual(titres((await liste(m.antor.ctx, u, 'q=Prieur&visibilite=mj')).corps), ['Le Prieur masqué']);
    assert.deepEqual(titres((await liste(m.antor.ctx, u, 'q=Prieur&visibilite=joueurs')).corps), []);
    assert.deepEqual(titres((await liste(m.antor.ctx, u, 'q=Aldric&visibilite=mj')).corps), []);
  });

  // Panne visée : la fiche sans section n'est pas ouvrable par le MJ (ou l'est par un joueur).
  it('fiche_sans_section_ouvrable_du_mj_avec_visibleJoueurs_faux_introuvable_du_joueur', async () => {
    const m = await monde();
    const u = await univers(m);
    const id = await fiche(m, u, 'Fiche vide', []);
    const mj = await m.antor.ctx.request.get(`/api/univers/${u}/fiches/${id}`);
    assert.equal(mj.status(), 200);
    const corps = await mj.json();
    assert.equal(corps.visibleJoueurs ?? corps.fiche?.visibleJoueurs, false);
    assert.equal((await m.lea.ctx.request.get(`/api/univers/${u}/fiches/${id}`)).status(), 404);
  });

  // Panne visée : l'API dit à un joueur quelles fiches sont réservées (exclusion du besoin).
  it('joueur_ne_recoit_ni_visibleJoueurs_ni_fiche_cachee', async () => {
    const m = await monde();
    const { u, aldric } = await dePlus(m);
    const { status, corps } = await liste(m.lea.ctx, u);
    assert.equal(status, 200);
    assert.deepEqual(titres(corps), ['Maître Aldric']);
    assert.ok(!('visibleJoueurs' in corps.fiches[0]), 'pas de visibleJoueurs dans la liste du joueur');
    const f = await (await m.lea.ctx.request.get(`/api/univers/${u}/fiches/${aldric}`)).json();
    assert.ok(!('visibleJoueurs' in f) && !('visibleJoueurs' in (f.fiche ?? {})), 'pas de visibleJoueurs sur la fiche du joueur');
    const arbre = await liste(m.lea.ctx, u, 'type=personnage&parent=racine');
    assert.ok(!('visibleJoueurs' in arbre.corps.fiches[0]), 'pas de visibleJoueurs dans l\'arbre du joueur');
  });

  // Panne visée : le joueur peut sonder la visibilité avec le filtre.
  it('joueur_qui_pose_visibilite_recoit_400', async () => {
    const m = await monde();
    const { u } = await dePlus(m);
    assert.equal((await liste(m.lea.ctx, u, 'type=personnage&visibilite=mj')).status, 400);
    assert.equal((await liste(m.lea.ctx, u, 'type=personnage&visibilite=joueurs')).status, 400);
  });

  // Panne visée : le MJ en mode Joueur reçoit encore l'état ou le filtre.
  it('mj_en_mode_joueur_ne_recoit_pas_visibleJoueurs_et_le_filtre_donne_400', async () => {
    const m = await monde();
    const { u } = await dePlus(m);
    const plat = await liste(m.antor.ctx, u, 'type=personnage&mode=joueur');
    assert.equal(plat.status, 200);
    assert.deepEqual(titres(plat.corps), ['Maître Aldric']);
    assert.ok(!('visibleJoueurs' in plat.corps.fiches[0]));
    assert.equal((await liste(m.antor.ctx, u, 'type=personnage&mode=joueur&visibilite=mj')).status, 400);
  });

  // Panne visée : l'état devient réglable (stockable) par le client.
  it('visibleJoueurs_n_est_pas_reglable', async () => {
    const m = await monde();
    const { u, prieur } = await dePlus(m);
    const p = await m.antor.ctx.request.patch(`/api/univers/${u}/fiches/${prieur}`, { data: { visibleJoueurs: true } });
    assert.equal(p.status(), 400);
    assert.deepEqual(titres((await liste(m.antor.ctx, u, 'type=personnage&visibilite=mj')).corps), ['Le Prieur masqué']);
  });
});

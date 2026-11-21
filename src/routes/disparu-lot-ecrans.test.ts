// Doors of `src/e2e/disparu-ensemble-verification.test.ts` (lot « écrans »): the « gone » mark of a sheet (B-67) through the API,
// and its import (B-68), on the starting world, in-process. The screen file keeps what is displayed.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { type Any, monter } from './monde-lot-ecrans.js';

const JETON = 'kvs_bouchon_essai_Hq7Zr2LmX9cVt4Wd8KpNb3YsJf6Ga0Ue';
const monde = await monter({ semis: true });
const { antor, lea, dire } = monde;

const us = (await dire(antor, 'GET', '/api/univers')).corps as Any[];
const U = us.find((u) => u.nom === "Lame d'Ébène").id as number;
const UKANKA = us.find((u) => u.nom === 'Essai Kanka').id as number;
const ids: Record<string, number> = {};
for (const f of (await dire(antor, 'GET', `/api/univers/${U}/fiches`)).corps.fiches as Any[]) ids[f.titre] = f.id;
ids['La Dette'] = (await dire(antor, 'POST', `/api/univers/${U}/fiches`, { type: 'quete', titre: 'La Dette' })).corps.id;

async function titres(h: typeof antor, query: string): Promise<string[]> {
  const r = await dire(h, 'GET', `/api/univers/${U}/fiches?${query}`);
  assert.equal(r.status, 200, query);
  return r.corps.fiches.map((f: Any) => f.titre as string).sort();
}
const marquer = (titre: string, disparu: boolean) => dire(antor, 'PATCH', `/api/univers/${U}/fiches/${ids[titre]}`, { disparu });

describe('B-67 par l’API : marquer, lire, filtrer', () => {
  test('antor_marque_bran_mort_puis_vivant_et_les_filtres_suivent', async () => {
    assert.deepEqual(await titres(antor, 'type=personnage&etat=disparu'), ['Le Prieur masqué']);
    const r = await marquer('Bran Corvalis', true);
    assert.equal(r.status, 200);
    assert.equal(r.corps.charge.disparu, true);
    assert.deepEqual(await titres(antor, 'type=personnage&etat=disparu'), ['Bran Corvalis', 'Le Prieur masqué']);
    const vivants = await titres(antor, 'type=personnage&etat=la');
    assert.ok(!vivants.includes('Bran Corvalis') && !vivants.includes('Le Prieur masqué'));
    assert.ok(vivants.includes('Maître Aldric'));
    assert.equal(vivants.length, 5);
    const v = await marquer('Bran Corvalis', false);
    assert.equal(v.status, 200);
    assert.ok(!v.corps.charge.disparu);
    assert.deepEqual(await titres(antor, 'type=personnage&etat=disparu'), ['Le Prieur masqué']);
    assert.equal((await titres(antor, 'type=personnage&etat=la')).length, 6);
  });

  test('le_phare_detruit_est_liste_par_etat_disparu_du_type_lieu', async () => {
    assert.deepEqual(await titres(antor, 'type=lieu&etat=disparu'), []);
    assert.equal((await marquer('Le Phare aux Sels', true)).status, 200);
    assert.deepEqual(await titres(antor, 'type=lieu&etat=disparu'), ['Le Phare aux Sels']);
    assert.ok(!(await titres(antor, 'type=lieu&etat=la')).includes('Le Phare aux Sels'));
    assert.equal((await marquer('Le Phare aux Sels', false)).status, 200);
  });

  test('marquer_deux_fois_est_idempotent', async () => {
    assert.equal((await marquer('Suie', true)).status, 200);
    const r = await marquer('Suie', true);
    assert.equal(r.status, 200);
    assert.equal(r.corps.charge.disparu, true);
    assert.equal((await marquer('Suie', false)).status, 200);
  });

  test('lea_lit_la_marque_et_filtre_comme_antor', async () => {
    assert.equal((await marquer('Bran Corvalis', true)).status, 200);
    try {
      const f = await dire(lea, 'GET', `/api/univers/${U}/fiches/${ids['Bran Corvalis']}`);
      assert.equal(f.status, 200);
      assert.equal(f.corps.charge.disparu, true);
      assert.deepEqual(await titres(lea, 'type=personnage&etat=disparu'), ['Bran Corvalis']);
    } finally {
      await marquer('Bran Corvalis', false);
    }
  });

  test('les_mots_des_sept_types_sont_ceux_de_la_doc', async () => {
    const t = (await dire(antor, 'GET', `/api/univers/${U}/types`)).corps as Any[];
    const attendu: Record<string, [string, string, string, string]> = {
      personnage: ['Mort', 'Marquer mort', 'Marquer vivant', 'skull'],
      creature: ['Morte', 'Marquer morte', 'Marquer vivante', 'skull'],
      famille: ['Éteinte', 'Marquer éteinte', 'Marquer vivante', 'skull'],
      faction: ['Détruite', 'Marquer détruite', 'Marquer active', 'shield-off'],
      lieu: ['Détruit', 'Marquer détruit', 'Marquer intact', 'flame'],
      objet: ['Détruit', 'Marquer détruit', 'Marquer intact', 'flame'],
      vaisseau: ['Détruit', 'Marquer détruit', 'Marquer intact', 'flame'],
    };
    for (const [type, [oui, menuOui, menuNon, icone]] of Object.entries(attendu)) {
      const d = t.find((x) => x.type === type)?.disparu;
      assert.ok(d, `${type} porte la marque`);
      assert.deepEqual([d.oui, d.menuOui, d.menuNon, d.icone], [oui, menuOui, menuNon, icone], type);
    }
    for (const type of ['evenement', 'quete', 'savoir', 'note', 'aventure']) {
      const x = t.find((y) => y.type === type);
      if (x) assert.equal(x.disparu, undefined, `${type} ne porte pas la marque`);
    }
  });
});

describe('B-67 par l’API : refus', () => {
  test('une_joueuse_ne_marque_pas', async () => {
    const r = await dire(lea, 'PATCH', `/api/univers/${U}/fiches/${ids['Bran Corvalis']}`, { disparu: true });
    assert.equal(r.status, 403);
    assert.ok(!(await titres(antor, 'type=personnage&etat=disparu')).includes('Bran Corvalis'));
  });
  test('un_mj_en_mode_joueur_ne_marque_pas', async () => {
    const r = await dire(antor, 'PATCH', `/api/univers/${U}/fiches/${ids['Bran Corvalis']}?mode=joueur`, { disparu: true });
    assert.equal(r.status, 403);
    assert.ok(!(await titres(antor, 'type=personnage&etat=disparu')).includes('Bran Corvalis'));
  });
  test('une_quete_et_un_savoir_refusent_la_marque_en_400', async () => {
    for (const t of ['La Dette', "Chronique de l'Âge d'Ombre", "Rapport secret de l'amirauté"]) {
      const r = await marquer(t, true);
      assert.equal(r.status, 400, t);
    }
    const q = await dire(antor, 'GET', `/api/univers/${U}/fiches/${ids['La Dette']}`);
    assert.ok(!q.corps.charge.disparu);
  });
  test('une_valeur_non_booleenne_est_refusee', async () => {
    for (const v of ['oui', 1, null]) {
      const r = await dire(antor, 'PATCH', `/api/univers/${U}/fiches/${ids['Bran Corvalis']}`, { disparu: v });
      assert.equal(r.status, 400, String(v));
    }
  });
  test('un_etat_inconnu_est_refuse_et_un_type_sans_marque_n_a_aucune_fiche_dans_aucun_etat', async () => {
    const r = await dire(antor, 'GET', `/api/univers/${U}/fiches?type=lieu&etat=mort`);
    assert.equal(r.status, 400);
    assert.deepEqual(await titres(antor, 'type=quete&etat=disparu'), []);
    assert.deepEqual(await titres(antor, 'type=quete&etat=la'), []);
  });
});

describe('B-68 : l’import pose la marque', () => {
  const put = async (cle: string, corps: Any) => {
    const r = await monde.app.inject({
      method: 'PUT',
      url: `/api/import/v1/univers/${UKANKA}/fiches/${cle}`,
      headers: { authorization: `Bearer ${JETON}`, 'content-type': 'application/json' },
      payload: JSON.stringify({ sections: [{ cle: 'd', titre: 'Description', contenu: 'x', joueursLisent: true }], ...corps }),
    });
    return { status: r.statusCode, json: r.json() as Any };
  };

  test('l_import_pose_disparu_sur_un_personnage_et_le_refuse_sur_une_quete', async () => {
    const ok = await put('personnage:xan', { type: 'personnage', titre: 'Xan', disparu: true });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.etat, 'creee');
    const f = await dire(antor, 'GET', `/api/univers/${UKANKA}/fiches/${ok.json.id}`);
    assert.equal(f.corps.charge.disparu, true);
    const ko = await put('quete:q', { type: 'quete', titre: 'Q', disparu: true });
    assert.equal(ko.status, 400);
    assert.equal(ko.json.code, 'champ_inconnu');
    assert.equal(ko.json.champ, 'disparu');
    const ko2 = await put('personnage:yan', { type: 'personnage', titre: 'Yan', disparu: 'oui' });
    assert.equal(ko2.status, 400);
  });

  test('rejoue_apres_marquer_vivant_l_import_remet_la_marque', async () => {
    const corps = { type: 'personnage', titre: 'Zed', disparu: true };
    const j = await put('personnage:zed', corps);
    assert.equal(j.json.etat, 'creee');
    const id = j.json.id as number;
    const m = await dire(antor, 'PATCH', `/api/univers/${UKANKA}/fiches/${id}`, { disparu: false });
    assert.equal(m.status, 200);
    const rejeu = await put('personnage:zed', corps);
    assert.equal(rejeu.status, 200);
    const f = await dire(antor, 'GET', `/api/univers/${UKANKA}/fiches/${id}`);
    assert.equal(rejeu.json.etat, 'mise_a_jour');
    assert.deepEqual(rejeu.json.avertissements, []);
    assert.equal(f.corps.charge.disparu, true, 'le script porte disparu : la marque est reposée');
  });
});

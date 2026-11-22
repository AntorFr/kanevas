// Review test of the setting carried by the player's table read (B-108, AD-battlemap-distance-3): `jeuADistance` is the
// setting itself, so a reader owning no visible token can tell « off » from « no token » (`deplacement` is false in both).
//
// TEST PLAN
//   lecture : jeuADistance true while on, false once off, for a player with and without a token; the GM's read has neither field
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;
const { buildApp } = await import('../../app.js');
const { semerBouchon, semerIllustrations } = await import('../../bouchon/depart.js');
const { poserActivation, poserReglages } = await import('../../services/outils.js');
const { ajouterMembre } = await import('../../services/membres.js');

type Any = any;
const one = (app: Any, sql: string, ...a: unknown[]) => app.db.prepare(sql).get(...a) as Any;

test('GET table d’un joueur : jeuADistance suit le réglage, avec ou sans pion à soi ; absent chez le MJ', async () => {
  const app: Any = await buildApp();
  try {
    assert.equal(semerBouchon(app.db), true);
    await semerIllustrations(app.db, mkdtempSync(join(tmpdir(), 'bm-jeu-')));
    const h: Record<string, string> = {};
    for (const c of ['antor', 'lea', 'teo']) {
      const res = await app.inject({ method: 'POST', url: '/connexion-bouchon',
        headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `compte=${c}` });
      h[c] = `kanevas_session=${res.cookies.find((x: Any) => x.name === 'kanevas_session')!.value}`;
    }
    const E = one(app, 'SELECT id FROM univers WHERE nom = ?', "Éneria d'essai").id as number;
    const S = one(app, 'SELECT id FROM systemes_jeu WHERE nom = ?', "Système d'essai").id as number;
    const compte = (u: string) => one(app, 'SELECT id FROM comptes WHERE username = ?', u).id as number;
    poserActivation(app.db, compte('antor'), { niveau: 'systeme', id: S }, 'battlemap/cartes', true);
    ajouterMembre(app.db, compte('antor'), E, 'teo', 'joueur');
    const R = `/api/univers/${E}/outils/battlemap/cartes`;
    const req = (method: string, who: string, url: string, payload?: Any) =>
      app.inject({ method, url, headers: { cookie: h[who]! }, payload });
    const { id } = (await req('POST', 'antor', R, { titre: 'Soute', largeur: 12, hauteur: 8 })).json();
    assert.equal((await req('PATCH', 'antor', `${R}/${id}`, { version: 1, visible: true })).statusCode, 200);
    const T = `${R}/${id}/table`;
    assert.equal((await req('POST', 'antor', T)).statusCode, 201);
    assert.equal((await req('POST', 'antor', `${T}/commandes`, { version: 1, commandes: [
      { type: 'ajouter_pion', id: 'a', nom: 'Mira', x: 1, y: 1 }, { type: 'reveler_rect', x: 0, y: 0, l: 5, h: 5 }] })).statusCode, 200);
    assert.equal((await req('PUT', 'antor', `${T}/pions/a/proprietaire`, { compte_id: compte('lea') })).statusCode, 200);

    const lire = async (who: string) => (await req('GET', who, T)).json();
    for (const who of ['lea', 'teo']) assert.equal((await lire(who)).jeuADistance, true, `${who}, réglage actif`);
    assert.equal((await lire('teo')).deplacement, false, 'teo n’a aucun pion');

    const v = one(app, "SELECT version_reglages v FROM outils_univers WHERE univers_id = ? AND outil = 'battlemap/cartes'", E)?.v ?? 0;
    poserReglages(app.db, compte('antor'), { niveau: 'univers', id: E }, 'battlemap/cartes', { version: v, valeurs: { jeu_a_distance: false } });
    for (const who of ['lea', 'teo']) {
      const t = await lire(who);
      assert.equal(t.jeuADistance, false, `${who}, réglage coupé`);
      assert.equal(t.deplacement, false);
    }
    assert.equal('jeuADistance' in (await lire('antor')), false, 'le MJ lit l’état, pas le champ du joueur');
  } finally { await app.close(); }
});

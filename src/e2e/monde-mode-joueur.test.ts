// Black-box complement of kanevas-monde (docs/ecrans.md, « Ce que chaque rôle y voit »): a GM in player mode
// keeps his real catalogue — he can propose and apply. Expected values are literals from that sentence.
// Panne visée : l'outil ou l'application filtrés par le mode Joueur au lieu du rôle réel.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { type Any, launch, skipBrowser, startServer } from './harnais.test.js';
import { bati, comptes, idProposition, json, lireSection, propUrl } from './monde-aide.test.js';

const opts = { skip: skipBrowser };
let srv: Awaited<ReturnType<typeof startServer>>;
let browser: Any;
let C: Awaited<ReturnType<typeof comptes>>;

before(async () => {
  if (skipBrowser) return;
  srv = await startServer();
  browser = await launch();
  C = await comptes(srv, browser);
});
after(async () => {
  await browser?.close();
  srv?.stop();
});

test('B-27 : Antor en mode Joueur propose et applique, comme hors mode', opts, async () => {
  const m = await bati(C.antor, C.lea);
  const r = await C.antor.ctx.request.post(`/api/univers/${m.univers}/assistant/messages?mode=joueur`, {
    data: { message: "Mets à jour la section « Vérité » de « Maître Aldric » d'après le compte-rendu « Séance 3 »" },
  });
  assert.equal(r.status(), 200);
  const rep = await json(r);
  assert.equal(rep.evenements.length, 1);
  assert.equal(rep.evenements[0].type, 'proposition_creee');
  assert.equal((await lireSection(C.antor, m)).contenu, 'Il sert la Couronne.');
  const pid = idProposition(rep);
  const lu = await C.antor.ctx.request.get(`${propUrl(m, pid)}?mode=joueur`);
  assert.equal(lu.status(), 200);
  assert.equal((await json(lu)).etat, 'en_attente');
  const ap = await C.antor.ctx.request.post(`${propUrl(m, pid)}/appliquer?mode=joueur`);
  assert.equal(ap.status(), 200);
  assert.equal((await json(ap)).etat, 'appliquee');
  assert.match((await lireSection(C.antor, m)).contenu, /^Il sert la Couronne\.\s+Mise à jour d'après « Séance 3 »\.$/);
});

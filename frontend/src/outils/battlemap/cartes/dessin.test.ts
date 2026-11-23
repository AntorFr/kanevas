// Review of kanevas-battlemap-editeur-dessin (E-28), written from the exit criterion and run on the real Wasm core.
//
// TEST PLAN
//   defaire     : un geste = un lot ; défaire un mur le retire, refaire le remet ; un nouveau geste vide « refaire »
//   file        : le lot part avec la version du serveur, l'accusé la fait avancer ; défaire suit le même chemin
//   carte_pleine: 409 carte_pleine → geste local annulé (document = dernier état accepté), refus « carte_pleine »
//   version     : 409 version → état « perime », plus aucun envoi
//   reprise     : panne réseau → file gardée, état « reessai », reprise à 1 s puis 2 s ; succès → « enregistre »
//   delai       : l'envoi attend ≈ 1 s après le dernier geste (une horloge qui ne tire pas n'envoie rien)
//   taille      : 200 → ok, 201 → « 200 cases au plus. » (limite lue du Wasm), texte non entier refusé
//   calque      : aucun calque / verrouillé → les phrases de la fiche
//   outils      : sol, mur (deux salles), porte, gomme — les commandes d'un geste, une seule par geste
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type * as CoeurWasm from '../../../../../rust/pkg/battlemap_core/battlemap_core.js';
import { chargerModule } from '../../../../../src/wasm/charger.js';
import type { Coeur } from './coeur';
import { Enregistreur, type Echec, type Horloge, type Transport } from './enregistreur';
import { calqueActif } from './geometrie';
import { Interaction, type Contexte } from './interaction';
import { Moteur } from './moteur';
import { erreurTaille, messageRefusTaille } from './taille';
import type { Commande, Document } from './types';

async function coeur(): Promise<{ coeur: Coeur; vide: () => Document }> {
  const m = await chargerModule<typeof CoeurWasm>('battlemap_core');
  return {
    vide: () => JSON.parse(m.carte_vide(30, 20)) as Document,
    coeur: {
      appliquerLot: (d, c) => JSON.parse(m.appliquerLot(JSON.stringify(d), JSON.stringify(c))),
      tailleMax: () => {
        const l = JSON.parse(m.limites());
        return { largeur: l.largeur_max, hauteur: l.hauteur_max };
      },
    },
  };
}

const ctx = (doc: Document, plus: Partial<Contexte> = {}): Contexte => ({
  doc, aimanter: true, empreinte: () => ({ largeur: 1, hauteur: 1 }), assetSol: 'herbe', assetMur: 'pierre', selection: [], ...plus,
});
const commandes = (i: Interaction) => {
  const r = i.terminer();
  assert.equal(r.k, 'commandes');
  return (r as { commandes: Commande[] }).commandes;
};
const geste = (outil: ConstructorParameters<typeof Interaction>[0], doc: Document, de: [number, number], a: [number, number], plus: Partial<Contexte> = {}, maj = false) => {
  const i = new Interaction(outil, ctx(doc, plus), { x: de[0], y: de[1] }, maj);
  i.deplacer({ x: a[0], y: a[1] });
  return i;
};

test('la carte vide du cœur a un calque de chaque type', async () => {
  const { vide } = await coeur();
  const d = vide();
  assert.deepEqual(d.calques.map((c) => c.type).sort(), ['mur', 'objet', 'sol']);
  assert.equal(d.largeur, 30);
  assert.equal(d.hauteur, 20);
});

test('défaire un mur le retire, refaire le remet, un geste neuf vide « refaire »', async () => {
  const { coeur: c, vide } = await coeur();
  const m = new Moteur(c, vide(), 1);
  const sol = calqueActif(m.document, 'sol') as { calque: { id: string } };
  const mur = calqueActif(m.document, 'mur') as { calque: { id: string } };
  assert.equal(m.geste([{ type: 'peindre_sol', calque: sol.calque.id, cellules: [{ x: 1, y: 1 }, { x: 2, y: 1 }], asset_id: 'herbe' }]).ok, true);
  assert.equal(m.geste([{ type: 'tracer_mur', calque: mur.calque.id, segments: [{ x: 0, y: 0, cote: 'h' }, { x: 1, y: 0, cote: 'h' }], asset_id: 'pierre' }]).ok, true);
  assert.equal(m.geste([{ type: 'tracer_mur', calque: mur.calque.id, segments: [{ x: 5, y: 5, cote: 'v' }], asset_id: 'pierre' }]).ok, true);
  assert.equal(m.document.murs.length, 3);
  assert.equal(m.file.length, 3, 'un geste = un lot');

  assert.equal(m.annuler().ok, true);
  assert.equal(m.document.murs.length, 2);
  assert.equal(m.document.murs.some((x) => x.x === 5), false, 'le dernier mur est absent');
  assert.equal(m.document.sols.length, 2, 'le sol reste');
  assert.equal(m.file.length, 4, 'défaire est un lot de plus');
  assert.equal(m.peutRefaire, true);

  assert.equal(m.refaire().ok, true);
  assert.equal(m.document.murs.length, 3);

  m.annuler();
  m.geste([{ type: 'peindre_sol', calque: sol.calque.id, cellules: [{ x: 9, y: 9 }], asset_id: 'herbe' }]);
  assert.equal(m.peutRefaire, false);
});

test('défaire sans historique ne fait rien et ne met rien en file', async () => {
  const { coeur: c, vide } = await coeur();
  const m = new Moteur(c, vide(), 1);
  assert.equal(m.peutAnnuler, false);
  assert.deepEqual(m.annuler(), { ok: true });
  assert.equal(m.file.length, 0);
});

test('un geste que le cœur refuse est ignoré : document, file et historique inchangés', async () => {
  const { coeur: c, vide } = await coeur();
  const m = new Moteur(c, vide(), 1);
  const sol = (calqueActif(m.document, 'sol') as { calque: { id: string } }).calque.id;
  const avant = JSON.stringify(m.document);
  const r = m.geste([{ type: 'peindre_sol', calque: sol, cellules: [{ x: 30, y: 0 }], asset_id: 'herbe' }]);
  assert.equal(r.ok, false);
  assert.equal(JSON.stringify(m.document), avant);
  assert.equal(m.file.length, 0);
  assert.equal(m.peutAnnuler, false);
});

function banc(plus: { transport?: Partial<Transport>; delai?: number } = {}) {
  const taches: { ms: number; f: () => void; id: number }[] = [];
  let n = 0;
  const horloge: Horloge = {
    attendre: (ms, f) => { const id = ++n; taches.push({ ms, f, id }); return id; },
    annuler: (id) => { const i = taches.findIndex((t) => t.id === id); if (i >= 0) taches.splice(i, 1); },
  };
  const envois: { version: number; commandes: Commande[] }[] = [];
  let version = 1;
  const transport: Transport = {
    lot: async (v, cs) => { envois.push({ version: v, commandes: cs }); return { version: ++version }; },
    reglage: async () => ({ version: ++version }),
    ...plus.transport,
  };
  return { taches, horloge, envois, transport, version: () => version };
}

test('autosave : rien ne part avant ≈ 1 s, puis un lot par geste avec la version du serveur', async () => {
  const { coeur: c, vide } = await coeur();
  const b = banc();
  const m = new Moteur(c, vide(), 1);
  const e = new Enregistreur(m, b.transport, () => {}, b.horloge);
  const sol = (calqueActif(m.document, 'sol') as { calque: { id: string } }).calque.id;
  m.geste([{ type: 'peindre_sol', calque: sol, cellules: [{ x: 0, y: 0 }], asset_id: 'herbe' }]);
  e.noter();
  m.geste([{ type: 'peindre_sol', calque: sol, cellules: [{ x: 1, y: 0 }], asset_id: 'herbe' }]);
  e.noter();
  assert.equal(b.envois.length, 0);
  assert.equal(e.etat, 'attente');
  assert.equal(b.taches.length, 1, 'un seul minuteur : le dernier geste repousse le délai');
  assert.equal(b.taches[0]!.ms, 1000);
  b.taches[0]!.f();
  await e.vider();
  assert.deepEqual(b.envois.map((x) => x.version), [1, 2]);
  assert.equal(m.file.length, 0);
  assert.equal(m.base.version, 3);
  assert.equal(e.etat, 'enregistre');
});

test('409 carte_pleine : le geste local est annulé, le refus est signalé', async () => {
  const { coeur: c, vide } = await coeur();
  const b = banc({ transport: { lot: async () => { throw { statut: 409, code: 'carte_pleine' } satisfies Echec; } } });
  const m = new Moteur(c, vide(), 1);
  const e = new Enregistreur(m, b.transport, () => {}, b.horloge);
  const avant = JSON.stringify(m.document);
  const sol = (calqueActif(m.document, 'sol') as { calque: { id: string } }).calque.id;
  m.geste([{ type: 'peindre_sol', calque: sol, cellules: [{ x: 0, y: 0 }], asset_id: 'herbe' }]);
  e.noter();
  await e.vider();
  assert.equal(e.refus, 'carte_pleine');
  assert.equal(JSON.stringify(m.document), avant, 'le document local revient au dernier état accepté');
  assert.equal(m.file.length, 0);
  assert.equal(m.peutAnnuler, false);
  assert.equal(e.etat, 'enregistre');
});

test('409 version : état « perime », plus aucun envoi, la file est gardée', async () => {
  const { coeur: c, vide } = await coeur();
  let appels = 0;
  const b = banc({ transport: { lot: async () => { appels++; throw { statut: 409, code: 'version' } satisfies Echec; } } });
  const m = new Moteur(c, vide(), 1);
  const e = new Enregistreur(m, b.transport, () => {}, b.horloge);
  const sol = (calqueActif(m.document, 'sol') as { calque: { id: string } }).calque.id;
  m.geste([{ type: 'peindre_sol', calque: sol, cellules: [{ x: 0, y: 0 }], asset_id: 'herbe' }]);
  e.noter();
  await e.vider();
  assert.equal(e.etat, 'perime');
  m.geste([{ type: 'peindre_sol', calque: sol, cellules: [{ x: 1, y: 0 }], asset_id: 'herbe' }]);
  e.noter();
  await e.vider();
  assert.equal(appels, 1);
  assert.equal(e.etat, 'perime');
});

test('panne réseau : la file est gardée, reprise à 1 s puis 2 s, puis « enregistre »', async () => {
  const { coeur: c, vide } = await coeur();
  let echecs = 2;
  const b = banc({ transport: { lot: async () => { if (echecs-- > 0) throw { statut: 0 } satisfies Echec; return { version: 2 }; } } });
  const m = new Moteur(c, vide(), 1);
  const e = new Enregistreur(m, b.transport, () => {}, b.horloge);
  const sol = (calqueActif(m.document, 'sol') as { calque: { id: string } }).calque.id;
  m.geste([{ type: 'peindre_sol', calque: sol, cellules: [{ x: 0, y: 0 }], asset_id: 'herbe' }]);
  e.noter();
  await e.vider();
  assert.equal(e.etat, 'reessai');
  assert.equal(m.file.length, 1);
  assert.equal(b.taches.at(-1)!.ms, 1000);
  b.taches.pop()!.f();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(e.etat, 'reessai');
  assert.equal(b.taches.at(-1)!.ms, 2000);
  b.taches.pop()!.f();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(e.etat, 'enregistre');
  assert.equal(m.file.length, 0);
});

test('serveur en 500 : traité comme une panne, pas comme un refus (le geste reste)', async () => {
  const { coeur: c, vide } = await coeur();
  const b = banc({ transport: { lot: async () => { throw { statut: 503 } satisfies Echec; } } });
  const m = new Moteur(c, vide(), 1);
  const e = new Enregistreur(m, b.transport, () => {}, b.horloge);
  const sol = (calqueActif(m.document, 'sol') as { calque: { id: string } }).calque.id;
  m.geste([{ type: 'peindre_sol', calque: sol, cellules: [{ x: 0, y: 0 }], asset_id: 'herbe' }]);
  e.noter();
  await e.vider();
  assert.equal(e.etat, 'reessai');
  assert.equal(m.document.sols.length, 1);
});

test('taille : la limite vient du Wasm, 200 passe, 201 est refusé avant tout envoi', async () => {
  const { coeur: c } = await coeur();
  const max = c.tailleMax().largeur;
  assert.equal(max, 200);
  assert.equal(erreurTaille('200', max), null);
  assert.equal(erreurTaille('201', max), '200 cases au plus.');
  assert.equal(erreurTaille('0', max), 'Entrez un nombre entier de cases.');
  assert.equal(erreurTaille('abc', max), 'Entrez un nombre entier de cases.');
  assert.equal(erreurTaille('12.5', max), 'Entrez un nombre entier de cases.');
  assert.equal(erreurTaille('', max), 'Entrez un nombre entier de cases.');
  assert.equal(messageRefusTaille({ statut: 400, code: 'limite_depassee', message: 'x' }, max, 10, 10), 'Des éléments sont hors des nouvelles limites.');
});

test('calque actif : le premier visible et déverrouillé ; sinon les phrases de la fiche', async () => {
  const { vide } = await coeur();
  const d = vide();
  const un = (t: string) => d.calques.find((c) => c.type === t)!;
  assert.equal((calqueActif(d, 'mur') as { calque: { id: string } }).calque.id, un('mur').id);
  un('mur').verrouille = true;
  assert.deepEqual(calqueActif(d, 'mur'), { message: 'Ce calque est verrouillé.' });
  d.calques = d.calques.filter((c) => c.type !== 'sol');
  assert.deepEqual(calqueActif(d, 'sol'), { message: 'Créez d’abord un calque de ce type.' });
  d.calques.push({ id: 's2', nom: 'S2', type: 'sol', visible: true, verrouille: false, mj_seul: false });
  assert.equal((calqueActif(d, 'sol') as { calque: { id: string } }).calque.id, 's2');
});

test('outils : deux salles et une porte, un geste = une commande, le cœur les accepte', async () => {
  const { coeur: c, vide } = await coeur();
  const m = new Moteur(c, vide(), 1);
  const jouer = (i: Interaction) => assert.equal(m.geste(commandes(i)).ok, true);
  jouer(geste('sol', m.document, [1.2, 1.2], [8.5, 5.5], {}, true));
  assert.equal(m.document.sols.length, 8 * 5, 'maj = rectangle plein');
  jouer(geste('mur', m.document, [1, 1], [8, 5], {}, true));
  assert.equal(m.document.murs.length, 22, 'contour d’un rectangle 7×4 = 22 segments');
  jouer(geste('mur', m.document, [10, 1], [14, 4], {}, true));
  assert.equal(m.document.murs.length, 22 + 14);
  const avantPorte = m.document.murs.length;
  jouer(geste('porte', m.document, [3.5, 1.05], [3.5, 1.05]));
  assert.equal(m.document.murs.length, avantPorte, 'une porte ne crée pas de mur');
  assert.equal(m.document.murs.filter((x) => x.porte).length, 1);
  assert.deepEqual(m.document.murs.find((x) => x.porte), { calque: m.document.murs[0]!.calque, x: 3, y: 1, cote: 'h', asset_id: 'pierre', porte: true });
  // la même porte, cliquée de nouveau, s'ôte
  jouer(geste('porte', m.document, [3.5, 1.05], [3.5, 1.05]));
  assert.equal(m.document.murs.filter((x) => x.porte).length, 0);
});

test('porte hors de tout mur : aucun lot, un message', async () => {
  const { vide } = await coeur();
  const r = geste('porte', vide(), [10, 10], [10, 10]).terminer();
  assert.deepEqual(r, { k: 'message', texte: 'Cliquez sur un mur pour poser ou ôter une porte.' });
});

test('sol sans carte choisie : message, pas de commande ; calque de sol verrouillé : phrase du calque', async () => {
  const { vide } = await coeur();
  const d = vide();
  assert.deepEqual(geste('sol', d, [1, 1], [2, 2], { assetSol: null }).terminer(), { k: 'message', texte: 'Choisissez un sol dans la bibliothèque.' });
  d.calques.find((c) => c.type === 'sol')!.verrouille = true;
  assert.deepEqual(geste('sol', d, [1, 1], [2, 2]).terminer(), { k: 'message', texte: 'Ce calque est verrouillé.' });
});

test('un trait de sol rapide ne laisse pas de trou entre deux cellules', async () => {
  const { vide } = await coeur();
  const cs = commandes(geste('sol', vide(), [0.5, 0.5], [6.5, 0.5]))[0]!.cellules as { x: number }[];
  assert.deepEqual(cs.map((c) => c.x).sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6]);
});

test('un mur hors de la carte : le cœur refuse, le geste est ignoré', async () => {
  const { coeur: c, vide } = await coeur();
  const m = new Moteur(c, vide(), 1);
  const cmds = commandes(geste('mur', m.document, [29, 0], [35, 0]));
  assert.equal(m.geste(cmds).ok, false);
  assert.equal(m.document.murs.length, 0);
});
test('gomme : un mur croisé part en un seul lot que le cœur accepte (commande sans champ en trop)', async () => {
  const { coeur: c, vide } = await coeur();
  const m = new Moteur(c, vide(), 1);
  m.geste(commandes(geste('mur', m.document, [1, 1], [8, 5], {}, true)));
  const n = m.file.length;
  const cmds = commandes(geste('gomme', m.document, [5.5, 1], [5.5, 1]));
  assert.deepEqual(cmds, [{ type: 'gommer', calque: 'murs', segments: [{ x: 5, y: 1, cote: 'h' }] }]);
  assert.equal(m.geste(cmds).ok, true, 'le cœur refuse une commande qui porte asset_id / porte / calque dans ses segments');
  assert.equal(m.file.length, n + 1);
  assert.equal(m.document.murs.some((x) => x.x === 5 && x.y === 1 && x.cote === 'h'), false);
  assert.equal(m.document.murs.length, 21);
});

test('gomme : un sol peint part avec son geste', async () => {
  const { coeur: c, vide } = await coeur();
  const m = new Moteur(c, vide(), 1);
  m.geste(commandes(geste('sol', m.document, [1.2, 1.2], [3.5, 1.5], {}, true)));
  assert.equal(m.geste(commandes(geste('gomme', m.document, [2.5, 1.5], [2.5, 1.5]))).ok, true);
  assert.equal(m.document.sols.length, 2);
});

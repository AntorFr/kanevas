// Review of kanevas-battlemap-table-flux (AD-battlemap-table-6): the shared live client, with a fake EventSource and fake timers.
//
// TEST PLAN
//   calme    : un flux sain dont seul un battement arrive toutes les 20 s ne bascule jamais (au-delà de 30 s de temps total)
//   muet     : pas de maj initial en 4 s → sondage toutes les 3 s ; 30 s sans rien → sondage ; le flux est fermé
//   direct   : chaque maj recharge ; maj pendant un rechargement → un de plus, jamais en parallèle ; presence → surPresence
//   coupure  : onerror → « perdue », le maj de la reconnexion recharge et remet « direct »
//   sondage  : sondage rejeté → « perdue », puis reprise ; fermer() arrête tout
//   reprise  : avecReprise : 409 → recharge + un renvoi ; second 409 → TableChangee ; autre erreur passée telle quelle
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { avecReprise, ouvrirDirect, TableChangee, type EtatConnexion, type Minuteries, type SourceFlux } from './flux';

class Horloge implements Minuteries {
  t = 0; private n = 1;
  private taches = new Map<number, { a: number; f: () => void; pas?: number }>();
  setTimeout(f: () => void, ms: number) { const id = this.n++; this.taches.set(id, { a: this.t + ms, f }); return id; }
  setInterval(f: () => void, ms: number) { const id = this.n++; this.taches.set(id, { a: this.t + ms, f, pas: ms }); return id; }
  clearTimeout(id: unknown) { this.taches.delete(id as number); }
  clearInterval(id: unknown) { this.taches.delete(id as number); }
  get actifs() { return this.taches.size; }
  async avancer(ms: number) {
    const fin = this.t + ms;
    for (;;) {
      let prochain: [number, { a: number; f: () => void; pas?: number }] | null = null;
      for (const e of this.taches) if (e[1].a <= fin && (!prochain || e[1].a < prochain[1].a)) prochain = e;
      if (!prochain) break;
      const [id, tache] = prochain;
      this.t = tache.a;
      if (tache.pas) tache.a += tache.pas; else this.taches.delete(id);
      tache.f();
      await Promise.resolve(); await Promise.resolve();
    }
    this.t = fin;
    await Promise.resolve(); await Promise.resolve();
  }
}

class Faux implements SourceFlux {
  ecouteurs = new Map<string, (e: { data?: string }) => void>();
  onerror: ((e: unknown) => void) | null = null;
  ferme = false;
  addEventListener(t: string, f: (e: { data?: string }) => void) { this.ecouteurs.set(t, f); }
  close() { this.ferme = true; }
  emettre(t: string, data?: string) { this.ecouteurs.get(t)?.({ data }); }
}

function monter(recharger: () => Promise<unknown> | unknown = () => {}) {
  const h = new Horloge();
  const sources: Faux[] = [];
  const etats: EtatConnexion[] = [];
  const presences: number[] = [];
  const d = ouvrirDirect({
    url: '/flux', recharger, minuteries: h, surEtat: (e) => etats.push(e), surPresence: (n) => presences.push(n),
    fabrique: () => { const s = new Faux(); sources.push(s); return s; },
  });
  return { h, d, sources, etats, presences };
}

test('un flux sain mais calme (battement toutes les 20 s) ne bascule jamais en sondage', async () => {
  let n = 0;
  const { h, d, sources, etats } = monter(() => { n++; });
  sources[0]!.emettre('maj', '{"carte":1,"table":1}');
  await h.avancer(0);
  for (let i = 0; i < 10; i++) { await h.avancer(20_000); sources[0]!.emettre('battement', '{}'); }
  assert.equal(d.etat(), 'direct');
  assert.deepEqual(etats, ['direct']);
  assert.equal(sources[0]!.ferme, false);
  assert.equal(n, 1);
  d.fermer();
});

test('pas de maj initial en 4 s : le flux est fermé et le sondage recharge toutes les 3 s', async () => {
  let n = 0;
  const { h, d, sources, etats } = monter(() => { n++; });
  await h.avancer(3_999);
  assert.equal(d.etat(), 'connexion');
  await h.avancer(1);
  assert.equal(d.etat(), 'sondage');
  assert.equal(sources[0]!.ferme, true);
  assert.equal(n, 1, 'un rechargement immédiat à la bascule');
  await h.avancer(3_000);
  assert.equal(n, 2);
  await h.avancer(6_000);
  assert.equal(n, 4);
  assert.deepEqual(etats, ['sondage']);
  d.fermer();
  await h.avancer(10_000);
  assert.equal(n, 4, 'fermé : plus de sondage');
  assert.equal(h.actifs, 0);
});

test('un battement seul ne remplace pas le maj initial : sans maj en 4 s, on bascule', async () => {
  const { h, d, sources } = monter();
  await h.avancer(2_000);
  sources[0]!.emettre('battement', '{}');
  await h.avancer(2_000);
  assert.equal(d.etat(), 'sondage');
  d.fermer();
});

test('flux muet 30 s après un maj : sondage ; un événement ou un battement repousse l’échéance', async () => {
  let n = 0;
  const { h, d, sources } = monter(() => { n++; });
  sources[0]!.emettre('maj', '{}');
  await h.avancer(29_000);
  sources[0]!.emettre('battement', '{}');
  await h.avancer(29_000);
  assert.equal(d.etat(), 'direct');
  sources[0]!.emettre('presence', '{"affichages":1}');
  await h.avancer(29_999);
  assert.equal(d.etat(), 'direct');
  await h.avancer(1);
  assert.equal(d.etat(), 'sondage');
  assert.equal(sources[0]!.ferme, true);
  assert.ok(n >= 2);
  d.fermer();
});

test('chaque maj recharge, jamais deux rechargements en parallèle, et un maj pendant l’un en demande un de plus', async () => {
  let enCours = 0; let max = 0; let total = 0;
  const lib: Array<() => void> = [];
  const { h, d, sources } = monter(() => new Promise<void>((ok) => {
    enCours++; total++; max = Math.max(max, enCours);
    lib.push(() => { enCours--; ok(); });
  }));
  sources[0]!.emettre('maj'); sources[0]!.emettre('maj'); sources[0]!.emettre('maj');
  await h.avancer(0);
  assert.equal(total, 1);
  lib.shift()!();
  await h.avancer(0);
  assert.equal(total, 2, 'les signaux arrivés pendant le rechargement en valent un seul de plus');
  lib.shift()!();
  await h.avancer(0);
  assert.equal(total, 2);
  assert.equal(max, 1);
  d.fermer();
});

test('presence est remontée au MJ ; une trame illisible ou sans nombre ne dit rien', async () => {
  const { d, sources, presences } = monter();
  sources[0]!.emettre('presence', '{"affichages":2}');
  sources[0]!.emettre('presence', 'pas du json');
  sources[0]!.emettre('presence', '{"affichages":"2"}');
  sources[0]!.emettre('presence', '{"affichages":0}');
  assert.deepEqual(presences, [2, 0]);
  d.fermer();
});

test('coupure : onerror → perdue ; le maj de la reconnexion recharge et remet direct', async () => {
  let n = 0;
  const { h, d, sources, etats } = monter(() => { n++; });
  sources[0]!.emettre('maj');
  await h.avancer(0);
  assert.equal(n, 1);
  sources[0]!.onerror!(new Error('coupé'));
  assert.equal(d.etat(), 'perdue');
  sources[0]!.emettre('maj');
  await h.avancer(0);
  assert.equal(d.etat(), 'direct');
  assert.equal(n, 2, 'rechargement complet à la reconnexion');
  assert.deepEqual(etats, ['direct', 'perdue', 'direct']);
  d.fermer();
});

test('un rechargement qui échoue sur un maj : perdue ; le sondage rejeté : perdue, puis reprise quand le serveur revient', async () => {
  let panne = true;
  const { h, d, sources, etats } = monter(() => { if (panne) throw new Error('réseau'); });
  sources[0]!.emettre('maj');
  await h.avancer(0);
  assert.equal(d.etat(), 'perdue');
  await h.avancer(33_000);
  assert.equal(d.etat(), 'perdue', 'le sondage a basculé, le serveur reste injoignable');
  panne = false;
  await h.avancer(3_000);
  assert.equal(d.etat(), 'sondage');
  assert.ok(etats.includes('sondage'));
  d.fermer();
});

test('fermer() ferme la source, éteint toutes les minuteries et ignore les trames suivantes', async () => {
  let n = 0;
  const { h, d, sources } = monter(() => { n++; });
  d.fermer();
  assert.equal(sources[0]!.ferme, true);
  assert.equal(h.actifs, 0);
  sources[0]!.emettre('maj');
  await h.avancer(60_000);
  assert.equal(n, 0);
});

test('avecReprise : un 409 recharge puis renvoie une fois ; un second 409 est TableChangee ; une autre erreur passe telle quelle', async () => {
  const conflit = Object.assign(new Error('conflit'), { statut: 409 });
  let envois = 0; let rech = 0;
  const ok = await avecReprise(async () => { envois++; if (envois === 1) throw conflit; return 'ok'; }, async () => { rech++; });
  assert.deepEqual([ok, envois, rech], ['ok', 2, 1]);
  envois = 0; rech = 0;
  await assert.rejects(avecReprise(async () => { envois++; throw conflit; }, async () => { rech++; }), (e) => e instanceof TableChangee && e.message === 'Cette table a changé');
  assert.deepEqual([envois, rech], [2, 1]);
  const autre = Object.assign(new Error('boum'), { statut: 500 });
  envois = 0; rech = 0;
  await assert.rejects(avecReprise(async () => { envois++; throw autre; }, async () => { rech++; }), autre);
  assert.deepEqual([envois, rech], [1, 0]);
  const apres = Object.assign(new Error('403'), { statut: 403 });
  await assert.rejects(avecReprise(async () => { if (envois++ === 1) throw conflit; throw apres; }, async () => {}), apres);
});

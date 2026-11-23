// Feature-level black-box tests of kanevas-concepteur-vaisseaux-cibles, the writer part of H-10 (5): « catalogue import, design import, design storage and export all
// learn `cibles`, and the fingerprint covers them » (feature sheet, exit criterion: « L'import, le stockage et l'export de conception portent `cibles` et l'empreinte les couvre »).
// HTTP level: real app in stub mode, real SQLite. The design that a catalogue file carries is an example (`exemples`, `choix`). Expected values are literals.
//
// TEST PLAN (coque « Coque C2 », laser 3/3, canon 5/5)
// import   nominal : un exemple dont une ligne de montage porte cibles [laser ×1, canon ×1] est importé (0 refus) et relu avec ses cibles, telles quelles
// import   bords  : une cible sur une ligne de quantité 2 répartie en deux paires (1+1) ; la même ligne sans cibles s'importe aussi (comme avant l'epic)
// import   échec  : trou — le besoin ne dit pas ce que devient une cible vers un élément absent du fichier (rendu, sans test)
// empreinte: rejouer le même fichier (même version) avec d'autres cibles → l'exemple est « modifié », pas « inchangé » ; le rejouer à l'identique → inchangé
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import type { Any } from './serveur-lot-vaisseaux.ts';

process.env.NODE_ENV = 'test';
process.env.KANEVAS_STUB = '1';
delete process.env.DB_PATH;
const { buildApp } = await import('../app.js');
const { semerBouchon } = await import('../bouchon/depart.js');

type Appli = Awaited<ReturnType<typeof buildApp>>;
const applis: Appli[] = [];
after(() => applis.forEach((a) => void a.close()));
type Rep = { status: number; json: Any; texte: string };
type Client = (methode: string, chemin: string, corps?: unknown) => Promise<Rep>;

async function session(base: string, compte: string): Promise<Client> {
  const r = await fetch(`${base}/connexion-bouchon`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `compte=${compte}` });
  const cookie = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
  assert.ok(cookie, `no session cookie for ${compte}`);
  return async (methode, chemin, corps) => {
    const rep = await fetch(base + chemin, { method: methode, headers: { cookie, ...(corps === undefined ? {} : { 'content-type': 'application/json' }) }, body: corps === undefined ? undefined : JSON.stringify(corps) });
    const texte = await rep.text();
    let json: Any = null;
    try { json = JSON.parse(texte); } catch { /* not json */ }
    return { status: rep.status, json, texte };
  };
}

const el = { cout: 0, puissance: 0, masse: 0, x_cout: false, x_puissance: false, x_masse: false, pv: 0, ca: 0, limite: 0 };
const coque = { cout: 300000, pv: 20, ca: 12, puissance: 30, masse: 30, emports: 4, facteur_cout: 1, facteur_puissance: 1, facteur_masse: 1, vitesse: 3, armure: 5, moteur_spike: 0 };
const arme = (puissance: number, masse: number) => ({ ...el, puissance, masse, emport: 1, munitions: 0, cout_munition: 0, classe_min: 1 });
const cib = (cle: string, quantite = 1) => ({ nature: 'armes', cle, quantite });

const catalogue = (version: string, choix: Any[]): Any => ({
  catalogue: 'swn/vaisseaux', version,
  coques: [{ cle: 'c2', nom: 'Coque C2', classe: 2, ...coque }],
  moteurs: [], amenagements: [], defenses: [],
  armes: [{ cle: 'laser', nom: 'Laser', ...arme(3, 3) }, { cle: 'canon', nom: 'Canon', ...arme(5, 5) }],
  modifications: [{ cle: 'montage', nom: 'Montage', ...el, effet: 'montages_specialises' }],
  exemples: [{ cle: 'ex-1', nom: 'Exemple un', coque: 'c2', choix }],
});
const ligneArme = (cle: string, quantite = 1) => ({ nature: 'armes', cle, quantite });

async function monde() {
  const app = await buildApp();
  semerBouchon(app.db);
  await app.listen({ port: 0, host: '127.0.0.1' });
  applis.push(app);
  const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  const antor = await session(base, 'antor');
  const E = ((await antor('GET', '/api/univers')).json as Any[]).find((u) => u.nom === "Éneria d'essai").id as number;
  return { antor, V: `/api/univers/${E}/outils/swn/vaisseaux` };
}
const exemple = async (m: Awaited<ReturnType<typeof monde>>) =>
  (await m.antor('GET', `${m.V}/catalogue?nature=exemples`)).json.elements.find((x: Any) => x.cle === 'ex-1');

describe('H-10 (5) · import du catalogue : les exemples portent « cibles »', () => {
  it('nominal : une ligne de montage à deux installations (laser, canon) est importée sans refus et relue avec ses cibles', async () => {
    const m = await monde();
    const choix = [ligneArme('laser'), ligneArme('canon'), { nature: 'modifications', cle: 'montage', quantite: 2, cibles: [cib('laser'), cib('canon')] }];
    const r = await m.antor('POST', `${m.V}/catalogue/application`, catalogue('ex-cibles-1', choix));
    assert.equal(r.status, 200, r.texte);
    assert.equal(r.json.refusTotal, 0, r.texte);
    const e = await exemple(m);
    assert.ok(e, 'exemple relu');
    const ligne = (e.donnees?.choix ?? e.choix).find((x: Any) => x.cle === 'montage');
    assert.deepEqual(ligne.cibles, [cib('laser'), cib('canon')]);
  });

  it('bord : le même exemple sans « cibles » (fichier d’avant l’epic) s’importe sans refus', async () => {
    const m = await monde();
    const r = await m.antor('POST', `${m.V}/catalogue/application`, catalogue('ex-cibles-2', [ligneArme('laser'), { nature: 'modifications', cle: 'montage', quantite: 1 }]));
    assert.equal(r.status, 200, r.texte);
    assert.equal(r.json.refusTotal, 0, r.texte);
  });
});

describe('H-10 (5) · empreinte : un changement de « cibles » seul est un changement de l’exemple', () => {
  it('rejouer à l’identique : inchangé ; rejouer avec une autre cible : l’exemple est modifié', async () => {
    const m = await monde();
    const avec = (cle: string) => [ligneArme('laser'), ligneArme('canon'), { nature: 'modifications', cle: 'montage', quantite: 1, cibles: [cib(cle)] }];
    const un = await m.antor('POST', `${m.V}/catalogue/application`, catalogue('ex-cibles-4', avec('laser')));
    assert.equal(un.json.refusTotal, 0, un.texte);
    const idem = await m.antor('POST', `${m.V}/catalogue/application`, catalogue('ex-cibles-4', avec('laser')));
    const autre = await m.antor('POST', `${m.V}/catalogue/application`, catalogue('ex-cibles-4', avec('canon')));
    assert.deepEqual([idem.json.natures.exemples.inchanges, idem.json.natures.exemples.modifies], [1, 0], idem.texte);
    assert.deepEqual([autre.json.natures.exemples.inchanges, autre.json.natures.exemples.modifies], [0, 1], autre.texte);
    const e = await exemple(m);
    const ligne = (e.donnees?.choix ?? e.choix).find((x: Any) => x.cle === 'montage');
    assert.deepEqual(ligne.cibles, [cib('canon')]);
  });
});

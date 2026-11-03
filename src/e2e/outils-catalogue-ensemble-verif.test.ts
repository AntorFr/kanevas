// Feature-level black-box tests of kanevas-outils-catalogue (API level, real server in stub mode, real SQLite),
// written from the feature sheet, docs/parcours.md (B-61, B-62, B-64, B-65, P-17), docs/ecrans.md (E-20, E-18)
// and the routes table of ARCHITECTURE.md (K-7). Expected values are literals taken from the exit criterion.
// Worlds: the stub seed (« Éneria d'essai », « Univers voisin », « Système d'essai », tool essai/g).
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { startServer, type Any, type Server } from './harnais.test.ts';

const servers: Server[] = [];
after(() => servers.forEach((s) => s.stop()));

type Rep = { status: number; json: Any; texte: string };
type Client = (methode: string, chemin: string, corps?: unknown) => Promise<Rep>;

async function lire(r: Response): Promise<Rep> {
  const texte = await r.text();
  let json: Any = null;
  try { json = JSON.parse(texte); } catch { /* html or empty */ }
  return { status: r.status, json, texte };
}

async function session(base: string, compte: string): Promise<Client> {
  const r = await fetch(`${base}/connexion-bouchon`, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `compte=${compte}`,
  });
  const cookie = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
  assert.ok(cookie, `no session cookie for ${compte}`);
  return async (methode, chemin, corps) =>
    lire(await fetch(base + chemin, {
      method: methode,
      headers: { cookie, ...(corps === undefined ? {} : { 'content-type': 'application/json' }) },
      body: corps === undefined ? undefined : typeof corps === 'string' ? corps : JSON.stringify(corps),
    }));
}

async function jeton(base: string, methode: string, chemin: string, tok: string, corps?: unknown): Promise<Rep> {
  return lire(await fetch(base + chemin, {
    method: methode,
    headers: { authorization: `Bearer ${tok}`, ...(corps === undefined ? {} : { 'content-type': 'application/json' }) },
    body: corps === undefined ? undefined : typeof corps === 'string' ? corps : JSON.stringify(corps),
  }));
}

// The 12-element file of the criterion: 4 hulls, 8 weapons, « laser-lourd » without its mandatory `masse`.
const coque = (cle: string, nom: string, masse: number, cout: number) => ({ cle, nom, masse, cout });
const arme = (cle: string, nom: string, masse: number, cout: number, portee: 'courte' | 'longue') => ({ cle, nom, masse, cout, portee });
function fichier12(): Any {
  return {
    catalogue: 'essai/g',
    version: '2026-11-essai',
    coques: [coque('corvette', 'Corvette', 12, 100), coque('cargo', 'Cargo', 20, 80), coque('fregate', 'Frégate', 35, 240), coque('patrouilleur', 'Patrouilleur', 8, 60)],
    armes: [
      arme('laser', 'Laser à impulsion', 2, 12, 'courte'),
      { cle: 'laser-lourd', nom: 'Laser lourd', cout: 28, portee: 'longue' },
      arme('canon-leger', 'Canon léger', 3, 9, 'courte'),
      arme('mitrailleuse', 'Mitrailleuse', 1, 5, 'courte'),
      arme('torpille', 'Torpille', 4, 18, 'longue'),
      arme('missile', 'Missile', 2, 14, 'longue'),
      arme('brouilleur', 'Brouilleur', 1, 10, 'courte'),
      arme('harpon', 'Harpon', 3, 7, 'courte'),
    ],
  };
}

const CAT = (u: number) => `/api/univers/${u}/outils/essai/g/catalogue`;
const SYS = (s: number) => `/api/systemes/${s}/outils/essai/g/catalogue`;

interface Monde {
  base: string; E: number; V: number; S: number;
  antor: Client; lea: Client; mira: Client;
}

/** A fresh seeded world, the trial tool enabled in both universes of the system. */
async function monde(): Promise<Monde> {
  const srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
  servers.push(srv);
  const antor = await session(srv.base, 'antor');
  const lea = await session(srv.base, 'lea');
  const mira = await session(srv.base, 'mira');
  const us = (await antor('GET', '/api/univers')).json as Any[];
  const id = (n: string) => us.find((u) => u.nom === n).id as number;
  const E = id("Éneria d'essai");
  const V = id('Univers voisin');
  const S = us.find((u) => u.nom === "Éneria d'essai").systeme.id as number;
  for (const u of [E, V]) assert.equal((await antor('PUT', `/api/univers/${u}/outils/essai/g/activation`, { active: true })).status, 204);
  return { base: srv.base, E, V, S, antor, lea, mira };
}

const cles = (r: Rep): string[] => (r.json.elements as Any[]).map((e) => `${e.nature}/${e.cle}`).sort();
async function tout(c: Client, chemin: string): Promise<Any[]> {
  const out: Any[] = [];
  for (const nature of ['coques', 'armes']) {
    const r = await c('GET', `${chemin}?nature=${nature}`);
    assert.equal(r.status, 200, `${chemin} ${nature}: ${r.texte}`);
    out.push(...r.json.elements);
  }
  return out;
}

describe('B-61 import du catalogue du système (P-17 étape 2)', () => {
  it('aperçu: 11 ajoutés, 1 refusé avec le champ, et rien d’écrit', async () => {
    const m = await monde();
    const r = await m.antor('POST', `${SYS(m.S)}/apercu`, fichier12());
    assert.equal(r.status, 200);
    assert.equal(r.json.natures.coques.ajoutes + r.json.natures.armes.ajoutes, 11);
    assert.equal(r.json.natures.coques.modifies + r.json.natures.armes.modifies, 0);
    assert.equal(r.json.natures.armes.refuses, 1);
    assert.deepEqual(r.json.refus, [{ nature: 'armes', cle: 'laser-lourd', champ: 'masse', raison: 'nombre attendu' }]);
    assert.equal(r.json.versionCatalogue ?? null, null, 'preview must not set a catalogue version');
    assert.deepEqual((await tout(m.antor, CAT(m.E))), [], 'nothing written before « Appliquer »');
    const liste = (await m.antor('GET', `/api/univers/${m.E}/outils`)).json.outils.find((o: Any) => o.cle === 'essai/g');
    assert.equal(liste.catalogue.systeme.version, null);
  });

  it('application puis rejeu: 11 inchangés, version stable, élément refusé jamais écrit', async () => {
    const m = await monde();
    const a = await m.antor('POST', `${SYS(m.S)}/application`, fichier12());
    assert.equal(a.status, 200);
    assert.equal(a.json.natures.coques.ajoutes + a.json.natures.armes.ajoutes, 11);
    assert.equal(a.json.versionCatalogue, '2026-11-essai');
    const vus = await tout(m.antor, CAT(m.E));
    assert.equal(vus.length, 11);
    assert.ok(!vus.some((e) => e.cle === 'laser-lourd'));
    const b = await m.antor('POST', `${SYS(m.S)}/application`, fichier12());
    assert.equal(b.json.natures.coques.inchanges + b.json.natures.armes.inchanges, 11);
    assert.equal(b.json.natures.coques.ajoutes + b.json.natures.armes.ajoutes + b.json.natures.coques.modifies + b.json.natures.armes.modifies, 0);
    assert.equal((await tout(m.antor, CAT(m.E))).length, 11, 'replay creates no duplicate');
    // « Univers voisin » reads the system catalogue too
    assert.equal((await tout(m.antor, CAT(m.V))).length, 11);
    const carte = (await m.antor('GET', `/api/univers/${m.E}/outils`)).json.outils.find((o: Any) => o.cle === 'essai/g').catalogue;
    assert.equal(carte.systeme.version, '2026-11-essai');
    assert.deepEqual(carte.systeme.comptes, { coques: 4, armes: 7 });
  });

  it('élément retiré du fichier non supprimé, élément changé compté modifié (AD-130)', async () => {
    const m = await monde();
    await m.antor('POST', `${SYS(m.S)}/application`, fichier12());
    const f = fichier12();
    f.coques = f.coques.filter((c: Any) => c.cle !== 'cargo'); // cargo leaves the file
    f.coques.find((c: Any) => c.cle === 'corvette').masse = 13; // corvette changes
    const ap = await m.antor('POST', `${SYS(m.S)}/apercu`, f);
    assert.equal(ap.json.natures.coques.modifies, 1);
    assert.equal(ap.json.natures.coques.ajoutes, 0);
    assert.equal(ap.json.absents, 1);
    const r = await m.antor('POST', `${SYS(m.S)}/application`, f);
    assert.equal(r.json.natures.coques.modifies, 1);
    const vus = await tout(m.antor, CAT(m.E));
    assert.equal(vus.length, 11, 'cargo is still there');
    assert.ok(vus.some((e) => e.cle === 'cargo'));
    assert.match(vus.find((e) => e.cle === 'corvette').resume, /13/);
  });

  it('bords: fichier sans élément, clé en double refusée, deux refus comptés', async () => {
    const m = await monde();
    const vide = await m.antor('POST', `${SYS(m.S)}/apercu`, { catalogue: 'essai/g', version: 'v0', coques: [], armes: [] });
    assert.equal(vide.status, 200);
    assert.equal(vide.json.refusTotal, 0);
    const f = { catalogue: 'essai/g', version: 'v1', coques: [coque('a', 'A', 1, 1), coque('a', 'A bis', 2, 2), { cle: 'b', nom: 'B', cout: 3 }], armes: [] };
    const r = await m.antor('POST', `${SYS(m.S)}/apercu`, f);
    assert.equal(r.json.natures.coques.ajoutes, 1);
    assert.equal(r.json.natures.coques.refuses, 2);
    assert.equal(r.json.refusTotal, 2);
    assert.deepEqual(r.json.refus.map((x: Any) => `${x.cle}:${x.champ}`).sort(), ['a:cle', 'b:masse']);
  });

  it('échec: fichier illisible, mauvais outil, section inconnue, sans version', async () => {
    const m = await monde();
    for (const corps of ['ceci n’est pas du JSON', '[]', JSON.stringify({ catalogue: 'essai/a', version: 'v', coques: [] }),
      JSON.stringify({ catalogue: 'essai/g', version: 'v', canons: [] }), JSON.stringify({ catalogue: 'essai/g', coques: [] })]) {
      for (const suffixe of ['apercu', 'application']) {
        const r = await m.antor('POST', `${SYS(m.S)}/${suffixe}`, corps);
        assert.equal(r.status, 400, `${suffixe} ${corps}`);
        assert.equal(r.json.message, "Ce fichier n'est pas un catalogue valide.");
        assert.equal(r.json.code, 'catalogue_invalide');
      }
    }
    assert.deepEqual(await tout(m.antor, CAT(m.E)), []);
  });

  it('échec: plus de 5 000 éléments refusé en bloc, rien n’est écrit', async () => {
    const m = await monde();
    const coques = Array.from({ length: 5001 }, (_, i) => coque(`c${i}`, `C${i}`, 1, 1));
    const r = await m.antor('POST', `${SYS(m.S)}/application`, { catalogue: 'essai/g', version: 'v', coques, armes: [] });
    assert.equal(r.status, 400);
    assert.equal(r.json.message, 'Ce catalogue dépasse 5 000 éléments.');
    assert.deepEqual(await tout(m.antor, CAT(m.E)), []);
  });

  it('échec: plus de 8 Mio refusé (413 fichier_trop_gros)', async () => {
    const m = await monde();
    const gros = JSON.stringify({ catalogue: 'essai/g', version: 'v', coques: [], armes: [], bourrage: 'x'.repeat(8 * 1024 * 1024 + 10) });
    const r = await m.antor('POST', `${SYS(m.S)}/apercu`, gros);
    assert.equal(r.status, 413);
    assert.equal(r.json.code, 'fichier_trop_gros');
    assert.equal(r.json.message, 'Ce fichier est trop volumineux (8 Mio au plus).');
  });

  it('exclusion: MJ non responsable, joueur et MJ en mode joueur n’écrivent pas le système', async () => {
    const m = await monde();
    for (const [qui, client, suffixe] of [['mira', m.mira, ''], ['lea', m.lea, ''], ['antor joueur', m.antor, '?mode=joueur']] as const) {
      for (const etape of ['apercu', 'application']) {
        const r = await client('POST', `${SYS(m.S)}/${etape}${suffixe}`, fichier12());
        assert.ok(r.status >= 400 && r.status < 500, `${qui} ${etape} → ${r.status}`);
      }
    }
    assert.deepEqual(await tout(m.antor, CAT(m.E)), []);
    // and the responsible still can
    assert.equal((await m.antor('POST', `${SYS(m.S)}/application`, fichier12())).status, 200);
  });
});

describe('B-62 deux niveaux: l’univers remplace le système par la même clé', () => {
  it('un élément de l’univers remplace celui du système pour cet univers seul', async () => {
    const m = await monde();
    await m.antor('POST', `${SYS(m.S)}/application`, fichier12());
    const f = { catalogue: 'essai/g', version: '2026-12-orak', coques: [], armes: [arme('laser', 'Laser d’Éneria', 9, 99, 'longue')] };
    const ap = await m.antor('POST', `/api/univers/${m.E}/outils/essai/g/catalogue/apercu`, f);
    assert.equal(ap.json.remplacements, 1);
    assert.equal(ap.json.natures.armes.ajoutes, 1);
    const r = await m.antor('POST', `/api/univers/${m.E}/outils/essai/g/catalogue/application`, f);
    assert.equal(r.status, 200);
    const eneria = (await tout(m.antor, CAT(m.E))).filter((e) => e.cle === 'laser');
    assert.equal(eneria.length, 1, 'one « laser » row in Éneria, not two');
    assert.equal(eneria[0].nom, 'Laser d’Éneria');
    assert.equal(eneria[0].origine, 'remplace');
    const voisin = (await tout(m.antor, CAT(m.V))).filter((e) => e.cle === 'laser');
    assert.equal(voisin.length, 1);
    assert.equal(voisin[0].nom, 'Laser à impulsion');
    assert.equal(voisin[0].origine, 'systeme');
    // the system's own rows are untouched
    const sys = (await m.antor('GET', `${SYS(m.S)}?nature=armes`)).json.elements.filter((e: Any) => e.cle === 'laser');
    assert.equal(sys.length, 1);
    assert.equal(sys[0].nom, 'Laser à impulsion');
    // rejeu de l'import d'univers: pas de doublon
    const rejeu = await m.antor('POST', `/api/univers/${m.E}/outils/essai/g/catalogue/application`, f);
    assert.equal(rejeu.json.natures.armes.inchanges, 1);
  });

  it('exclusion: un MJ de l’univers importe pour l’univers même sans être responsable; un joueur non', async () => {
    const m = await monde();
    const f = { catalogue: 'essai/g', version: 'u1', coques: [coque('cristal', 'Cristal d’Orak’Ziel', 1, 1)], armes: [] };
    assert.equal((await m.mira('POST', `/api/univers/${m.E}/outils/essai/g/catalogue/application`, f)).status, 200);
    const r = await m.lea('POST', `/api/univers/${m.E}/outils/essai/g/catalogue/application`, { ...f, version: 'u2' });
    assert.ok(r.status >= 400 && r.status < 500);
    assert.equal((await tout(m.antor, CAT(m.E))).length, 1);
  });
});

describe('B-62 masquer, retirer, rétablir', () => {
  async function avecUnivers(): Promise<Monde> {
    const m = await monde();
    await m.antor('POST', `${SYS(m.S)}/application`, fichier12());
    const f = { catalogue: 'essai/g', version: 'u', coques: [], armes: [arme('lance', "Lance d'essai", 3, 30, 'courte')] };
    assert.equal((await m.antor('POST', `/api/univers/${m.E}/outils/essai/g/catalogue/application`, f)).status, 200);
    return m;
  }
  const masque = (m: Monde, nature: string, cle: string, v: boolean, version: number) =>
    m.antor('PUT', `${CAT(m.E)}/${nature}/${cle}/masque`, { masque: v, version });

  it('élément d’univers masqué: Léa ne le lit pas, sans trace; rendu visible, elle le lit', async () => {
    const m = await avecUnivers();
    assert.ok((await tout(m.lea, CAT(m.E))).some((e) => e.cle === 'lance'), 'Léa reads the universe element while it is visible');
    const avant = (await tout(m.antor, `${CAT(m.E)}/gestion`)).find((e) => e.cle === 'lance');
    const r = await masque(m, 'armes', 'lance', true, avant.version);
    assert.equal(r.status, 200);
    const lea = await m.lea('GET', `${CAT(m.E)}?nature=armes`);
    assert.equal(lea.status, 200);
    assert.ok(!lea.texte.includes('lance'), 'no key');
    assert.ok(!lea.texte.includes("Lance d'essai"), 'no name');
    assert.ok(!/masqu/i.test(lea.texte), 'no trace of a masking');
    assert.equal(lea.json.elements.length, 7, 'the 7 other weapons, no gap');
    const antor = (await tout(m.antor, `${CAT(m.E)}/gestion`)).find((e) => e.cle === 'lance');
    assert.equal(antor.masque, true);
    const rendu = await masque(m, 'armes', 'lance', false, antor.version);
    assert.equal(rendu.status, 200);
    assert.ok((await tout(m.lea, CAT(m.E))).some((e) => e.cle === 'lance'));
  });

  it('exclusion: aucun geste ne masque un élément du système', async () => {
    const m = await avecUnivers();
    const sys = (await tout(m.antor, `${CAT(m.E)}/gestion`)).find((e) => e.cle === 'torpille');
    const r = await masque(m, 'armes', 'torpille', true, sys.version);
    assert.ok(r.status >= 400 && r.status < 500, `status ${r.status}`);
    assert.ok((await tout(m.lea, CAT(m.E))).some((e) => e.cle === 'torpille'));
    // not even by the system route
    const r2 = await m.antor('PUT', `${SYS(m.S)}/armes/torpille/masque`, { masque: true, version: 1 });
    assert.ok(r2.status >= 400);
    assert.ok((await tout(m.lea, CAT(m.E))).some((e) => e.cle === 'torpille'));
    assert.ok((await tout(m.antor, CAT(m.V))).some((e) => e.cle === 'torpille'));
  });

  it('retirer un élément du système: personne ne le lit dans cet univers, l’univers voisin oui; rétablir le ramène', async () => {
    const m = await avecUnivers();
    const r = await m.antor('PUT', `${CAT(m.E)}/coques/corvette/retrait`, { retire: true });
    assert.equal(r.status, 200);
    const vusLea = await tout(m.lea, CAT(m.E));
    assert.ok(!vusLea.some((e) => e.cle === 'corvette'), 'Léa must not read the withdrawn hull');
    assert.equal(vusLea.filter((e) => e.nature === 'coques').length, 3);
    // a GM, if the list carries the withdrawn hull at all, carries it flagged « retire », never as a usable system element
    for (const c of [m.antor, m.mira]) {
      const x = (await tout(c, CAT(m.E))).find((e) => e.cle === 'corvette');
      assert.ok(x === undefined || x.origine === 'retire', `GM reads a withdrawn hull as ${x?.origine}`);
    }
    const lea = await m.lea('GET', `${CAT(m.E)}?nature=coques`);
    assert.ok(!/retir/i.test(lea.texte), 'no trace of the withdrawal for a player');
    // Antor, GM, sees it dimmed as withdrawn in the management list
    const g = (await tout(m.antor, `${CAT(m.E)}/gestion`)).find((e) => e.cle === 'corvette');
    assert.equal(g.origine, 'retire');
    const voisin = (await tout(m.antor, CAT(m.V))).find((e) => e.cle === 'corvette');
    assert.equal(voisin.origine, 'systeme');
    const retabli = await m.antor('PUT', `${CAT(m.E)}/coques/corvette/retrait`, { retire: false });
    assert.equal(retabli.status, 200);
    assert.ok((await tout(m.lea, CAT(m.E))).some((e) => e.cle === 'corvette'));
  });

  it('exclusion: un joueur ne masque ni ne retire', async () => {
    const m = await avecUnivers();
    const l = (await tout(m.lea, CAT(m.E))).find((e) => e.cle === 'lance');
    const a = await m.lea('PUT', `${CAT(m.E)}/armes/lance/masque`, { masque: true, version: l.version });
    const b = await m.lea('PUT', `${CAT(m.E)}/coques/corvette/retrait`, { retire: true });
    assert.ok(a.status >= 400 && a.status < 500);
    assert.ok(b.status >= 400 && b.status < 500);
    const vus = await tout(m.lea, CAT(m.E));
    assert.ok(vus.some((e) => e.cle === 'lance') && vus.some((e) => e.cle === 'corvette'));
  });

  it('B-48: un import ne défait ni le masquage ni le retrait', async () => {
    const m = await avecUnivers();
    const l = (await tout(m.antor, CAT(m.E))).find((e) => e.cle === 'lance');
    assert.equal((await masque(m, 'armes', 'lance', true, l.version)).status, 200);
    assert.equal((await m.antor('PUT', `${CAT(m.E)}/coques/corvette/retrait`, { retire: true })).status, 200);
    // re-apply the universe file containing « lance », and the system file containing « corvette » (changed, so it is written)
    const fu = { catalogue: 'essai/g', version: 'u', coques: [], armes: [arme('lance', "Lance d'essai révisée", 4, 31, 'courte')] };
    assert.equal((await m.antor('POST', `/api/univers/${m.E}/outils/essai/g/catalogue/application`, fu)).status, 200);
    const fs = fichier12();
    fs.coques.find((c: Any) => c.cle === 'corvette').masse = 14;
    assert.equal((await m.antor('POST', `${SYS(m.S)}/application`, fs)).status, 200);
    const lea = await tout(m.lea, CAT(m.E));
    assert.ok(!lea.some((e) => e.cle === 'lance'), 'the element stays hidden after the import');
    assert.ok(!lea.some((e) => e.cle === 'corvette'), 'the element stays withdrawn after the import');
    const g = await tout(m.antor, `${CAT(m.E)}/gestion`);
    assert.equal(g.find((e) => e.cle === 'lance').masque, true);
    assert.equal(g.find((e) => e.cle === 'lance').nom, "Lance d'essai révisée", 'the import did update the content');
    assert.equal(g.find((e) => e.cle === 'corvette').origine, 'retire');
  });

  it('un élément du système remplacé pour l’univers puis masqué: Léa ne lit ni le remplacement ni celui du système', async () => {
    const m = await avecUnivers();
    const f = { catalogue: 'essai/g', version: 'u3', coques: [], armes: [arme('laser', 'Laser d’Éneria', 9, 99, 'longue')] };
    await m.antor('POST', `/api/univers/${m.E}/outils/essai/g/catalogue/application`, f);
    const rempl = (await tout(m.antor, `${CAT(m.E)}/gestion`)).find((e) => e.cle === 'laser');
    assert.equal(rempl.origine, 'remplace');
    assert.equal((await masque(m, 'armes', 'laser', true, rempl.version)).status, 200);
    const lea = await m.lea('GET', `${CAT(m.E)}?nature=armes`);
    assert.ok(!lea.texte.includes('"laser"'), 'neither the replacement nor the system « laser »');
    assert.ok(!lea.texte.includes('Laser'), 'no « Laser » name at all');
    assert.ok(!lea.texte.includes('Laser à impulsion'));
    // and « Univers voisin » still reads the system's
    assert.ok((await tout(m.antor, CAT(m.V))).some((e) => e.cle === 'laser' && e.origine === 'systeme'));
  });
});

describe('B-64 version contre l’écriture concurrente', () => {
  it('deux écritures du même élément avec la même version lue: la seconde reçoit conflit / donnee_modifiee', async () => {
    const m = await monde();
    const f = { catalogue: 'essai/g', version: 'u', coques: [], armes: [arme('lance', "Lance d'essai", 3, 30, 'courte')] };
    await m.antor('POST', `/api/univers/${m.E}/outils/essai/g/catalogue/application`, f);
    const v = (await tout(m.antor, CAT(m.E))).find((e) => e.cle === 'lance').version;
    const premiere = await m.antor('PUT', `${CAT(m.E)}/armes/lance/masque`, { masque: true, version: v });
    assert.equal(premiere.status, 200);
    const seconde = await m.mira('PUT', `${CAT(m.E)}/armes/lance/masque`, { masque: false, version: v });
    assert.equal(seconde.status, 409);
    assert.equal(seconde.json.code, 'donnee_modifiee');
    // the stale write changed nothing: still hidden for Léa
    assert.ok(!(await tout(m.lea, CAT(m.E))).some((e) => e.cle === 'lance'));
  });
});

describe('B-65 jeton à portée d’outil', () => {
  async function creer(m: Monde, corps: Any, qui: Client = m.antor): Promise<string> {
    const r = await qui('POST', `/api/univers/${m.E}/jetons`, corps);
    assert.equal(r.status, 201, r.texte);
    return r.json.valeur as string;
  }
  const IMP = (m: Monde) => `/api/import/v1/univers/${m.E}/outils/essai/g/catalogue`;
  const fu = { catalogue: 'essai/g', version: 'u-jeton', coques: [coque('cristal', 'Cristal', 1, 1)], armes: [] };

  it('un jeton à la portée d’Essai G écrit le catalogue de l’univers; sans la portée: 401 et aucun lot', async () => {
    const m = await monde();
    const outil = await creer(m, { nom: 'script', dureeJours: 7, outils: ['essai/g'] });
    const contenu = await creer(m, { nom: 'contenu', dureeJours: 7 });
    const ok = await jeton(m.base, 'PUT', `${IMP(m)}?niveau=univers`, outil, fu);
    assert.equal(ok.status, 200, ok.texte);
    assert.equal((await tout(m.antor, CAT(m.E))).length, 1);
    for (const [methode, chemin] of [['PUT', `${IMP(m)}?niveau=univers`], ['POST', `${IMP(m)}/apercu`], ['POST', `/api/import/v1/univers/${m.E}/lots?outil=essai/g`]] as const) {
      const r = await jeton(m.base, methode, chemin, contenu, fu);
      assert.equal(r.status, 401, `${methode} ${chemin}`);
      assert.equal(r.json.code, 'jeton_invalide');
    }
    assert.equal(((await m.antor('GET', `/api/univers/${m.E}/lots`)).json as Any[]).length, 0, 'the refused calls opened no batch');
  });

  it('exclusion: un jeton d’outil n’ouvre aucune route de contenu; le jeton de contenu, lui, écrit des fiches', async () => {
    const m = await monde();
    const outil = await creer(m, { nom: 'script', dureeJours: 7, outils: ['essai/g'] });
    const contenu = await creer(m, { nom: 'contenu', dureeJours: 7 });
    const fiche = { type: 'lieu', titre: 'Port', sections: [] };
    const ok = await jeton(m.base, 'PUT', `/api/import/v1/univers/${m.E}/fiches/lieu:port`, contenu, fiche);
    assert.ok(ok.status === 200 || ok.status === 201, `content token control: ${ok.status} ${ok.texte}`);
    for (const [methode, chemin, corps] of [['PUT', `/api/import/v1/univers/${m.E}/fiches/lieu:port2`, fiche], ['POST', `/api/import/v1/univers/${m.E}/lots`, undefined], ['GET', `/api/import/v1/univers/${m.E}`, undefined]] as const) {
      const r = await jeton(m.base, methode, chemin, outil, corps);
      assert.equal(r.status, 401, `${methode} ${chemin}`);
      assert.equal(r.json.code, 'jeton_invalide');
    }
    assert.equal(((await m.antor('GET', `/api/univers/${m.E}/lots`)).json as Any[]).length, 0);
  });

  it('un jeton d’outil d’un autre univers: 404; un jeton révoqué: 401', async () => {
    const m = await monde();
    const outil = await creer(m, { nom: 'script', dureeJours: 7, outils: ['essai/g'] });
    const autre = await jeton(m.base, 'PUT', `/api/import/v1/univers/${m.V}/outils/essai/g/catalogue?niveau=univers`, outil, fu);
    assert.equal(autre.status, 404);
    const liste = (await m.antor('GET', `/api/univers/${m.E}/jetons`)).json as Any[];
    const id = liste.find((j) => j.nom === 'script').id;
    assert.equal((await m.antor('POST', `/api/univers/${m.E}/jetons/${id}/revoquer`)).status < 300, true);
    const r = await jeton(m.base, 'PUT', `${IMP(m)}?niveau=univers`, outil, fu);
    assert.equal(r.status, 401);
    assert.deepEqual(await tout(m.antor, CAT(m.E)), []);
  });

  it('création d’un jeton d’outil: au moins un outil exigé, un outil sans catalogue refusé', async () => {
    const m = await monde();
    for (const outils of [[], ['essai/a'], ['essai/inconnu']]) {
      const r = await m.antor('POST', `/api/univers/${m.E}/jetons`, { nom: 'x', dureeJours: 7, outils });
      if (outils.length === 0) continue; // an empty list is a content token: see « Trous »
      assert.ok(r.status >= 400 && r.status < 500, `outils=${outils} → ${r.status}`);
    }
    const offerts = await m.antor('GET', `/api/univers/${m.E}/jetons/outils`);
    assert.equal(offerts.status, 200);
    assert.deepEqual((offerts.json as Any[]).map((o) => o.cle), ['essai/g']);
    const kanka = (await m.antor('GET', '/api/univers')).json.find((u: Any) => u.nom === 'Essai Kanka').id;
    assert.deepEqual((await m.antor('GET', `/api/univers/${kanka}/jetons/outils`)).json, [], 'no system, nothing offered');
  });

  it('lot d’outil nommé par l’outil, compteurs par nature, refus avec le champ', async () => {
    const m = await monde();
    const outil = await creer(m, { nom: 'script', dureeJours: 7, outils: ['essai/g'] });
    const lot = await jeton(m.base, 'POST', `/api/import/v1/univers/${m.E}/lots?outil=essai/g`, outil);
    assert.equal(lot.status, 201);
    const r = await jeton(m.base, 'PUT', `${IMP(m)}?niveau=univers&lot=${lot.json.lotId}`, outil, fichier12());
    assert.equal(r.status, 200, r.texte);
    const lots = (await m.antor('GET', `/api/univers/${m.E}/lots`)).json as Any[];
    assert.equal(lots.length, 1);
    assert.equal(lots[0].outil.libelle, 'Essai G');
    assert.deepEqual(lots[0].compteurs.coques, { creees: 4, mises_a_jour: 0, inchangees: 0, refusees: 0 });
    assert.deepEqual(lots[0].compteurs.armes, { creees: 7, mises_a_jour: 0, inchangees: 0, refusees: 1 });
    assert.deepEqual(lots[0].refus.map((x: Any) => [x.objet, x.cle, x.raison]), [['armes', 'laser-lourd', 'champ `masse` : nombre attendu']]);
  });

  it('un lot d’outil exige l’outil pour un jeton d’outil, et le refuse pour un jeton de contenu', async () => {
    const m = await monde();
    const outil = await creer(m, { nom: 'script', dureeJours: 7, outils: ['essai/g'] });
    const contenu = await creer(m, { nom: 'contenu', dureeJours: 7 });
    const sans = await jeton(m.base, 'POST', `/api/import/v1/univers/${m.E}/lots`, outil);
    assert.ok(sans.status >= 400 && sans.status < 500, `tool token without ?outil → ${sans.status}`);
    const avec = await jeton(m.base, 'POST', `/api/import/v1/univers/${m.E}/lots?outil=essai/g`, contenu);
    assert.ok(avec.status >= 400 && avec.status < 500, `content token with ?outil → ${avec.status}`);
  });

  it('catalogue du système par jeton: seulement si le compte du jeton en est le responsable à cet instant', async () => {
    const m = await monde();
    const miraJeton = await creer(m, { nom: 'mira', dureeJours: 7, outils: ['essai/g'] }, m.mira);
    const antorJeton = await creer(m, { nom: 'antor', dureeJours: 7, outils: ['essai/g'] });
    const sys = (tok: string, v: string) => jeton(m.base, 'PUT', `${IMP(m)}?niveau=systeme`, tok, { ...fichier12(), version: v });
    const refuse = await sys(miraJeton, 'm1');
    assert.equal(refuse.status, 403, 'GM but not the responsible');
    assert.deepEqual(await tout(m.antor, CAT(m.E)), []);
    const ok = await sys(antorJeton, 'a1');
    assert.equal(ok.status, 200, ok.texte);
    assert.equal((await tout(m.antor, CAT(m.E))).length, 11);
    // the responsibility moves to Mira: Antor's token no longer writes the system, Mira's does
    const mira = (await m.antor('GET', `/api/univers/${m.E}/membres`)).json.find((x: Any) => x.username === 'mira').compteId;
    assert.equal((await m.antor('POST', `/api/systemes/${m.S}/responsable`, { compteId: mira })).status < 300, true);
    assert.equal((await sys(antorJeton, 'a2')).status, 403);
    assert.equal((await sys(miraJeton, 'm2')).status, 200);
  });

  it('Antor devenu Joueur: son jeton reçoit 401 sur le catalogue du système comme de l’univers', async () => {
    const m = await monde();
    const antorJeton = await creer(m, { nom: 'antor', dureeJours: 7, outils: ['essai/g'] });
    const antorId = (await m.antor('GET', `/api/univers/${m.E}/membres`)).json.find((x: Any) => x.username === 'antor').compteId;
    const r = await m.mira('PATCH', `/api/univers/${m.E}/membres/${antorId}`, { role: 'joueur' });
    assert.ok(r.status < 300, `demotion ${r.status} ${r.texte}`);
    for (const niveau of ['systeme', 'univers']) {
      const x = await jeton(m.base, 'PUT', `${IMP(m)}?niveau=${niveau}`, antorJeton, fichier12());
      assert.equal(x.status, 401, niveau);
    }
    assert.deepEqual(await tout(m.mira, CAT(m.E)), []);
  });
});

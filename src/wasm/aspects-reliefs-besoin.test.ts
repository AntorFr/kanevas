// Verification written from the need (B-114, P-27, AD-rendu-3; `docs/donnees.md` table of the core's keys, `livre` and criterion of
// kanevas-carte-rendu-aspects-reliefs), not from the code: every new key of the core changes the picture in the direction the table
// states, a body that carries none draws as before, the draw is deterministic. The door is `dessiner` of the Wasm core, the call the
// illustration route's worker makes. Expected values are literals measured on pictures. Neutral bodies (AD-131).
// Needs `npm run build:wasm` (rust/pkg).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { catalogueAspects, dessiner, versionRendu } from './coeur.js';

type Aspect = Record<string, unknown>;
const V = await versionRendu();
const dess = (type: string, aspect: Aspect, cote = 128, angle?: number) => dessiner(JSON.stringify({ type, aspect }), cote, V, angle);
const lum = (o: Uint8Array, i: number) => 0.2126 * o[i * 4]! + 0.7152 * o[i * 4 + 1]! + 0.0722 * o[i * 4 + 2]!;
/** A neutral body on a uniform grey ground: no cap, no halo, no sea, no cloud, no rim light. */
const gris = (extra: Aspect = {}): Aspect => ({ graine: 7, palette: Array(7).fill('#808080'), calottes: 0, halo: 0, bord: 0, mer: 0, nuages: 0, ...extra });
const opaques = (o: Uint8Array) => { const r: number[] = []; for (let i = 0; i < o.length / 4; i++) if (o[i * 4 + 3] === 255) r.push(i); return r; };
const egal = (a: Uint8Array, b: Uint8Array) => Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;

/** Pixels of the disc (opaque in both) that are darker (`signe` -1) or brighter (+1) by more than `seuil` in luminance than in `ref`. */
function changes(o: Uint8Array, ref: Uint8Array, signe: 1 | -1, seuil: number) {
  let n = 0;
  for (let i = 0; i < o.length / 4; i++) if (o[i * 4 + 3] === 255 && ref[i * 4 + 3] === 255 && signe * (lum(o, i) - lum(ref, i)) > seuil) n++;
  return n;
}
/** Ratio of the horizontal to the vertical luminance gradient inside the disc (clouds or bands lying along the parallels give < 1). */
function anisotropie(o: Uint8Array, C: number, rayon: number) {
  let gx = 0, gy = 0, gxy = 0;
  for (let y = 1; y < C - 1; y++) for (let x = 1; x < C - 1; x++) {
    if (Math.hypot(x - C / 2, y - C / 2) > rayon) continue;
    const dx = lum(o, y * C + x + 1) - lum(o, y * C + x), dy = lum(o, (y + 1) * C + x) - lum(o, y * C + x);
    gx += Math.abs(dx); gy += Math.abs(dy); gxy += dx * dy;
  }
  return { rapport: gx / gy, signe: gxy };
}

// ---- a body without any new key draws as before ------------------------------------------------------------------

// SHA-256 of three pictures (64 px) per type, drawn by the code of the epic's base before this slice (version 2), literal.
const AVANT: Record<string, string> = {
  anomalie: '98376ef433335a3cfdd7237eaf8d7c116690090e6450f8d3e6a60cd2e3f332b8',
  asteroides: '2259385c18f80df7786d64d3a2d0db69d7719022fc02e2a63d668027a5a81c52',
  blanche: '6fc6046c9b11d9f42b96856bc5dec06c56fef0c526e58a7fe500cc327ff42d30',
  ceinture: 'ce57b297a3d7c5d86f7db42b02c06e0c439b46751fed888411ee7af61109d6fc',
  comete: '6ad0a28d50612caa2b7cbfb1ad147227e9488490de40f29f490fefaefcd9cb8f',
  etoile: '6b5932742a951aa8bc0250d6f0c779da3b92477b1b07a3af6e0d21a00a9ee144',
  gazeuse: 'b2cb690f1b4a945ff80d5a4e6387c377b4b5853fc397971f1b53ee732947a5c4',
  geante_bleue: 'c6c2019fe943f989b8776795621381060bb4c9a087e085ba2e795c614185af3b',
  geante_rouge: 'ea0f683657ae8aab9253de979933ea2d5ff58b9d18313bd92453b82a176770cf',
  glace: '0f2f1901d2fd39174531953efcfb6eb38326063a67082b130a0b42e72f7b62fb',
  jaune: '2d68f0d6ef7e5cb93acab3450ae9ba4622d4fd61b359dd1b600d62ecf422472e',
  jaune_orange: 'c16dca02cf2b6c3e3aed08bc50bda9e049fddf476edd510c7d8abe8ca396963a',
  jaune_vert: 'cd83d258b9503d43f5d029f8444e65d003d6a2b196955fb4b942d35e0677f15c',
  lave: '1bd5ed2f6becf7f2ca49c4d31bec359ccfaaaa1424396c8c24a91e6e52344c0b',
  naine_blanche: 'b823ed45296524d6be0d44c0a14e97ef4351930d1e1e518534d2ba3303fb20fc',
  naine_rouge: '5349d5cf2c95e39abd2d062f9296b0fdbbf4729bb93b2e9efbdc260f2d20ecf5',
  nebuleuse: 'c81d778ffdac9ab6e927e6c23d7ef241fc384887252587534f9c31d8d2ac89cc',
  orange: '45a8a43adf788f464b6f12844cd9f8fb26bcf2e753bc3afb959a75b8af5ccf74',
  rocheux: '66925b9015a7a22d04fd7d4fe0d62bd210839dd6e59fdd184f33f714a7550081',
  tellurique: 'f2cd7527a0a36c34129354f0c41c7c5a63fe72720131a20e02ab337730d6a34f',
  verrouillee: 'cc2a9029e02bbcdc60ef2effde612e0b80d2b2e84391361823b68f0ea4f09a1c',
};
const VARIANTES: Aspect[] = [
  {},
  { graine: 3 },
  { graine: 9, mer: 0.6, nuages: 0.7, calottes: 0.5, relief: 1.2, halo: 0.4, fissures: 0.5, crateres: 100, turbulence: 1.5, tache: { latitude: 0.3 }, anneau: { opacite: 0.8 } },
];

// Panne : une clé neuve (ou une valeur par défaut déplacée) change l'image d'un corps qui n'en porte aucune.
test('un corps sans clé neuve, de chacun des 21 types, est dessiné à l\'octet près comme avant la tranche', async () => {
  const types = Object.keys(JSON.parse(await catalogueAspects()).types).sort();
  assert.deepEqual(types, Object.keys(AVANT).sort());
  for (const t of types) {
    const h = createHash('sha256');
    for (const a of VARIANTES) h.update(await dess(t, a, 64));
    assert.equal(h.digest('hex'), AVANT[t], t);
  }
});

// Panne : la courbure [0, 1], déjà permise avant, ne dessine plus comme avant depuis que la borne est élargie à [-1, 1].
test('courbure : de 0 à 1 la comète est dessinée comme avant', async () => {
  const h = createHash('sha256');
  for (const c of [0, 0.4, 0.8, 1]) h.update(await dess('comete', { graine: 4, courbure: c }, 64));
  assert.equal(h.digest('hex'), '4a1283a1be33ff3d53d5dd6391d15cc8a59d1a9cec297db3a403178bb56d860b');
});

// ---- the neutral value of each key leaves the picture as the body without the key -----------------------------------

const NEUTRES: Array<[string, string, unknown]> = [
  ['tellurique', 'terre_seche', 0], ['tellurique', 'etirement', 1], ['tellurique', 'opacite_nuages', 1], ['tellurique', 'eclairs', 0],
  ['tellurique', 'inclinaison', 0], ['gazeuse', 'inclinaison', 0], ['tellurique', 'mers', 1], ['tellurique', 'canyons', 0], ['rocheux', 'canyons', 0],
  ['rocheux', 'lave', 0], ['rocheux', 'cristaux', 0], ['glace', 'cristaux', 0], ['rocheux', 'geysers', 0], ['glace', 'geysers', 0],
  ['glace', 'cratere_glace', 0], ['tellurique', 'atmosphere_epaisseur', 0.5], ['jaune', 'activite', 0], ['jaune', 'intensite', 1],
  ['comete', 'vue', 'profil'], ['tellurique', 'couleur_nuages', null], ['rocheux', 'couleur_fissures', null],
];
// Panne : une valeur neutre (ou la clé nulle) déplace un octet, ou entre dans la graine du corps.
test('la valeur neutre de chaque clé redonne les octets du corps sans la clé', async () => {
  for (const [t, k, v] of NEUTRES) {
    for (const base of [{ graine: 5 }, { graine: 5, fissures: 0.6, relief: 1, calottes: 0.4, halo: 0.5, nuages: 0.5 }]) {
      assert.ok(egal(await dess(t, base, 64), await dess(t, { ...base, [k]: v }, 64)), `${t} ${k}=${JSON.stringify(v)}`);
    }
  }
});

// Panne : le tirage dépend de l'heure, de l'ordre d'appel ou d'un état gardé d'un appel à l'autre.
test('le tirage est déterministe : un corps portant toutes les clés d\'un type est dessiné deux fois aux mêmes octets', async () => {
  const cas: Array<[string, Aspect]> = [
    ['tellurique', { graine: 2, nuages: 0.6, couleur_nuages: '#d04020', opacite_nuages: 0.5, terre_seche: 0.4, etirement: 2, eclairs: 0.7, inclinaison: 30, mers: 4, canyons: 0.5, atmosphere_epaisseur: 0.8, halo: 0.5 }],
    ['rocheux', { graine: 2, canyons: 0.5, lave: 0.5, cristaux: 0.5, geysers: 0.5, couleur_fissures: '#ff8800', fissures: 0.5 }],
    ['glace', { graine: 2, cristaux: 0.5, geysers: 0.5, cratere_glace: 0.7, crateres_nombre: 60 }],
    ['jaune', { graine: 2, activite: 0.8, intensite: 1.4 }],
    ['comete', { graine: 2, vue: 'face', courbure: -0.5 }],
  ];
  for (const [t, a] of cas) assert.ok(egal(await dess(t, a), await dess(t, a)), t);
});

// ---- one measured test per key ----------------------------------------------------------------------------------

// Panne : la couleur des nuages est ignorée (le blanc d'aujourd'hui reste), ou la clé n'est pas lue sur le monde verrouillé.
test('couleur_nuages : des nuages rouges font tomber le bleu moyen du disque ; sur un monde verrouillé à nuages aussi', async () => {
  const moy = (o: Uint8Array, c: number) => { const px = opaques(o); return px.reduce((s, i) => s + o[i * 4 + c]!, 0) / px.length; };
  const nu = (t: string, e: Aspect = {}) => dess(t, gris({ nuages: 1, ...e }));
  const sans = await nu('tellurique');
  assert.ok(moy(sans, 2) > 150, `bleu moyen sans la clé : ${moy(sans, 2)}`); // white clouds, today's picture
  const rouge = await nu('tellurique', { couleur_nuages: '#ff0000' });
  assert.ok(moy(rouge, 2) < 60, `bleu moyen avec nuages rouges : ${moy(rouge, 2)}`);
  assert.ok(moy(rouge, 0) > 150, `rouge moyen avec nuages rouges : ${moy(rouge, 0)}`);
  const bleu = await nu('tellurique', { couleur_nuages: '#0000ff' });
  assert.ok(moy(bleu, 0) < 60 && moy(bleu, 2) > 150, 'nuages bleus');
  const verrou = await nu('verrouillee', { couleur_nuages: '#ff0000' });
  assert.ok(moy(verrou, 2) < 60, `monde verrouillé, bleu moyen : ${moy(verrou, 2)}`);
});

// Panne : opacite_nuages sans effet, ou non monotone (0 = nuages visibles, 1 = voile entier).
test('opacite_nuages : plus elle baisse, plus la mer sous le voile se voit (luminance moyenne 0 < 0.5 < 1)', async () => {
  const moyenne = async (op: number) => { const o = await dess('tellurique', { graine: 5, nuages: 1, mer: 0.5, calottes: 0, halo: 0, bord: 0, couleur_nuages: '#ffffff', opacite_nuages: op }); const px = opaques(o); return px.reduce((s, i) => s + lum(o, i), 0) / px.length; };
  const [a, b, c] = [await moyenne(0), await moyenne(0.5), await moyenne(1)];
  assert.ok(a < 100 && b > 110 && b < 160 && c > 160, `${a} ${b} ${c}`);
});

// Panne : terre_seche sans effet, ou qui sèche aussi la mer.
test('terre_seche : la part de terre changée croît avec la valeur, la mer n\'est pas touchée', async () => {
  const base = { graine: 5, nuages: 0, calottes: 0, mer: 0.5 };
  const b = await dess('tellurique', base);
  const mesure = async (v: number) => {
    const o = await dess('tellurique', { ...base, terre_seche: v });
    let change = 0, merTouchee = 0;
    for (const i of opaques(b)) {
      const d = o[i * 4] !== b[i * 4] || o[i * 4 + 1] !== b[i * 4 + 1] || o[i * 4 + 2] !== b[i * 4 + 2];
      if (d) change++;
      const eau = b[i * 4 + 2]! > b[i * 4]! + 60 && b[i * 4 + 2]! > b[i * 4 + 1]! + 30;
      if (d && eau) merTouchee++;
    }
    return { change, merTouchee };
  };
  const m5 = await mesure(0.5), m10 = await mesure(1);
  assert.ok(m5.change > 1500, `à 0.5 : ${m5.change}`);
  assert.ok(m10.change > m5.change + 300, `à 1 : ${m10.change} contre ${m5.change}`);
  assert.equal(m10.merTouchee, 0, 'la mer est intacte');
});

// Panne : etirement sans effet, ou dans le mauvais sens (les nuages s'allongent le long des parallèles quand il monte).
test('etirement : 0.25 des taches verticales, 1 d\'aujourd\'hui, 4 de longues traînées horizontales (gradient horizontal sur vertical)', async () => {
  const r = async (e: number) => anisotropie(await dess('tellurique', { graine: 5, nuages: 0.5, mer: 1, calottes: 0, halo: 0, bord: 0, etirement: e }, 192), 192, 55).rapport;
  const [a, b, c] = [await r(0.25), await r(1), await r(4)];
  assert.ok(a > 1.2, `0.25 : ${a}`);
  assert.ok(b > 0.6 && b < 0.9, `1 : ${b}`);
  assert.ok(c < 0.6, `4 : ${c}`);
});
// Panne : la clé n'est lue que sur le tellurique, pas sur le monde verrouillé et le géant gazeux que la table nomme.
test('etirement : change aussi l\'image d\'un monde verrouillé à nuages et d\'un géant gazeux', async () => {
  for (const [t, a] of [['verrouillee', { graine: 5, nuages: 0.6 }], ['gazeuse', { graine: 5 }]] as Array<[string, Aspect]>) {
    assert.ok(!egal(await dess(t, a), await dess(t, { ...a, etirement: 4 })), t);
  }
});

// Panne : des éclairs sur le côté jour, ou sur un ciel sans nuages, ou leur nombre indépendant de la valeur.
test('eclairs : des points lumineux isolés apparaissent sur la face nuit, plus nombreux avec la valeur, aucun sans nuages', async () => {
  const C = 192, ANGLE = 45; // the star is toward the upper right of the picture (x right, y up)
  const base = { graine: 5, nuages: 0.6, mer: 0.5, calottes: 0, halo: 0, bord: 0 };
  const compte = async (e: number, b: Aspect = base) => {
    const o = await dess('tellurique', { ...b, eclairs: e }, C, ANGLE), ref = await dess('tellurique', b, C, ANGLE);
    let n = 0, jour = 0;
    for (let i = 0; i < C * C; i++) {
      if (o[i * 4] === ref[i * 4] && o[i * 4 + 1] === ref[i * 4 + 1] && o[i * 4 + 2] === ref[i * 4 + 2]) continue;
      n++;
      const x = (i % C) - C / 2 + 0.5, y = -(Math.floor(i / C) - C / 2 + 0.5);
      if (x * Math.cos(Math.PI / 4) + y * Math.sin(Math.PI / 4) > 0) jour++; // on the half turned toward the star
    }
    return { n, jour };
  };
  const [q, h, p] = [await compte(0.25), await compte(0.5), await compte(1)];
  assert.ok(q.n >= 1 && q.n < h.n && h.n < p.n, `${q.n} ${h.n} ${p.n}`);
  assert.equal(p.jour, 0, 'aucun éclair sur la face éclairée');
  assert.equal((await compte(1, { ...base, nuages: 0 })).n, 0, 'sans nuages, pas d\'éclair');
});

// Panne : inclinaison sans effet sur les bandes, ou sans signe (les bandes tournent du même côté pour ±45).
test('inclinaison : les bandes d\'un géant gazeux tournent avec l\'angle, de part et d\'autre pour un signe opposé', async () => {
  const mesure = async (i: number) => anisotropie(await dess('gazeuse', { graine: 5, halo: 0, bord: 0, turbulence: 0, inclinaison: i }, 192), 192, 50);
  const [z, p, m, q] = [await mesure(0), await mesure(45), await mesure(-45), await mesure(90)];
  assert.ok(z.rapport < 0.25, `0° : bandes horizontales, ${z.rapport}`);
  assert.ok(p.rapport > 0.35 && m.rapport > 0.35, `±45° : ${p.rapport} ${m.rapport}`);
  assert.ok(q.rapport > 0.9, `90° : ${q.rapport}`);
  assert.ok(p.signe * m.signe < 0, `+45° et −45° inclinent les bandes en sens contraires : ${p.signe} ${m.signe}`);
});
// Panne : inclinaison lue sur les seuls géants gazeux.
test('inclinaison : change l\'image de chaque type de planète que la table nomme', async () => {
  for (const t of ['tellurique', 'verrouillee', 'glace', 'rocheux', 'lave', 'gazeuse']) {
    const a: Aspect = { graine: 5, calottes: 0.6 };
    assert.ok(!egal(await dess(t, a), await dess(t, { ...a, inclinaison: 60 })), t);
    assert.ok(!egal(await dess(t, { ...a, inclinaison: -60 }), await dess(t, { ...a, inclinaison: 60 })), `${t} : le signe compte`);
  }
});

// Panne : mers sans effet, ou qui change la part d'eau totale.
test('mers : plus de bassins séparés (moyenne sur 8 graines) et la part d\'eau tient à quelques points', async () => {
  const C = 128;
  const mesure = async (m: number) => {
    let bassins = 0, part = 0;
    for (let g = 1; g <= 8; g++) {
      const o = await dess('tellurique', { graine: g, nuages: 0, calottes: 0, mer: 0.4, halo: 0, bord: 0, mers: m });
      const eau = new Uint8Array(C * C); let tot = 0, nb = 0;
      for (const i of opaques(o)) { tot++; if (o[i * 4 + 2]! > o[i * 4]! + 40 && o[i * 4 + 2]! > o[i * 4 + 1]! + 20) { eau[i] = 1; nb++; } }
      const vu = new Uint8Array(C * C);
      for (let i = 0; i < C * C; i++) {
        if (!eau[i] || vu[i]) continue;
        let taille = 0; const pile = [i]; vu[i] = 1;
        while (pile.length) {
          const j = pile.pop()!; taille++;
          for (const k of [j + 1, j - 1, j + C, j - C]) if (k >= 0 && k < C * C && eau[k] && !vu[k] && Math.abs((k % C) - (j % C)) <= 1) { vu[k] = 1; pile.push(k); }
        }
        if (taille >= 25) bassins++;
      }
      part += nb / tot;
    }
    return { bassins: bassins / 8, part: part / 8 };
  };
  const [un, trois, six] = [await mesure(1), await mesure(3), await mesure(6)];
  assert.ok(trois.bassins > un.bassins + 3 && six.bassins > trois.bassins + 1, `${un.bassins} ${trois.bassins} ${six.bassins}`);
  assert.ok(Math.abs(trois.part - un.part) < 0.04 && Math.abs(six.part - un.part) < 0.04, `${un.part} ${trois.part} ${six.part}`);
});

// Panne : canyons sans effet, ou plus clairs que sombres.
test('canyons : des entailles sombres, plus de pixels assombris à mesure que la valeur monte (rocheux et tellurique)', async () => {
  for (const t of ['rocheux', 'tellurique']) {
    const b = await dess(t, gris());
    const [m, h, u] = [await changes(await dess(t, gris({ canyons: 0.25 })), b, -1, 20), changes(await dess(t, gris({ canyons: 0.5 })), b, -1, 20), changes(await dess(t, gris({ canyons: 1 })), b, -1, 20)];
    assert.ok(m <= 3 && h >= 10 && u >= 40 && u > h, `${t} : ${m} ${h} ${u}`);
    assert.equal(changes(await dess(t, gris({ canyons: 1 })), b, 1, 20), 0, `${t} : un canyon n'éclaircit rien`);
  }
});

// Panne : lave sans effet sur un rocheux, ou qui ne rougeoie pas.
test('lave sur un rocheux : des veines incandescentes (rouge vif, orangé), de plus en plus de pixels', async () => {
  const incandescents = async (v: number) => { const o = await dess('rocheux', gris({ lave: v })); return opaques(o).filter((i) => o[i * 4]! > 200 && o[i * 4]! > o[i * 4 + 2]! + 60).length; };
  const [z, h, u] = [await incandescents(0), await incandescents(0.5), await incandescents(1)];
  assert.equal(z, 0);
  assert.ok(h > 100 && u > h + 50, `${h} ${u}`);
});

// Panne : cristaux sans effet, ou qui assombrissent.
test('cristaux : des facettes brillantes, de plus en plus de pixels éclaircis (rocheux et glace)', async () => {
  for (const t of ['rocheux', 'glace']) {
    const b = await dess(t, gris());
    const n = async (v: number) => changes(await dess(t, gris({ cristaux: v })), b, 1, 30);
    const [a, c, d] = [await n(0.25), await n(0.5), await n(1)];
    assert.ok(a >= 8 && c > a && d > c, `${t} : ${a} ${c} ${d}`);
    assert.equal(changes(await dess(t, gris({ cristaux: 1 })), b, -1, 30), 0, `${t} : un cristal n'assombrit rien`);
  }
});

// Panne : geysers sans effet, ou dessinés à l'intérieur du disque seulement (le texte dit : et, au limbe, au-delà du disque).
test('geysers : des panaches au-delà du disque, de plus en plus de pixels hors du disque (rocheux et glace)', async () => {
  for (const t of ['rocheux', 'glace']) {
    const hors = async (v: number) => { const o = await dess(t, gris({ geysers: v })); let n = 0; for (let i = 0; i < o.length / 4; i++) if (o[i * 4 + 3]! > 0 && o[i * 4 + 3]! < 255) n++; return n; };
    const [z, h, u] = [await hors(0), await hors(0.5), await hors(1)];
    assert.ok(h > z && u > h, `${t} : pixels translucides ${z} ${h} ${u}`);
    assert.ok(u - z >= 80, `${t} : au moins 80 pixels de panache de plus à 1 qu'à 0 (${u - z})`);
  }
});

// Panne : couleur_fissures ignorée (la couleur d'aujourd'hui reste).
test('couleur_fissures : les pixels de fissure prennent la couleur donnée (rocheux, glace, lave)', async () => {
  for (const t of ['rocheux', 'glace', 'lave']) {
    const teinte = async (c: string) => {
      const o = await dess(t, gris({ fissures: 1, couleur_fissures: c })); const ref = await dess(t, gris({ fissures: 1 }));
      let r = 0, b = 0, n = 0;
      for (const i of opaques(o)) if (o[i * 4] !== ref[i * 4] || o[i * 4 + 2] !== ref[i * 4 + 2]) { r += o[i * 4]!; b += o[i * 4 + 2]!; n++; }
      return { r: r / Math.max(n, 1), b: b / Math.max(n, 1), n };
    };
    const rouge = await teinte('#ff0000'), bleu = await teinte('#0000ff');
    assert.ok(rouge.n > 100 && bleu.n > 100, `${t} : ${rouge.n} ${bleu.n}`);
    assert.ok(rouge.r > rouge.b + 40, `${t} rouge : ${rouge.r} ${rouge.b}`);
    assert.ok(bleu.b > bleu.r + 40, `${t} bleu : ${bleu.r} ${bleu.b}`);
  }
});

// Panne : cratere_glace sans effet sur la glace.
test('cratere_glace : plus de cuvettes sombres sur un corps de glace (part de pixels sombres 0 < 0.5 < 1)', async () => {
  const part = async (v: number) => { const o = await dess('glace', gris({ cratere_glace: v })); const px = opaques(o); return px.filter((i) => lum(o, i) < 100).length / px.length; };
  const [a, b, c] = [await part(0), await part(0.5), await part(1)];
  assert.ok(b > a + 0.005 && c > b + 0.03, `${a} ${b} ${c}`);
});

// Panne : atmosphere_epaisseur sans effet, ou qui change la force du halo plutôt que sa largeur.
test('atmosphere_epaisseur : la bande du halo s\'élargit avec la valeur (pixels translucides 0 < 0.5 < 1) ; 0.5 est l\'image d\'aujourd\'hui', async () => {
  const bande = async (e?: number) => { const o = await dess('tellurique', { graine: 5, halo: 0.6, ...(e === undefined ? {} : { atmosphere_epaisseur: e }) }); let n = 0; for (let i = 0; i < o.length / 4; i++) if (o[i * 4 + 3]! > 0 && o[i * 4 + 3]! < 255) n++; return n; };
  const [z, d, u, sans] = [await bande(0), await bande(0.5), await bande(1), await bande()];
  assert.ok(z < d && d < u && u - z > 3000, `${z} ${d} ${u}`);
  assert.equal(d, sans);
});

// Panne : activite sans effet à la lisière d'une étoile.
test('activite : des éruptions et protubérances à la lisière d\'une étoile, plus de lumière hors du disque (0 < 0.5 < 1)', async () => {
  for (const t of ['jaune', 'orange', 'geante_bleue', 'naine_rouge']) {
    const lumHors = async (a: number) => { const o = await dess(t, { graine: 5, activite: a }, 256); let s = 0; for (let i = 0; i < 256 * 256; i++) { if (Math.hypot((i % 256) - 127.5, Math.floor(i / 256) - 127.5) > 30) s += lum(o, i) * o[i * 4 + 3]! / 255; } return s; };
    const [a, b, c] = [await lumHors(0), await lumHors(0.5), await lumHors(1)];
    assert.ok(b > a && c > b, `${t} : ${a} ${b} ${c}`);
  }
});

// Panne : intensite sans effet sur la luminosité de l'astre, ou dans le mauvais sens.
test('intensite : la luminosité du disque et de la couronne croît avec la valeur (0 presque noir, 1 d\'aujourd\'hui, 2 plus clair)', async () => {
  const total = async (v?: number) => { const o = await dess('jaune', { graine: 5, ...(v === undefined ? {} : { intensite: v }) }, 256); let s = 0; for (let i = 0; i < 256 * 256; i++) s += lum(o, i) * o[i * 4 + 3]! / 255; return s; };
  const [z, u, d, sans] = [await total(0), await total(1), await total(2), await total()];
  assert.ok(z < 0.01 * u && u * 1.25 < d, `${z} ${u} ${d}`);
  assert.equal(u, sans);
});

// Panne : vue sans effet, ou la queue vue de face reste étendue comme de profil.
test('vue : une comète de face raccourcit la queue en halo autour du noyau (bien moins de pixels, étendue bien plus basse)', async () => {
  const C = 192;
  const etendue = (o: Uint8Array) => { let n = 0, y0 = C, y1 = 0; for (let i = 0; i < C * C; i++) if (o[i * 4 + 3]! > 20) { n++; const y = Math.floor(i / C); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } return { n, h: y1 - y0 }; };
  const profil = etendue(await dess('comete', { graine: 5 }, C)), face = etendue(await dess('comete', { graine: 5, vue: 'face' }, C));
  assert.ok(profil.n > 3000 && face.n < 0.6 * profil.n, `${profil.n} ${face.n}`);
  assert.ok(face.h < 0.7 * profil.h, `${profil.h} ${face.h}`);
  assert.ok(egal(await dess('comete', { graine: 5 }, C), await dess('comete', { graine: 5, vue: 'profil' }, C)));
});

// Panne : courbure négative traitée comme positive, ou sans effet (la queue reste du même côté).
test('courbure : un signe négatif courbe la queue de l\'autre côté de l\'axe', async () => {
  const C = 192;
  const by = (o: Uint8Array) => { let s = 0, n = 0; for (let i = 0; i < C * C; i++) if (o[i * 4 + 3]! > 20) { s += Math.floor(i / C); n++; } return s / n - C / 2; };
  const droite = by(await dess('comete', { graine: 5, courbure: 0 }, C));
  const plus = by(await dess('comete', { graine: 5, courbure: 0.8 }, C)), moins = by(await dess('comete', { graine: 5, courbure: -0.8 }, C));
  const moinsUn = by(await dess('comete', { graine: 5, courbure: -1 }, C)), plusUn = by(await dess('comete', { graine: 5, courbure: 1 }, C));
  assert.ok(moinsUn < moins && moins < droite && droite < plus && plus < plusUn, `${moinsUn} ${moins} ${droite} ${plus} ${plusUn}`);
  assert.ok(plus > droite + 4, `+0.8 : ${plus} contre ${droite}`);
  assert.ok(moins < droite - 8, `-0.8 : ${moins} contre ${droite}`);
});

// Panne : la couleur de l'anneau reste celle du moteur, ou son opacité n'a pas d'effet.
test('anneaux : la couleur donnée teinte les pixels de l\'anneau ; l\'opacité décide de ce qu\'on voit du corps derrière', async () => {
  const C = 192;
  const geo = { interieur: 1.5, exterieur: 2.3, inclinaison: 0.5, angle: 20 };
  const dessAnneau = (a: Aspect) => dess('gazeuse', { graine: 5, halo: 0, bord: 0, anneau: { ...geo, ...a } }, C);
  const corps = await dessAnneau({ opacite: 0 });
  const horsCorps = (o: Uint8Array) => { let r = 0, b = 0, n = 0; for (let i = 0; i < C * C; i++) if (o[i * 4 + 3]! > 0 && corps[i * 4 + 3] === 0) { r += o[i * 4]!; b += o[i * 4 + 2]!; n++; } return { r: r / n, b: b / n, n }; };
  const rouge = horsCorps(await dessAnneau({ couleur: '#ff0000', couleur2: '#ff0000' })), bleu = horsCorps(await dessAnneau({ couleur: '#0000ff', couleur2: '#0000ff' }));
  assert.ok(rouge.n > 2000 && rouge.r > rouge.b + 80, `rouge : ${rouge.r} ${rouge.b}`);
  assert.ok(bleu.n > 2000 && bleu.b > bleu.r + 80, `bleu : ${bleu.r} ${bleu.b}`);
  // Where the ring crosses the body: the more opaque, the more of the ring's red and the less of the body.
  const rougeur = async (op: number) => { const o = await dessAnneau({ couleur: '#ff0000', couleur2: '#ff0000', opacite: op }); let s = 0, n = 0; for (const i of opaques(corps)) if (o[i * 4] !== corps[i * 4] || o[i * 4 + 2] !== corps[i * 4 + 2]) { s += o[i * 4]! - o[i * 4 + 2]! - (corps[i * 4]! - corps[i * 4 + 2]!); n++; } return { n, moyenne: s / Math.max(n, 1) }; };
  const [a, b, c] = [await rougeur(0.2), await rougeur(0.6), await rougeur(1)];
  assert.ok(a.n > 1000 && a.moyenne < b.moyenne && b.moyenne < c.moyenne, `${JSON.stringify(a)} ${JSON.stringify(b)} ${JSON.stringify(c)}`);
});

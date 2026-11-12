// Review tests of kanevas-taille-images-editeur: the editor's twin of `lireReglageImage` and the image-title writes.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { lireReglageImage as serveur, PLACEMENTS_IMAGE as PS, TAILLES_IMAGE as TS } from '../../../src/services/markdown';
import {
  choisirReglageImage,
  ecrireReglageImage,
  lireReglageImage,
  PLACEMENTS_IMAGE,
  referenceImageAuCurseur,
  referenceImageEn,
  TAILLES_IMAGE,
} from './editeur-logique';

const CAS: (string | null | undefined)[] = [
  ...TS.flatMap((t) => PS.map((p) => `${t}-${p}`)),
  'moyen', 'moyen-', '-droite', 'Moyen-droite', 'moyen-Droite', 'moyen-droite ', ' moyen-droite', 'moyen-droite-x',
  'énorme-droite', 'moyen_droite', 'moyen-droite\n', 'une infobulle', '', null, undefined,
];

test('jumeau et serveur : mêmes cas, mêmes réponses', () => {
  for (const c of CAS) assert.deepEqual(lireReglageImage(c), serveur(c), String(JSON.stringify(c)));
  assert.deepEqual([...TAILLES_IMAGE], [...TS]);
  assert.deepEqual([...PLACEMENTS_IMAGE], [...PS]);
});

const REF = '![Plan](fichier:12)';

test('Moyen puis À droite écrit "moyen-droite", Sans réglage le retire', () => {
  const t0 = `Avant\n${REF}\nAprès`;
  const d = t0.indexOf('![');
  const a = ecrireReglageImage(t0, d, choisirReglageImage(null, { taille: 'moyen' }));
  assert.equal(a.texte, `Avant\n![Plan](fichier:12 "moyen-centre")\nAprès`);
  const courant = lireReglageImage(referenceImageEn(a.texte, d)?.titre);
  const b = ecrireReglageImage(a.texte, d, choisirReglageImage(courant, { placement: 'droite' }));
  assert.equal(b.texte, `Avant\n![Plan](fichier:12 "moyen-droite")\nAprès`);
  const c = ecrireReglageImage(b.texte, d, null);
  assert.equal(c.texte, t0);
  assert.equal(t0.slice(0, c.fin).endsWith(')'), true);
});

test('premier choix Placement complète la taille par moyen', () => {
  assert.deepEqual(choisirReglageImage(null, { placement: 'gauche' }), { taille: 'moyen', placement: 'gauche' });
  assert.deepEqual(choisirReglageImage({ taille: 'grand', placement: 'droite' }, { taille: 'petit' }), { taille: 'petit', placement: 'droite' });
});

test('un titre ordinaire n’est pas un réglage', () => {
  const t = '![a](fichier:3 "une infobulle")';
  assert.equal(lireReglageImage(referenceImageEn(t, 0)?.titre), null);
  assert.equal(referenceImageEn(t, 0)?.titre, 'une infobulle');
});

test('curseur : dans la référence oui, avant ou après non', () => {
  const t = `x ${REF} y`;
  const d = 2;
  for (const caret of [d, d + 5, d + REF.length]) assert.equal(referenceImageAuCurseur(t, caret)?.debut, d, String(caret));
  assert.equal(referenceImageAuCurseur(t, 1), null);
  assert.equal(referenceImageAuCurseur(t, d + REF.length + 1), null);
  assert.equal(referenceImageAuCurseur('![a](http://x/y.png)', 5), null);
  assert.equal(referenceImageAuCurseur('![a](fichier:3', 5), null);
});

test('deux images : le réglage touche celle du curseur seulement', () => {
  const t = `${REF} puis ![B](fichier:13 "petit-gauche")`;
  const d2 = t.lastIndexOf('![');
  assert.equal(referenceImageAuCurseur(t, d2 + 3)?.debut, d2);
  const r = ecrireReglageImage(t, d2, { taille: 'grand', placement: 'centre' });
  assert.equal(r.texte, `${REF} puis ![B](fichier:13 "grand-centre")`);
});

test('écrire sans référence à cet endroit rend le texte tel quel', () => {
  assert.deepEqual(ecrireReglageImage('abc', 1, null), { texte: 'abc', fin: 1 });
});

test('une référence sans titre dont le texte alternatif porte des guillemets reste intacte', () => {
  const t = '![dit "oui"](fichier:5)';
  assert.equal(ecrireReglageImage(t, 0, { taille: 'petit', placement: 'gauche' }).texte, '![dit "oui"](fichier:5 "petit-gauche")');
});

test('un titre ordinaire est remplacé au premier choix (écart signalé par le codeur)', () => {
  const t = '![a](fichier:3 "une infobulle")';
  assert.equal(ecrireReglageImage(t, 0, { taille: 'petit', placement: 'gauche' }).texte, '![a](fichier:3 "petit-gauche")');
});

// Review tests of kanevas-taille-images-rendu: the title of a `fichier:N` image sets its size and placement.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { test } from 'node:test';

import { semerBouchon } from '../bouchon/depart.js';
import { migrate, openDb } from '../db/db.js';
import { ajouterFichier } from './fichiers.js';
import { lireReglageImage, rendreMarkdown } from './markdown.js';
import { ecrireContenu, lireSection } from './sections.js';

const fichiers = (id: number) => ({ genre: 'fichier' as const, id, nom: 'a.png', adresse: `/f/${id}`, image: true });
const rendre = (s: string, nature?: 'section' | 'scenario' | 'texte') => rendreMarkdown(s, { nature, fichiers: fichiers as never });

test('moyen-droite donne img-moyen img-droite sur une section', () => {
  const h = rendre('![a](fichier:12 "moyen-droite")', 'section');
  assert.match(h, /<img src="\/f\/12" alt="a" class="img-moyen img-droite" loading="lazy">/);
});

test('les neuf paires sont des réglages, tout le reste n’en est pas un', () => {
  for (const t of ['petit', 'moyen', 'grand']) for (const p of ['gauche', 'droite', 'centre']) {
    assert.deepEqual(lireReglageImage(`${t}-${p}`), { taille: t, placement: p });
  }
  for (const x of ['moyen', 'moyen-', 'Moyen-droite', 'moyen-droite ', ' moyen-droite', 'moyen-droite-x', 'énorme-droite', 'moyen_droite', 'une infobulle', '', null, undefined]) {
    assert.equal(lireReglageImage(x as never), null, String(x));
  }
});

test('sans titre, titre ordinaire ou incomplet : rendu d’avant, sans classe', () => {
  for (const t of ['', ' "une infobulle"', ' "moyen"', ' "Moyen-Droite"']) {
    const h = rendre(`![a](fichier:12${t})`, 'section');
    assert.ok(!h.includes('class='), h);
    assert.ok(h.includes('<img src="/f/12" alt="a"'), h);
  }
});

test('scénario et entrée de système : aucun réglage', () => {
  assert.ok(!rendre('![a](fichier:12 "moyen-droite")', 'scenario').includes('img-'));
  assert.ok(!rendre('![a](fichier:12 "moyen-droite")', 'texte').includes('img-'));
});

test('fichier fermé ou en attente : le réglage est ignoré', () => {
  const h = rendreMarkdown('![a](fichier:12 "moyen-droite")', { nature: 'section', fichiers: (() => ({ genre: 'texte' })) as never });
  assert.ok(!h.includes('img-'), h);
});

test('un fichier non image (lien joint) ne porte pas de classe', () => {
  const h = rendreMarkdown('![a](fichier:12 "moyen-droite")', { nature: 'section', fichiers: (() => ({ genre: 'fichier', id: 12, nom: 'a.pdf', adresse: '/f/12', image: false })) as never });
  assert.ok(!h.includes('img-'), h);
});

test('forme markdown : le titre est réémis, guillemets échappés', () => {
  const m = (s: string) => rendreMarkdown(s, { nature: 'section', fichiers: fichiers as never, formeLiens: 'markdown' });
  assert.match(m('![a](fichier:12 "moyen-droite")'), /!\[a\]\(fichier:12 &quot;moyen-droite&quot;\)/);
  assert.match(m('![a](fichier:12)'), /!\[a\]\(fichier:12\)/);
  assert.ok(!m('![a](fichier:12)').includes('&quot;'));
});

test('le titre transite tel quel par l’écriture (import) et se lit pour MJ et joueur', async () => {
  const db = openDb(':memory:');
  migrate(db);
  semerBouchon(db);
  const antor = { compteId: (db.prepare("SELECT id FROM comptes WHERE username = 'antor'").get() as { id: number }).id };
  const univers = (db.prepare("SELECT id FROM univers WHERE nom = 'Lame d''Ébène'").get() as { id: number }).id;
  const s = db.prepare('SELECT s.id, s.fiche_id AS ficheId FROM sections s JOIN fiches f ON f.id = s.fiche_id WHERE f.titre = ? AND s.titre = ?').get('Port-Sel', 'Histoire') as { id: number; ficheId: number };
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
  const f = await ajouterFichier(db, antor, univers, Readable.from([PNG]), 'r.png', { ou: 'mediatheque' }, mkdtempSync(join(tmpdir(), 'taille-')));
  const texte = `Avant ![a](fichier:${f.id} "moyen-droite") après`;
  ecrireContenu(db, antor.compteId, univers, s.ficheId, s.id, texte, lireSection(db, antor, univers, s.ficheId, s.id).version);
  const v = lireSection(db, antor, univers, s.ficheId, s.id);
  assert.equal(v.contenu, texte);
  assert.match(v.html, /class="img-moyen img-droite"/);
});

test('un lecteur non MJ (mode joueur) voit aussi l’image réglée', async () => {
  const db = openDb(':memory:');
  migrate(db);
  semerBouchon(db);
  const antor = { compteId: (db.prepare("SELECT id FROM comptes WHERE username = 'antor'").get() as { id: number }).id };
  const univers = (db.prepare("SELECT id FROM univers WHERE nom = 'Lame d''Ébène'").get() as { id: number }).id;
  const s = db.prepare('SELECT s.id, s.fiche_id AS ficheId FROM sections s JOIN fiches f ON f.id = s.fiche_id WHERE f.titre = ? AND s.titre = ?').get('Port-Sel', 'Histoire') as { id: number; ficheId: number };
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
  const f = await ajouterFichier(db, antor, univers, Readable.from([PNG]), 'r.png', { ou: 'mediatheque' }, mkdtempSync(join(tmpdir(), 'taille-')));
  ecrireContenu(db, antor.compteId, univers, s.ficheId, s.id, `Avant ![a](fichier:${f.id} "moyen-droite") après`, lireSection(db, antor, univers, s.ficheId, s.id).version);
  const joueur = lireSection(db, { ...antor, modeJoueur: true } as never, univers, s.ficheId, s.id);
  assert.match(joueur.html, /<img [^>]*src=/);
  assert.match(joueur.html, /class="img-moyen img-droite"/);
});

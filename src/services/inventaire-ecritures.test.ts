// The inventory of the writers of the six history tables is closed by this test (AD-147): a file of
// `src/services/` that writes `fiches`, `sections`, `relations`, `fiche_alias`, `fiche_etiquettes` or
// `fichiers_sections` must be named here, and each of them puts its write under a context (`ecrire`,
// `avecContexte`, `ecrireSysteme`). A new writer is a decision, made by adding it below.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const RACINE = dirname(fileURLToPath(import.meta.url));
const TABLES = ['fiches', 'sections', 'relations', 'fiche_alias', 'fiche_etiquettes', 'fichiers_sections'];
const ECRITURE = new RegExp(
  `\\b(?:INSERT(?:\\s+OR\\s+\\w+)?\\s+INTO|UPDATE|DELETE\\s+FROM)\\s+(?:${TABLES.join('|')})\\b`,
  'i',
);

/** The writers allowed: each opens a context itself or runs under one of its callers' doors. */
const ECRIVAINS = [
  'cles.ts', // changerCleFiche
  'comptes_rendus.ts', // creerCompteRendu
  'etiquettes.ts', // poserEtiquetage
  'fichiers.ts', // files joined, illustration, import of a file
  'fiches.ts', // creerFiche, renommerFiche, deplacerFiche, supprimerFiche…
  'import-fiches.ts', // assurerFiche: origin `import`
  'membres.ts', // effacerAuteur
  'relations.ts', // relierSection, retirerRelation
  'sections-gerees.ts', // libererSections
  'sections.ts', // insererSection, poserContenu, the section services
  'univers.ts', // supprimerUnivers
];

function fichiers(dossier: string): string[] {
  return readdirSync(dossier, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? fichiers(join(dossier, e.name))
      : e.name.endsWith('.ts') && !e.name.endsWith('.test.ts')
        ? [join(dossier, e.name)]
        : [],
  );
}

/** The files, among `sources` (`chemin → texte`), that write one of the six tables and are not listed. */
export function ecrivainsNonListes(sources: Record<string, string>, liste: string[]): string[] {
  return Object.entries(sources)
    .filter(([chemin, texte]) => ECRITURE.test(texte) && !liste.includes(chemin))
    .map(([chemin]) => chemin)
    .sort();
}

const lus = Object.fromEntries(fichiers(RACINE).map((f) => [relative(RACINE, f), readFileSync(f, 'utf8')]));

test('aucun fichier hors de la liste écrit une table de l’historique', () => {
  assert.deepEqual(ecrivainsNonListes(lus, ECRIVAINS), []);
});

test('chaque fichier de la liste écrit encore une de ces tables', () => {
  for (const f of ECRIVAINS) assert.ok(ECRITURE.test(lus[f] ?? ''), `${f} n'écrit plus : le retirer de la liste`);
});

test('chaque écrivain pose son contexte ou le reçoit de sa porte', () => {
  for (const f of ECRIVAINS) {
    assert.match(lus[f]!, /\b(ecrire|avecContexte|ecrireSysteme)\(/, `${f} n'ouvre aucun contexte d'écriture`);
  }
});

test("l'inventaire échoue quand un écrivain non listé s'y ajoute", () => {
  const avec = { ...lus, 'nouveau.ts': "db.prepare('UPDATE fiche_alias SET alias = ?').run(a);" };
  assert.deepEqual(ecrivainsNonListes(avec, ECRIVAINS), ['nouveau.ts']);
  const aussi = { ...lus, 'autre.ts': "db.prepare('DELETE FROM fichiers_sections').run();" };
  assert.deepEqual(ecrivainsNonListes(aussi, ECRIVAINS), ['autre.ts']);
});

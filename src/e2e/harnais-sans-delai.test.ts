// ecrans: accueil
// Guard of AD-harnais-3: no fixed delay in the screen tests. A test waits for the visible result of its action
// (`attendre`, `attendreVisible`, `attendreAbsent`, `attendreTexte`, `attendreTransitions`), never for a duration.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const DOSSIER = dirname(fileURLToPath(import.meta.url));

/** Files that may sleep, and why: none of them drives a page. */
const EXCLUS: Record<string, string> = {
  'harnais-sans-delai.test.ts': 'this guard: it spells the forbidden patterns in its own strings',
  'harnais-attendre.test.ts': 'tests the harness itself: it delays a response on purpose to prove `attendre` waits for it',
  'healthz.test.ts': 'process, not page: the pause of a loop that polls the startup of the server',
  'oidc-login.test.ts': 'process, not page: the pause of a loop that polls the startup of the server',
  'harnais-concurrence.test.ts': 'process, not page: a delay that proves a lock holds a process back',
};

// The word is assembled so that `grep -rl waitFor\u0054imeout src` (the exit criterion of the rule) does not find this guard itself.
const ATTENTE_FIXE = 'wait' + 'ForTimeout';
const SOMMEIL = /^\s*await new Promise(<[^>]*>)?\(\(?\w+\)? => setTimeout\(\w+, *[\w.]+\)\);?\s*$/;

/** Violations of one source: every fixed page wait, and every sleep alone on its line that is not inside a `route` handler (a slow server being simulated). */
export function violations(source: string): string[] {
  const lignes = source.split('\n');
  const trouvees: string[] = [];
  lignes.forEach((ligne, i) => {
    if (ligne.includes(ATTENTE_FIXE)) {
      trouvees.push(`l. ${i + 1} : ${ligne.trim()}`);
      return;
    }
    if (!SOMMEIL.test(ligne)) return;
    let indent = ligne.length - ligne.trimStart().length;
    for (let j = i - 1; j >= 0 && indent > 0; j--) {
      const l = lignes[j]!;
      if (l.trim() === '') continue;
      const d = l.length - l.trimStart().length;
      if (d >= indent) continue;
      if (/\.route\(|\bralentir\(/.test(l)) return; // an enclosing route handler: the delay is the slow server
      indent = d;
    }
    trouvees.push(`l. ${i + 1} : ${ligne.trim()}`);
  });
  return trouvees;
}

test('le garde reconnaît une attente fixe de page, un sommeil en instruction seule, et laisse le délai d’un gestionnaire route', () => {
  assert.equal(violations(`  await page.${ATTENTE_FIXE}(300);`).length, 1);
  assert.equal(violations('  await new Promise((r) => setTimeout(r, 500));').length, 1);
  assert.equal(violations('    await new Promise<void>((resolve) => setTimeout(resolve, 100));').length, 1);
  const route = ["  await page.route('**/api/x', async (route) => {", '    if (ok) {', '      await new Promise((r) => setTimeout(r, 1500));', '    }', '    await route.continue();', '  });'];
  assert.deepEqual(violations(route.join('\n')), []);
  const apres = ["  await page.route('**/api/x', async (route) => {", '    await route.continue();', '  });', '  await new Promise((r) => setTimeout(r, 1500));'];
  assert.equal(violations(apres.join('\n')).length, 1);
});

test('aucun fichier de src/e2e n’attend une durée fixe', () => {
  const fichiers = readdirSync(DOSSIER).filter((f) => f.endsWith('.test.ts') && !(f in EXCLUS)).sort();
  assert.ok(fichiers.length > 100, 'the e2e files are found');
  const fautes = fichiers.flatMap((f) => violations(readFileSync(join(DOSSIER, f), 'utf8')).map((v) => `${f} ${v}`));
  assert.deepEqual(fautes, [], 'wait for the visible result (attendre*), not for a delay');
});

test('chaque fichier exclu existe et porte sa raison', () => {
  for (const [f, raison] of Object.entries(EXCLUS)) {
    assert.ok(readdirSync(DOSSIER).includes(f), `${f} exists`);
    assert.ok(raison.length > 10, `${f} has a reason`);
  }
});

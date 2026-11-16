// Playwright is not a dependency of the repository: the pods' image may carry a system install the
// harness finds (`src/e2e/harnais.test.ts`). Without one, install it (not saved) with Chromium,
// otherwise the screen tests would be skipped, hence red. Shared by `tests-attestes.mjs` and
// `rejouer-tests.mjs`, never copied.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export function assurerPlaywright() {
  const vu = [process.cwd() + '/node_modules', '/usr/lib/node_modules', '/usr/local/lib/node_modules']
    .some((racine) => existsSync(join(racine, 'playwright')));
  if (vu) return;
  console.log('Playwright not found: installing playwright@1.63.0 (--no-save) and Chromium.');
  for (const cmd of [['npm', ['install', '--no-save', 'playwright@1.63.0']], ['npx', ['playwright', 'install', 'chromium']]]) {
    const r = spawnSync(cmd[0], cmd[1], { stdio: 'inherit' });
    if (r.status !== 0) process.exit(r.status ?? 1);
  }
}

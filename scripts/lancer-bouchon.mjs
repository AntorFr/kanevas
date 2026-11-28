// Starts the stub (KANEVAS_STUB=1) of a built Kanevas with Node alone (AD-web-publie-3).
// Usage: node lancer-bouchon.mjs [--port N] [--data DIR]
// It reads nothing of the repository: it lives in scripts/ there and at the root of the web archive.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ici = dirname(fileURLToPath(import.meta.url));

function lireArguments(argv) {
  const res = { port: 3001, data: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const valeur = () => {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      return argv[++i];
    };
    if (a === '--port') {
      const n = Number(valeur());
      if (!Number.isInteger(n) || n <= 0 || n > 65535) {
        throw new Error('--port must be an integer between 1 and 65535 (0 is refused: the address must be known)');
      }
      res.port = n;
    } else if (a === '--data') res.data = valeur();
    else throw new Error(`unknown argument ${a}`);
  }
  return res;
}

let options;
try {
  options = lireArguments(process.argv.slice(2));
} catch (e) {
  console.error(`lancer-bouchon: ${e.message}`);
  console.error('usage: node lancer-bouchon.mjs [--port N] [--data DIR]');
  process.exit(2);
}

if (!existsSync(join(ici, 'node_modules'))) {
  console.log('Installing production dependencies (npm ci --omit=dev)…');
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const r = spawnSync(npm, ['ci', '--omit=dev', '--ignore-scripts=false'], { cwd: ici, stdio: 'inherit' });
  if (r.status !== 0) {
    console.error('lancer-bouchon: npm ci failed.');
    process.exit(r.status ?? 1);
  }
}

const version = readFileSync(join(ici, 'VERSION'), 'utf8').trim();
let dossierTemporaire = null;
let data = options.data;
if (!data) {
  dossierTemporaire = mkdtempSync(join(tmpdir(), 'kanevas-bouchon-'));
  data = dossierTemporaire;
}

// AD-55: the stub refuses to start with any OIDC_* variable, so an inherited one is dropped.
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('OIDC_')));
Object.assign(env, {
  KANEVAS_STUB: '1',
  NODE_ENV: 'production',
  APP_VERSION: version,
  PORT: String(options.port),
  DB_PATH: join(data, 'kanevas.db'),
});

const serveur = spawn(process.execPath, [join(ici, 'dist/server.js')], { cwd: ici, env, stdio: ['ignore', 'inherit', 'inherit'] });

let fini = false;
function nettoyer() {
  if (dossierTemporaire) rmSync(dossierTemporaire, { recursive: true, force: true });
}
serveur.on('exit', (code, signal) => {
  fini = true;
  nettoyer();
  process.exit(code ?? (signal ? 1 : 0));
});
serveur.on('error', (e) => {
  console.error(`lancer-bouchon: cannot start the server: ${e.message}`);
  nettoyer();
  process.exit(1);
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => serveur.kill(signal));

const adresse = `http://127.0.0.1:${options.port}/`;
while (!fini) {
  try {
    const r = await fetch(`${adresse}healthz`);
    if (r.ok) {
      console.log(adresse);
      break;
    }
  } catch {
    // not listening yet
  }
  await new Promise((resolve) => setTimeout(resolve, 200));
}

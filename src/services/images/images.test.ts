import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { typeParSignature } from '../pieces-jointes.js';
import { ErreurGeneration, choisirAdaptateur } from './index.js';

const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNIzvj/HwAFAAKAbqjb7QAAAABJRU5ErkJggg==';

interface Banc {
  home: string;
  tmp: string;
  bin: string;
  journal: string;
}

/** A fake `codex`: `corps` is the shell run after logging argv, cwd and CODEX_HOME. */
function banc(corps: string, avecAuth = true): Banc {
  const racine = mkdtempSync(join(tmpdir(), 'img-'));
  const home = join(racine, 'home');
  const tmp = join(racine, 'tmp');
  const bin = join(racine, 'bin');
  mkdirSync(home);
  mkdirSync(bin);
  if (avecAuth) writeFileSync(join(home, 'auth.json'), '{"token":"SECRET-TOKEN-XYZ"}');
  const journal = join(racine, 'journal');
  writeFileSync(
    join(bin, 'codex'),
    `#!/bin/sh\n{ echo "ARGS:$*"; echo "CWD:$(pwd)"; echo "HOME:$CODEX_HOME"; } >> "${journal}"\n${corps}\n`,
  );
  chmodSync(join(bin, 'codex'), 0o755);
  return { home, tmp, bin, journal };
}

const choisir = (b: Banc, extra: object = {}) =>
  choisirAdaptateur({ codexHome: b.home, racineTmp: b.tmp, path: b.bin, ...extra });

const ECRIT_PNG = (b: Banc) =>
  `mkdir -p "$CODEX_HOME/generated_images/s1" && echo ${PNG_B64} | base64 -d > "$CODEX_HOME/generated_images/s1/a.png"`;

test('bouchon : PNG fixe servi en ligne, « échec » lève', async () => {
  const { nom, generateur } = choisirAdaptateur({ KANEVAS_STUB: '1', codexHome: '/nulle/part', racineTmp: '/nulle/part' });
  assert.equal(nom, 'bouchon');
  const octets = await generateur.generer("un portrait d'Aldric", new AbortController().signal);
  assert.equal(typeParSignature(octets), 'image/png');
  assert.deepEqual(octets, Buffer.from(PNG_B64, 'base64'));
  await assert.rejects(generateur.generer('un ÉCHEC total'), ErreurGeneration);
  await assert.rejects(generateur.generer('echec'.replace('e', 'é')), ErreurGeneration);
});

test('bouchon prime même si codex est disponible', () => {
  const b = banc('exit 0');
  assert.equal(choisir(b, { KANEVAS_STUB: '1' }).nom, 'bouchon');
});

test('choix : sans exécutable → aucun ; sans auth.json → aucun ; les deux → codex', async () => {
  const b = banc('exit 0');
  assert.equal(choisir(b).nom, 'codex');
  assert.equal(choisir(banc('exit 0', false)).nom, 'aucun');
  assert.equal(choisirAdaptateur({ codexHome: b.home, racineTmp: b.tmp, path: join(b.home, 'vide') }).nom, 'aucun');
  // KANEVAS_STUB other than "1" is not the stub
  assert.equal(choisir(b, { KANEVAS_STUB: '0' }).nom, 'codex');
  const a = choisir(banc('exit 0', false));
  await assert.rejects(a.generateur.generer('x'), ErreurGeneration);
});

test('choix : un codex non exécutable ne compte pas', () => {
  const b = banc('exit 0');
  chmodSync(join(b.bin, 'codex'), 0o644);
  assert.equal(choisir(b).nom, 'aucun');
});

test('codex : rend les octets, bons arguments, répertoire jetable et fichier supprimés', async () => {
  const b = banc(ECRIT_PNG(null as never));
  const { generateur } = choisir(b);
  const octets = await generateur.generer("un portrait d'Aldric");
  assert.deepEqual(octets, Buffer.from(PNG_B64, 'base64'));
  const j = readFileSync(b.journal, 'utf8');
  assert.match(j, /ARGS:exec .*--sandbox danger-full-access/);
  assert.match(j, /un portrait d'Aldric/);
  assert.ok(j.includes(`HOME:${b.home}`));
  const cwd = /CWD:(.*)/.exec(j)![1]!;
  assert.ok(cwd.startsWith(b.tmp), `cwd ${cwd} sous ${b.tmp}`);
  assert.equal(existsSync(cwd), false);
  assert.deepEqual(readdirSync(b.tmp), []);
  assert.deepEqual(readdirSync(join(b.home, 'generated_images')).flatMap((d) => readdirSync(join(b.home, 'generated_images', d))), []);
});

test('codex : ignore les images préexistantes, ne les supprime pas', async () => {
  const b = banc(ECRIT_PNG(null as never));
  mkdirSync(join(b.home, 'generated_images', 'vieux'), { recursive: true });
  writeFileSync(join(b.home, 'generated_images', 'vieux', 'x.png'), Buffer.from('ancien'));
  const octets = await choisir(b).generateur.generer('x');
  assert.deepEqual(octets, Buffer.from(PNG_B64, 'base64'));
  assert.ok(existsSync(join(b.home, 'generated_images', 'vieux', 'x.png')));
});

test('codex : aucun fichier écrit → erreur de génération', async () => {
  const b = banc('exit 0');
  await assert.rejects(choisir(b).generateur.generer('x'), ErreurGeneration);
  assert.deepEqual(readdirSync(b.tmp), []);
});

test("codex : un fichier qui n'est pas une image → erreur, et nettoyé", async () => {
  const b = banc(
    'mkdir -p "$CODEX_HOME/generated_images/s1" && echo "<svg/> pas une image" > "$CODEX_HOME/generated_images/s1/a.png"',
  );
  await assert.rejects(choisir(b).generateur.generer('x'), ErreurGeneration);
  assert.equal(existsSync(join(b.home, 'generated_images', 's1', 'a.png')), false);
  assert.deepEqual(readdirSync(b.tmp), []);
});

test('codex : sortie non nulle → erreur, même si un PNG a été écrit', async () => {
  const b = banc(`${ECRIT_PNG(null as never)}\nexit 3`);
  await assert.rejects(choisir(b).generateur.generer('x'), ErreurGeneration);
  assert.equal(existsSync(join(b.home, 'generated_images', 's1', 'a.png')), false);
});

test('codex : dépassement du délai → erreur et processus tué', async () => {
  const b = banc(`echo $$ > "$CODEX_HOME/pid"; sleep 30`);
  const t0 = Date.now();
  await assert.rejects(choisir(b, { delaiMs: 300 }).generateur.generer('x'), ErreurGeneration);
  assert.ok(Date.now() - t0 < 5000);
  const pid = Number(readFileSync(join(b.home, 'pid'), 'utf8'));
  await new Promise((r) => setTimeout(r, 200));
  assert.throws(() => process.kill(pid, 0), 'le processus doit être tué');
  assert.deepEqual(readdirSync(b.tmp), []);
});

test('codex : signal annulé → erreur', async () => {
  const b = banc('sleep 30');
  const ac = new AbortController();
  const p = choisir(b).generateur.generer('x', ac.signal);
  setTimeout(() => ac.abort(), 150);
  await assert.rejects(p, ErreurGeneration);
});

test('codex : deux appels simultanés se suivent', async () => {
  const b = banc(
    `echo "debut" >> "${'$CODEX_HOME'}/ordre"; sleep 0.4; echo "fin" >> "$CODEX_HOME/ordre"\n${ECRIT_PNG(null as never)}`,
  );
  const g = choisir(b).generateur;
  const [r1, r2] = await Promise.all([g.generer('a'), g.generer('b')]);
  assert.equal(typeParSignature(r1), 'image/png');
  assert.equal(typeParSignature(r2), 'image/png');
  assert.equal(readFileSync(join(b.home, 'ordre'), 'utf8'), 'debut\nfin\ndebut\nfin\n');
});

test("auth.json n'apparaît dans aucun message, même si le moteur le crache", async () => {
  const b = banc('cat "$CODEX_HOME/auth.json"; cat "$CODEX_HOME/auth.json" >&2; exit 1');
  const logs: string[] = [];
  const orig = [console.log, console.error, console.warn];
  console.log = console.error = console.warn = (...a: unknown[]) => void logs.push(a.join(' '));
  try {
    await assert.rejects(choisir(b).generateur.generer('x'), (e: Error) => {
      assert.ok(e instanceof ErreurGeneration);
      assert.ok(!e.message.includes('SECRET-TOKEN-XYZ'));
      assert.ok(!String(e.stack).includes('SECRET-TOKEN-XYZ'));
      return true;
    });
  } finally {
    [console.log, console.error, console.warn] = orig;
  }
  assert.ok(!logs.join('\n').includes('SECRET-TOKEN-XYZ'));
});

test('image Docker : codex installé avec une version épinglée', () => {
  const d = readFileSync(join(import.meta.dirname, '../../../Dockerfile'), 'utf8');
  assert.match(d, /ARG CODEX_VERSION=\d+\.\d+\.\d+/);
  assert.match(d, /npm install -g @openai\/codex@\$\{CODEX_VERSION\}/);
});

test("codex : le sous-processus ne reçoit pas les secrets du serveur", async () => {
  const b = banc(`${ECRIT_PNG(null as never)}\necho "SECRET:[$CLAUDE_CODE_OAUTH_TOKEN$SESSION_SECRET]" >> "${'$'}0.env"`);
  process.env.CLAUDE_CODE_OAUTH_TOKEN = 'tok-serveur';
  process.env.SESSION_SECRET = 'sess-serveur';
  try {
    await choisir(b).generateur.generer('x');
  } finally {
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    delete process.env.SESSION_SECRET;
  }
  assert.equal(readFileSync(join(b.bin, 'codex.env'), 'utf8').trim(), 'SECRET:[]');
});

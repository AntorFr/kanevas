import assert from 'node:assert/strict';
import { type ChildProcess, spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

// E-5 (docs/ecrans.md, maquette e05): in the « Membres » zone, the add form is a field « Identifiant du
// compte », a role (Joueur by default) and « Ajouter ». Re-verification of the 390 px gap: the identifier
// field was cut. Expectations are literal and come from the need (whole prompt readable, everything
// reachable without sideways scroll), not from the CSS.
const require = createRequire(import.meta.url);
type PW = typeof import('playwright');
function chargerPlaywright(): PW | null {
  for (const c of ['playwright', '/usr/lib/node_modules/playwright', '/usr/local/lib/node_modules/playwright']) {
    try {
      return require(c) as PW;
    } catch {
      /* next */
    }
  }
  return null;
}
const pw = chargerPlaywright();
let browser: import('playwright').Browser;

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

async function demarrer() {
  const port = await freePort();
  const dossier = mkdtempSync(join(tmpdir(), 'kanevas-f390-'));
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: String(port),
    NODE_ENV: 'development',
    KANEVAS_STUB: '1',
    KANEVAS_SANS_SEMIS: '1',
    DB_PATH: join(dossier, 'kanevas.db'),
    SESSION_SECRET: 'e2e-secret-0123456789',
  };
  for (const k of Object.keys(env)) if (k.startsWith('OIDC_')) delete env[k];
  const child: ChildProcess = spawn('node', ['--import', 'tsx', 'src/server.ts'], { env, stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 150; i++) {
    try {
      await fetch(`${base}/healthz`);
      return {
        base,
        stop: () => {
          child.kill('SIGKILL');
          rmSync(dossier, { recursive: true, force: true });
        },
      };
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  child.kill('SIGKILL');
  throw new Error('server did not start');
}

async function mesurer(largeur: number) {
  const s = await demarrer();
  try {
    const login = async (nom: string) => {
      const ctx = await browser.newContext({ baseURL: s.base, viewport: { width: largeur, height: 900 } });
      ctx.setDefaultTimeout(8000);
      const page = await ctx.newPage();
      await page.goto('/connexion-bouchon');
      await page.getByRole('button', { name: `Se connecter en tant que ${nom}` }).click();
      await page.waitForLoadState('networkidle');
      return { ctx, page };
    };
    const antor = await login('Antor');
    const rep = await antor.ctx.request.post('/api/univers', { data: { nom: "Lame d'Ébène", description: '' } });
    assert.equal(rep.status(), 201);
    const id = ((await rep.json()) as { id: number }).id;
    const { page } = await login('Admin');
    await page.goto(`/administration/univers/${id}`);
    await page.waitForLoadState('networkidle');
    const champ = page.getByPlaceholder('Identifiant du compte');
    await champ.waitFor();
    const m = await champ.evaluate((el) => {
      const input = el as HTMLInputElement;
      const cs = getComputedStyle(input);
      const c = document.createElement('canvas').getContext('2d')!;
      c.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const texte = c.measureText(input.placeholder).width;
      const interieur = input.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const f = input.closest('form') as HTMLElement;
      const bouton = Array.from(f.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Ajouter')!;
      const select = f.querySelector('select') as HTMLSelectElement;
      const dedans = [input, select, bouton].map((e) => {
        const r = e.getBoundingClientRect();
        return r.left >= 0 && r.right <= window.innerWidth;
      });
      return {
        texte,
        interieur,
        boutonDansFenetre: dedans[2],
        selectDansFenetre: dedans[1],
        champDansFenetre: dedans[0],
        debordement: document.documentElement.scrollWidth - window.innerWidth,
        roleParDefaut: select.selectedOptions[0]?.textContent?.trim(),
      };
    });
    return m;
  } finally {
    s.stop();
  }
}

describe('E-5 formulaire d\'ajout, zone Membres, à 390 px puis au bureau (depuis le besoin)', { skip: pw ? false : 'playwright introuvable' }, () => {
  before(async () => {
    browser = await pw!.chromium.launch();
  });
  after(async () => {
    await browser?.close();
  });

  // Fails if the identifier field is squeezed so that its prompt « Identifiant du compte » is cut.
  test('390 px : l\'invite « Identifiant du compte » tient en entier dans le champ', async () => {
    const m = await mesurer(390);
    assert.ok(m.interieur >= m.texte, `prompt needs ${Math.ceil(m.texte)}px, field offers ${Math.floor(m.interieur)}px`);
  });

  // Fails if the form pushes the role or « Ajouter » out of the screen (flex-wrap not triggering).
  test('390 px : champ, rôle et « Ajouter » restent dans l\'écran, sans défilement latéral, rôle Joueur par défaut', async () => {
    const m = await mesurer(390);
    assert.ok(m.champDansFenetre && m.selectDansFenetre && m.boutonDansFenetre, JSON.stringify(m));
    assert.equal(m.debordement, 0);
    assert.equal(m.roleParDefaut, 'Joueur');
  });

  // Same need on a desktop: the prompt is whole and nothing overflows.
  test('1440 px : l\'invite tient en entier et rien ne déborde', async () => {
    const m = await mesurer(1440);
    assert.ok(m.interieur >= m.texte, `prompt needs ${Math.ceil(m.texte)}px, field offers ${Math.floor(m.interieur)}px`);
    assert.ok(m.champDansFenetre && m.selectDansFenetre && m.boutonDansFenetre);
    assert.equal(m.debordement, 0);
  });
});

import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { invalide } from '../erreurs.js';
import type { ConfigAssistant } from './disponibilite.js';
import { ecrireJeton, etatJeton, type EtatJeton } from './jeton.js';

/** A session lives 10 minutes at most (AD-112 3). */
export const DUREE_SESSION_MS = 10 * 60 * 1000;
/** Longest wait for the address (production default). */
export const DELAI_ADRESSE_MS = 30_000;
/** Longest wait for the token once the code is typed. */
const DELAI_JETON_MS = 60_000;
/** The output is only scanned, never kept whole. */
const MAX_SORTIE = 64 * 1024;
export const MAX_CODE = 500;

export type CodeConnexion = 'connexion_impossible' | 'connexion_echouee' | 'connexion_expiree';

/** Fixed messages: never the cause, never the output of the process (it holds the token). */
const MESSAGES: Record<CodeConnexion, string> = {
  connexion_impossible: 'La connexion à l’abonnement n’a pas pu démarrer.',
  connexion_echouee: 'Le code a été refusé. Recommencez la connexion.',
  connexion_expiree: 'La connexion a expiré. Recommencez-la.',
};

export class ErreurConnexion extends Error {
  constructor(readonly code: CodeConnexion) {
    super(MESSAGES[code]);
    this.name = 'ErreurConnexion';
  }
}

/** The program to run and its arguments; `env` is built by the session. */
export interface Programme {
  commande: string;
  args: string[];
}

export interface OptionsConnexion {
  /** Replaces the default program (tests, stub). */
  programme?: Programme | undefined;
  /** Wait for the address, ms. */
  delaiAdresse?: number | undefined;
  /** Injectable clock, ms since epoch. */
  maintenant?: (() => number) | undefined;
  /** Read at each call: stub switch and token directory. */
  config?: (() => ConfigAssistant) | undefined;
}

export interface Connexion {
  /** Names this session: a code typed for another one is refused (AD-112 3). */
  connexionId: string;
  adresse: string;
  expireLe: string;
}

interface Session {
  proc: ChildProcess;
  fin: Promise<void>;
  sortie: { texte: string };
  home: string;
  expireMs: number;
  minuteur: NodeJS.Timeout;
  id: string;
  /** A code is being tried: no second one. */
  occupee: boolean;
}

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007\u001b]*(?:\u0007|\u001b\\)|[@-Z\\-_])/g;
const nettoyer = (s: string) => s.replace(ANSI, '').replace(/\r/g, '\n');

/** The first https address on a claude.com, claude.ai or anthropic.com host, else null. */
export function tirerAdresse(sortie: string): string | null {
  for (const m of nettoyer(sortie).matchAll(/https:\/\/[^\s"'<>]+/g)) {
    try {
      const u = new URL(m[0]);
      const h = u.hostname;
      const ok = ['claude.com', 'claude.ai', 'anthropic.com'].some((d) => h === d || h.endsWith(`.${d}`));
      if (u.protocol === 'https:' && ok) return u.href;
    } catch {
      /* not an address */
    }
  }
  return null;
}

export function tirerJeton(sortie: string): string | null {
  return /sk-ant-oat[A-Za-z0-9_-]+/.exec(nettoyer(sortie))?.[0] ?? null;
}

/** The `claude` binary shipped with the Agent SDK (glibc build first). */
export function binaireClaude(): string | null {
  const require = createRequire(import.meta.url);
  for (const paquet of ['claude-agent-sdk-linux-x64', 'claude-agent-sdk-linux-x64-musl', 'claude-agent-sdk-linux-arm64']) {
    try {
      return require.resolve(`@anthropic-ai/${paquet}/claude`);
    } catch {
      /* next */
    }
  }
  return null;
}

const quote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

/** `script -qec` gives the CLI the terminal it wants; the line width is widened so nothing wraps. */
export function programmeScript(): Programme {
  const claude = binaireClaude();
  return {
    commande: 'script',
    args: ['-qec', `stty cols 10000 2>/dev/null; exec ${quote(claude ?? 'claude')} setup-token`, '/dev/null'],
  };
}

export function programmeBouchon(): Programme {
  return {
    commande: process.execPath,
    args: [fileURLToPath(new URL('../../../scripts/faux-setup-token.mjs', import.meta.url))],
  };
}

/**
 * One connection session at a time (AD-5, AD-112 3). Starting replaces the previous one; the
 * process is killed on expiry, cancellation, a refused code, the pose and `fermer()`.
 */
export class ConnexionClaude {
  private session: Session | null = null;

  constructor(readonly options: OptionsConnexion = {}) {}

  private get maintenant() {
    return (this.options.maintenant ?? Date.now)();
  }

  private get config(): ConfigAssistant {
    return this.options.config?.() ?? {};
  }

  private async arreter(s: Session | null): Promise<void> {
    if (!s) return;
    clearTimeout(s.minuteur);
    if (this.session === s) this.session = null;
    // The process leads its group: the program behind `script` dies with it.
    try {
      if (s.proc.pid && s.proc.exitCode === null && s.proc.signalCode === null) process.kill(-s.proc.pid, 'SIGKILL');
    } catch {
      /* already gone */
    }
    await s.fin;
    rmSync(s.home, { recursive: true, force: true });
  }

  async demarrer(): Promise<Connexion> {
    await this.arreter(this.session);
    const programme =
      this.options.programme ?? (this.config.KANEVAS_STUB === '1' ? programmeBouchon() : programmeScript());
    const delai = this.options.delaiAdresse ?? DELAI_ADRESSE_MS;
    const home = mkdtempSync(join(tmpdir(), 'kanevas-claude-session-'));
    const sortie = { texte: '' };

    let proc: ChildProcess;
    try {
      proc = spawn(programme.commande, programme.args, {
        shell: false,
        detached: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: home, TERM: 'xterm' },
      });
    } catch {
      rmSync(home, { recursive: true, force: true });
      throw new ErreurConnexion('connexion_impossible');
    }
    let sorti = false;
    const fin = new Promise<void>((resolve) => {
      proc.once('close', () => {
        sorti = true;
        resolve();
      });
      proc.once('error', () => {
        sorti = true;
        resolve();
      });
    });
    const lire = (morceau: Buffer) => {
      sortie.texte = (sortie.texte + morceau.toString('utf8')).slice(-MAX_SORTIE);
    };
    proc.stdout?.on('data', lire);
    proc.stderr?.on('data', lire);
    proc.stdin?.on('error', () => {});

    const minuteur = setTimeout(() => {
      void this.arreter(session);
    }, DUREE_SESSION_MS);
    minuteur.unref();
    const debut = this.maintenant;
    const session: Session = { proc, fin, sortie, home, expireMs: debut + DUREE_SESSION_MS, minuteur, id: randomUUID(), occupee: false };

    const limite = Date.now() + delai;
    let adresse: string | null = null;
    while (!adresse && !sorti && Date.now() < limite) {
      adresse = tirerAdresse(sortie.texte);
      if (!adresse) await new Promise((r) => setTimeout(r, 20));
    }
    adresse ??= tirerAdresse(sortie.texte);
    if (!adresse) {
      await this.arreter(session);
      throw new ErreurConnexion('connexion_impossible');
    }
    this.session = session;
    return { connexionId: session.id, adresse, expireLe: new Date(session.expireMs).toISOString() };
  }

  /** Types the code; `connexionId` (required by the route) pins it to its own session. One try only — the session ends whatever the outcome. */
  async soumettreCode(code: unknown, connexionId?: unknown): Promise<EtatJeton> {
    if (connexionId !== undefined && (typeof connexionId !== 'string' || !connexionId || connexionId.length > 100)) {
      throw invalide('La connexion est absente.');
    }
    if (typeof code !== 'string' || !code.trim() || code.length > MAX_CODE || /[\u0000-\u001f\u007f]/.test(code)) {
      throw invalide(`Le code doit faire de 1 à ${MAX_CODE} caractères.`);
    }
    const s = this.session;
    if (!s || (connexionId !== undefined && s.id !== connexionId) || s.occupee) throw new ErreurConnexion('connexion_expiree');
    s.occupee = true;
    if (this.maintenant >= s.expireMs) {
      await this.arreter(s);
      throw new ErreurConnexion('connexion_expiree');
    }
    try {
      s.proc.stdin?.write(`${code.trim()}\r`);
    } catch {
      /* the wait below ends on the exit */
    }
    const limite = Date.now() + DELAI_JETON_MS;
    let jeton: string | null = null;
    let fini = false;
    void s.fin.then(() => {
      fini = true;
    });
    while (!jeton && Date.now() < limite) {
      jeton = tirerJeton(s.sortie.texte);
      if (jeton || fini) break;
      await new Promise((r) => setTimeout(r, 20));
    }
    jeton ??= tirerJeton(s.sortie.texte);
    if (!jeton) {
      await this.arreter(s);
      throw new ErreurConnexion('connexion_echouee');
    }
    try {
      ecrireJeton(jeton, this.config);
    } catch {
      await this.arreter(s);
      throw new ErreurConnexion('connexion_echouee');
    }
    await this.arreter(s);
    return etatJeton(this.config);
  }

  async annuler(): Promise<void> {
    await this.arreter(this.session);
  }

  /** Server shutdown. */
  async fermer(): Promise<void> {
    await this.annuler();
  }
}

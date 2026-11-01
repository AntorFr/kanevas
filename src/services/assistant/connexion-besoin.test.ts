// Tests of the connection session (B-51, P-15, AD-112) written from the need only: real process (the stub
// `setup-token`), injected clock. Expected values are literals from docs/ecrans.md and AD-112.
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { afterEach, describe, it } from 'node:test';

import { ConnexionClaude, programmeBouchon } from './connexion-claude.ts';
import { disponibilite } from './disponibilite.ts';

const dirs: string[] = [];
const sessions: ConnexionClaude[] = [];
afterEach(async () => {
  for (const s of sessions.splice(0)) await s.fermer();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function session(horloge: { t: number }) {
  const dir = mkdtempSync(join(tmpdir(), 'kanevas-conn-'));
  dirs.push(dir);
  const c = new ConnexionClaude({
    programme: programmeBouchon(),
    maintenant: () => horloge.t,
    config: () => ({ KANEVAS_STUB: undefined, CLAUDE_DIR: dir, CLAUDE_CODE_OAUTH_TOKEN: '' }),
  });
  sessions.push(c);
  return { c, dir, fichier: join(dir, 'oauth-token') };
}

const DIX_MIN = 10 * 60 * 1000;

describe('kanevas-import-jeton-assistant : session de connexion (B-51, AD-112)', () => {
  // Panne visée : la session ne dit pas son échéance, ou n'écrit pas le jeton avec le bon code.
  it('démarrer rend l’adresse du bouchon et une échéance à 10 minutes ; le code bouchon pose le jeton', async () => {
    const h = { t: Date.parse('2026-10-12T10:00:00.000Z') };
    const { c, fichier, dir } = session(h);
    const conn = await c.demarrer();
    assert.equal(conn.adresse, 'https://claude.ai/oauth/authorize?code=true&client_id=bouchon');
    assert.equal(conn.expireLe, '2026-10-12T10:10:00.000Z');
    const etat = await c.soumettreCode('bouchon');
    assert.equal(etat.pose, true);
    assert.equal(etat.source, 'instance');
    assert.ok(existsSync(fichier));
    assert.equal(disponibilite({ CLAUDE_DIR: dir, CLAUDE_CODE_OAUTH_TOKEN: '' }), 'claude-agent');
  });

  // Panne visée : l'expiration à 10 minutes n'est pas appliquée côté serveur.
  it('bord : valide à 9 min 59 s, expirée à 10 min 01 s (410 connexion_expiree, rien posé)', async () => {
    const h = { t: Date.parse('2026-10-12T10:00:00.000Z') };
    const a = session(h);
    await a.c.demarrer();
    h.t += DIX_MIN - 1000;
    assert.equal((await a.c.soumettreCode('bouchon')).pose, true);
    const b = session(h);
    await b.c.demarrer();
    h.t += DIX_MIN + 1000;
    await assert.rejects(b.c.soumettreCode('bouchon'), (e: { code?: string }) => e.code === 'connexion_expiree');
    assert.equal(existsSync(b.fichier), false);
  });

  // Panne visée : un code faux pose quand même, ou la session reste utilisable pour un second essai.
  it('code refusé : connexion_echouee, rien posé ; la session est terminée (second code : connexion_expiree)', async () => {
    const h = { t: Date.now() };
    const { c, fichier } = session(h);
    await c.demarrer();
    await assert.rejects(c.soumettreCode('autre'), (e: { code?: string }) => e.code === 'connexion_echouee');
    assert.equal(existsSync(fichier), false);
    await assert.rejects(c.soumettreCode('bouchon'), (e: { code?: string }) => e.code === 'connexion_expiree');
    assert.equal(existsSync(fichier), false);
  });

  // Panne visée : le code est tapé sans session (jamais ouverte, annulée, ou déjà consommée).
  it('sans session, avant ouverture ou après annulation : connexion_expiree', async () => {
    const h = { t: Date.now() };
    const { c } = session(h);
    await assert.rejects(c.soumettreCode('bouchon'), (e: { code?: string }) => e.code === 'connexion_expiree');
    await c.demarrer();
    await c.annuler();
    await assert.rejects(c.soumettreCode('bouchon'), (e: { code?: string }) => e.code === 'connexion_expiree');
  });

  // Panne visée : une nouvelle connexion ne remplace pas l'ancienne.
  it('démarrer deux fois : une seule session, la seconde remplace la première (un seul code est consommé)', async () => {
    const h = { t: Date.now() };
    const { c, fichier } = session(h);
    await c.demarrer();
    await c.demarrer();
    assert.equal((await c.soumettreCode('bouchon')).pose, true);
    await assert.rejects(c.soumettreCode('bouchon'), (e: { code?: string }) => e.code === 'connexion_expiree');
    assert.ok(existsSync(fichier));
  });

  // Panne visée : un code vide, trop long ou à caractère de contrôle atteint le programme ou est pris pour un code refusé.
  it('entrée invalide (vide, 501 caractères, caractère de contrôle) : refusée sans être un code refusé, la connexion reste ouverte', async () => {
    const h = { t: Date.now() };
    const { c } = session(h);
    await c.demarrer();
    for (const mauvais of ['', '   ', 'x'.repeat(501), 'bou\nchon']) {
      await assert.rejects(c.soumettreCode(mauvais), (e: { code?: string }) => e.code !== 'connexion_echouee' && e.code !== 'connexion_expiree');
    }
    assert.equal((await c.soumettreCode('bouchon')).pose, true);
  });

  // Panne visée : un programme absent est présenté comme une session ouverte, ou fuit la cause.
  it('programme absent : connexion_impossible, message sans la cause', async () => {
    const c = new ConnexionClaude({ programme: { commande: '/nulle/part/script', args: [] }, delaiAdresse: 500 });
    sessions.push(c);
    await assert.rejects(c.demarrer(), (e: { code?: string; message: string }) => e.code === 'connexion_impossible' && !/nulle|ENOENT|spawn/.test(e.message));
  });

  // Panne visée : le jeton posé est lisible par d'autres comptes du pod.
  it('le fichier posé est en 0600', async () => {
    const h = { t: Date.now() };
    const { c, fichier } = session(h);
    await c.demarrer();
    await c.soumettreCode('bouchon');
    assert.equal((statSync(fichier).mode & 0o777).toString(8), '600');
    assert.ok(readFileSync(fichier, 'utf8').length > 0);
  });

  // Panne visée : le code et Entrée repartent d'un seul morceau, le vrai CLI avale Entrée d'un collage long (P-15).
  it('un code collé de 87 caractères (43 + # + 43) pose le jeton', async () => {
    const h = { t: Date.now() };
    const { c, fichier } = session(h);
    await c.demarrer();
    const code = `${'a'.repeat(43)}#${'b'.repeat(43)}`;
    assert.equal(code.length, 87);
    assert.equal((await c.soumettreCode(code)).pose, true);
    assert.ok(existsSync(fichier));
  });
});

// Le faux setup-token lancé seul : il doit reproduire le CLI qui prend un code long pour un collage.
describe('faux setup-token : forme des écritures (P-15)', () => {
  const CODE87 = `${'a'.repeat(43)}#${'b'.repeat(43)}`;
  const procs: ReturnType<typeof spawn>[] = [];
  afterEach(() => {
    for (const p of procs.splice(0)) p.kill('SIGKILL');
  });

  function lancer() {
    const prog = programmeBouchon();
    const p = spawn(prog.commande, prog.args, { stdio: ['pipe', 'pipe', 'pipe'] });
    procs.push(p);
    let sortie = '';
    let fini: number | null = null;
    p.stdout!.on('data', (d: Buffer) => (sortie += d.toString()));
    p.on('exit', (c) => (fini = c ?? -1));
    const attendre = async (cond: () => boolean, ms = 3000) => {
      const fin = Date.now() + ms;
      while (!cond() && Date.now() < fin) await new Promise((r) => setTimeout(r, 20));
      return cond();
    };
    return { p, sortie: () => sortie, fini: () => fini, attendre };
  }

  // Panne visée : le faux valide un collage long avec Entrée dans le même morceau (il ne reproduirait plus le CLI).
  it('87 caractères + CR du même morceau : ne valide pas, reste en attente, code masqué', async () => {
    const f = lancer();
    assert.ok(await f.attendre(() => f.sortie().includes('Paste code here')));
    f.p.stdin!.write(`${CODE87}\r`);
    assert.ok(await f.attendre(() => f.sortie().includes('•')));
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(f.fini(), null);
    assert.ok(!f.sortie().includes('sk-ant'));
    assert.ok(!f.sortie().includes('aaaa'));
  });

  // Panne visée : le faux n'accepte pas un code long arrivé seul, puis Entrée seul.
  it('code seul puis CR dans un morceau suivant : valide', async () => {
    const f = lancer();
    assert.ok(await f.attendre(() => f.sortie().includes('Paste code here')));
    f.p.stdin!.write(CODE87);
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(f.fini(), null);
    f.p.stdin!.write('\r');
    assert.ok(await f.attendre(() => f.fini() !== null));
    assert.equal(f.fini(), 0);
    assert.ok(f.sortie().includes('sk-ant-oat01-bouchon'));
  });

  // Panne visée : seuil mal placé (40 doit se comporter comme un code tapé).
  it('bord : 40 caractères + CR du même morceau est soumis (refusé car faux code), 41 ne l’est pas', async () => {
    const a = lancer();
    assert.ok(await a.attendre(() => a.sortie().includes('Paste code here')));
    a.p.stdin!.write(`${'x'.repeat(40)}\r`);
    assert.ok(await a.attendre(() => a.fini() !== null));
    assert.equal(a.fini(), 1);
    const b = lancer();
    assert.ok(await b.attendre(() => b.sortie().includes('Paste code here')));
    b.p.stdin!.write(`${'x'.repeat(41)}\r`);
    await new Promise((r) => setTimeout(r, 400));
    assert.equal(b.fini(), null);
  });

  // Panne visée : le code court `bouchon` ne valide plus.
  it('bouchon + CR du même morceau valide', async () => {
    const f = lancer();
    assert.ok(await f.attendre(() => f.sortie().includes('Paste code here')));
    f.p.stdin!.write('bouchon\r');
    assert.ok(await f.attendre(() => f.fini() !== null));
    assert.equal(f.fini(), 0);
  });
});

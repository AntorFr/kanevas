// The cause of a failed start travels with the error and is kept by the service; nothing of it reaches the client.
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { ConnexionClaude, ErreurConnexion, programmeBouchon } from './connexion-claude.ts';

const sessions: ConnexionClaude[] = [];
afterEach(async () => {
  for (const s of sessions.splice(0)) await s.fermer();
});
const node = (js: string, delai: number) => {
  const c = new ConnexionClaude({ programme: { commande: process.execPath, args: ['-e', js] }, delaiAdresse: delai });
  sessions.push(c);
  return c;
};

describe('connexion Claude : cause de l’échec', () => {
  it('programme qui sort aussitôt (code 3, « boom ») : « sorti avec le code 3 » et la sortie, hors du message', async () => {
    const c = node('console.error("boom"); process.exit(3)', 5000);
    assert.equal(c.derniereCause, null);
    await assert.rejects(c.demarrer(), (e: ErreurConnexion) => {
      assert.equal(e.code, 'connexion_impossible');
      assert.ok(!e.message.includes('boom') && !e.message.includes('code 3'));
      assert.match(e.diagnostic ?? '', /sorti avec le code 3/);
      assert.match(e.diagnostic ?? '', /boom/);
      return true;
    });
    assert.match(c.derniereCause ?? '', /sorti avec le code 3.*boom/s);
  });

  it('programme muet jusqu’au délai : « délai dépassé » (et non une sortie dont le service est l’auteur)', async () => {
    const c = node('process.stdout.write("attente"); setTimeout(()=>{},20000)', 300);
    await assert.rejects(c.demarrer(), (e: ErreurConnexion) => e.code === 'connexion_impossible');
    assert.match(c.derniereCause ?? '', /délai dépassé/);
    assert.match(c.derniereCause ?? '', /attente/);
  });

  it('programme absent : « lancement impossible »', async () => {
    const c = new ConnexionClaude({ programme: { commande: '/nulle/part/x', args: [] }, delaiAdresse: 500 });
    sessions.push(c);
    await assert.rejects(c.demarrer(), (e: ErreurConnexion) => e.code === 'connexion_impossible' && /lancement impossible/.test(e.diagnostic ?? ''));
    assert.match(c.derniereCause ?? '', /lancement impossible/);
  });

  it('l’extrait est borné à la fin de la sortie', async () => {
    const c = node('process.stdout.write("DEBUT" + "x".repeat(5000) + "FIN"); process.exit(1)', 5000);
    await assert.rejects(c.demarrer());
    assert.ok(c.derniereCause!.length < 700, String(c.derniereCause!.length));
    assert.match(c.derniereCause!, /FIN/);
    assert.ok(!c.derniereCause!.includes('DEBUT'));
  });

  it('un démarrage réussi remet la cause à null', async () => {
    const c = node('process.exit(1)', 2000);
    await assert.rejects(c.demarrer());
    assert.ok(c.derniereCause);
    c.options.programme = programmeBouchon();
    await c.demarrer();
    assert.equal(c.derniereCause, null);
  });
});

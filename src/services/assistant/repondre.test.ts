import assert from 'node:assert/strict';
import { test } from 'node:test';

import { openDb, migrate, type Db } from '../../db/db.js';
import { creerCampagne, listerCampagnes } from '../campagnes.js';
import { assurerCompte } from '../comptes.js';
import { creerFiche } from '../fiches.js';
import { ajouterMembre } from '../membres.js';
import { ajouterSection, changerAudience } from '../sections.js';
import { creerUnivers } from '../univers.js';
import { catalogueDe } from './catalogue.js';
import { ClaudeAgentTransport } from './claude-agent.js';
import { disponibilite } from './disponibilite.js';
import { ErreurAssistant } from './erreurs.js';
import { repondre } from './repondre.js';

const STUB = { KANEVAS_STUB: '1' };
const HORS =
  "Je ne sais répondre qu'à des demandes de test : chercher, lire, ajouter, créer une campagne ou un scénario.";

function monde() {
  const db: Db = openDb(':memory:');
  migrate(db);
  const antor = assurerCompte(db, 'antor');
  const lea = assurerCompte(db, 'lea');
  const u = creerUnivers(db, antor.id, { nom: 'Lame' });
  ajouterMembre(db, antor.id, u.id, 'lea', 'joueur');
  const aldric = creerFiche(db, antor.id, u.id, { type: 'personnage', titre: 'Maître Aldric', charge: { pj: false } });
  const app = ajouterSection(db, antor.id, u.id, aldric.id, { titre: 'Apparence', contenu: 'Grand.' });
  changerAudience(db, antor.id, u.id, aldric.id, app.id, { joueursLisent: true });
  ajouterSection(db, antor.id, u.id, aldric.id, { titre: 'Vérité — MJ seul', contenu: 'Traître.' });
  creerCampagne(db, antor.id, u.id, { nom: 'La Couronne brisée' });
  const nb = (t: string) => (db.prepare(`SELECT count(*) n FROM ${t}`).get() as { n: number }).n;
  const dit = (compte: number, m: string, deps: any = { config: STUB }) => repondre(db, compte, u.id, m, [], deps);
  return { db, antor, lea, u, nb, dit };
}

const SCEN = 'Crée un scénario « Acte III — La crypte » dans « La Couronne brisée »';

test('bouchon : Antor crée le scénario, événement scenario_cree', async () => {
  const { antor, dit, nb } = monde();
  const r = await dit(antor.id, SCEN);
  assert.equal(nb('scenarios'), 1);
  assert.deepEqual(r.evenements.map((e) => e.type), ['scenario_cree']);
  assert.ok(r.reponse.includes('Acte III — La crypte'));
});

test('bouchon : même phrase pour Léa, rien écrit, refus de l’outil absent, aucun événement', async () => {
  const { lea, dit, nb } = monde();
  const r = await dit(lea.id, SCEN);
  assert.equal(nb('scenarios'), 0);
  assert.deepEqual(r.evenements, []);
  assert.ok(r.reponse.includes('creer_scenario') && /ne peux pas/.test(r.reponse), r.reponse);
});

test('bouchon : lire la section « Vérité » pour Léa → Introuvable.', async () => {
  const { lea, dit } = monde();
  const r = await dit(lea.id, 'Lis-moi la section « Vérité »');
  assert.equal(r.reponse, 'Introuvable.');
  assert.deepEqual(r.evenements, []);
});

test('bouchon : que sait-on d’Aldric — Apparence seule pour Léa, deux sections pour Antor', async () => {
  const { lea, antor, dit } = monde();
  const l = await dit(lea.id, 'Que sait-on d’Aldric ?');
  assert.ok(l.reponse.includes('Apparence') && l.reponse.includes('Grand.'));
  assert.ok(!l.reponse.includes('Vérité') && !l.reponse.includes('Traître'));
  const a = await dit(antor.id, "Que sait-on d'Aldric ?");
  assert.ok(a.reponse.includes('Apparence') && a.reponse.includes('Vérité'));
});

test('bouchon : « échec » lève l’erreur de transport, rien écrit', async () => {
  const { antor, dit, nb } = monde();
  await assert.rejects(dit(antor.id, 'Fais un échec'), (e: any) => e instanceof ErreurAssistant && e.code === 'assistant_erreur');
  assert.equal(nb('scenarios'), 0);
});

test('bouchon : « échec » dans une demande de création n’écrit rien ni n’annonce d’événement', async () => {
  const { antor, dit, nb } = monde();
  // AD-78 order: the creation rule wins over « échec »; the result is still a coherent single outcome.
  const r = await dit(antor.id, 'Crée une campagne « Les Marches rouges »');
  assert.deepEqual(r.evenements.map((e) => e.type), ['campagne_creee']);
  assert.equal(nb('campagnes'), 2);
});

test('bouchon : message hors script → phrase d’AD-78', async () => {
  const { antor, dit } = monde();
  assert.equal((await dit(antor.id, 'Bonjour')).reponse, HORS);
});

test('Léa ne crée pas de campagne', async () => {
  const { lea, dit, nb } = monde();
  const r = await dit(lea.id, 'Crée une campagne « Les Marches rouges »');
  assert.equal(nb('campagnes'), 1);
  assert.deepEqual(r.evenements, []);
});

test('sans rôle : introuvable, comme un univers inconnu', async () => {
  const { db, u, dit } = monde();
  const paul = assurerCompte(db, 'paul');
  await assert.rejects(dit(paul.id, 'Bonjour'), (e: any) => e.code === 'introuvable');
  await assert.rejects(repondre(db, paul.id, 9999, 'x', [], { config: STUB }), (e: any) => e.code === 'introuvable');
  void u;
});

test('disponibilité : bouchon / claude-agent / aucune', () => {
  assert.equal(disponibilite({ KANEVAS_STUB: '1' }), 'bouchon');
  assert.equal(disponibilite({ KANEVAS_STUB: '1', CLAUDE_CODE_OAUTH_TOKEN: 'x' }), 'bouchon');
  assert.equal(disponibilite({ CLAUDE_CODE_OAUTH_TOKEN: 'tok' }), 'claude-agent');
  assert.equal(disponibilite({ CLAUDE_CODE_OAUTH_TOKEN: '' }), 'aucune');
  assert.equal(disponibilite({ CLAUDE_CODE_OAUTH_TOKEN: '   ' }), 'aucune');
  assert.equal(disponibilite({}), 'aucune');
  assert.equal(disponibilite({ KANEVAS_STUB: '0' }), 'aucune');
});

test('sans jeton : assistant_indisponible, aucun transport appelé', async () => {
  const { antor, dit } = monde();
  let appels = 0;
  const transport = { nom: 't', repondre: async () => (appels++, 'x') };
  for (const config of [{}, { CLAUDE_CODE_OAUTH_TOKEN: '' }]) {
    await assert.rejects(dit(antor.id, 'Bonjour', { config, transport }), (e: any) => e instanceof ErreurAssistant && e.code === 'assistant_indisponible');
  }
  assert.equal(appels, 0);
});

test('sans jeton, le message « échec » ne passe pas par le bouchon : indisponible, pas assistant_erreur', async () => {
  const { antor, dit } = monde();
  await assert.rejects(dit(antor.id, 'échec', { config: {} }), (e: any) => e.code === 'assistant_indisponible');
});

test('erreur de transport : message fixe, sans le jeton ni la cause, pas d’événement', async () => {
  const { antor, dit } = monde();
  const JETON = 'sk-ant-oat01-SECRET';
  const logs: string[] = [];
  const orig = [console.log, console.error, console.warn];
  console.log = console.error = console.warn = (...a: unknown[]) => void logs.push(a.join(' '));
  try {
    const transport = { nom: 't', repondre: async () => { throw new Error(`401 bad token ${JETON}`); } };
    await assert.rejects(dit(antor.id, 'x', { config: { CLAUDE_CODE_OAUTH_TOKEN: JETON }, transport }), (e: any) => {
      assert.equal(e.code, 'assistant_erreur');
      assert.ok(!JSON.stringify(e).includes(JETON) && !e.message.includes(JETON) && !String(e.stack).includes(JETON));
      assert.equal(e.cause, undefined);
      return true;
    });
  } finally {
    [console.log, console.error, console.warn] = orig;
  }
  assert.ok(!logs.join('\n').includes(JETON));
});

test('délai : abort et assistant_erreur ; le verrou n’est pas tenu après', async () => {
  const { antor, dit } = monde();
  let abort: AbortSignal | undefined;
  const transport = { nom: 't', repondre: (d: any) => ((abort = d.abort.signal), new Promise<string>(() => {})) };
  await assert.rejects(dit(antor.id, 'x', { config: { CLAUDE_CODE_OAUTH_TOKEN: 't' }, transport, delaiMs: 20 }), (e: any) => e.code === 'assistant_erreur');
  assert.equal(abort?.aborted, true);
});

test('un événement d’une écriture réussie avant un échec n’est pas rendu (aucune réponse)', async () => {
  const { antor, dit } = monde();
  const transport = {
    nom: 't',
    repondre: async (d: any) => {
      d.outils.find((o: any) => o.nom === 'creer_campagne').executer({ nom: 'Z' });
      throw new Error('boom');
    },
  };
  await assert.rejects(dit(antor.id, 'x', { config: { CLAUDE_CODE_OAUTH_TOKEN: 't' }, transport }), (e: any) => e.code === 'assistant_erreur');
});

test('historique tronqué aux 20 derniers messages', async () => {
  const { antor, db, u } = monde();
  const hist = Array.from({ length: 25 }, (_, i) => ({ role: 'user' as const, content: `m${i}` }));
  let vu: any[] = [];
  const transport = { nom: 't', repondre: async (d: any) => ((vu = d.historique), 'ok') };
  await repondre(db, antor.id, u.id, 'x', hist, { config: { CLAUDE_CODE_OAUTH_TOKEN: 't' }, transport });
  assert.equal(vu.length, 20);
  assert.equal(vu[0].content, 'm5');
});

for (const [qui, outilsAttendus] of [['antor', true], ['lea', false]] as const) {
  test(`claude-agent (query factice) pour ${qui} : options exactes`, async () => {
    const { db, u, antor, lea } = monde();
    const compte = qui === 'antor' ? antor : lea;
    const cat = catalogueDe(db, compte.id, u.id);
    let recu: any;
    let serveur: any;
    const query: any = (arg: any) => {
      recu = arg;
      serveur = arg.options.mcpServers.kanevas;
      return (async function* () {
        yield { type: 'result', subtype: 'success', result: '  Bonjour  ' };
      })();
    };
    const r = await repondre(db, compte.id, u.id, 'salut', [{ role: 'user', content: 'avant' }], {
      config: { CLAUDE_CODE_OAUTH_TOKEN: 'tok-123', ANTHROPIC_MODEL: 'modele-x' },
      transport: new ClaudeAgentTransport({ jeton: 'tok-123', modele: 'modele-x', query }),
    });
    assert.equal(r.reponse, 'Bonjour');
    const o = recu.options;
    assert.deepEqual(o.tools, []);
    assert.deepEqual(o.settingSources, []);
    assert.equal(o.permissionMode, 'dontAsk');
    assert.equal(o.maxTurns, 12);
    assert.ok(o.abortController instanceof AbortController);
    assert.equal(o.model, 'modele-x');
    assert.deepEqual(o.env, { CLAUDE_CODE_OAUTH_TOKEN: 'tok-123' });
    assert.deepEqual([...o.allowedTools].sort(), cat.outils.map((x) => `mcp__kanevas__${x.nom}`).sort());
    assert.equal(o.allowedTools.includes('mcp__kanevas__creer_scenario'), outilsAttendus);
    assert.equal(serveur.name, 'kanevas');
    assert.ok(recu.prompt.includes('avant') && recu.prompt.includes('salut'));
    assert.ok(typeof o.systemPrompt === 'string' && /français/.test(o.systemPrompt) && /Introuvable/.test(o.systemPrompt));
  });
}

test('claude-agent : sans résultat success → assistant_erreur ; SDK qui cite le jeton → message fixe', async () => {
  const { antor, db, u } = monde();
  const vide: any = () => (async function* () {})();
  await assert.rejects(
    repondre(db, antor.id, u.id, 'x', [], { config: { CLAUDE_CODE_OAUTH_TOKEN: 't' }, transport: new ClaudeAgentTransport({ jeton: 't', modele: 'm', query: vide }) }),
    (e: any) => e.code === 'assistant_erreur',
  );
  const boom: any = () => (async function* () { throw new Error('auth failed for tok-SECRET'); })();
  await assert.rejects(
    repondre(db, antor.id, u.id, 'x', [], { config: { CLAUDE_CODE_OAUTH_TOKEN: 'tok-SECRET' }, transport: new ClaudeAgentTransport({ jeton: 'tok-SECRET', modele: 'm', query: boom }) }),
    (e: any) => !e.message.includes('tok-SECRET') && e.code === 'assistant_erreur',
  );
});

test('sans jeton, le SDK n’est pas appelé (dispo avant adaptateur)', async () => {
  const { antor, dit } = monde();
  await assert.rejects(dit(antor.id, 'x', { config: { CLAUDE_CODE_OAUTH_TOKEN: '' } }), (e: any) => e.code === 'assistant_indisponible');
});

test('bouchon : la campagne créée est bien listée (écriture réelle)', async () => {
  const { antor, dit, db, u } = monde();
  await dit(antor.id, 'Crée une campagne « Les Marches rouges »');
  assert.ok(listerCampagnes(db, antor.id, u.id).some((c: any) => c.nom === 'Les Marches rouges'));
});

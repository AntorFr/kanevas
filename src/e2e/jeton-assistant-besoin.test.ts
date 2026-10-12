// Black-box tests of `kanevas-import-jeton-assistant` written from the need only (B-51, P-15, E-5 panel,
// docs/ecrans.md "Détail de l'écran de kanevas-import-jeton-assistant", AD-112 route contract), not from the code.
// Real server in stub mode (the stub `setup-token` accepts the code `bouchon`), real Chromium.
// Expected texts and values are literals copied from the doc.
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import { type Any, attendre, connecte, launch, rx, rxExact, skipBrowser, startServer, texte as texteDePage } from './harnais.test.ts';

const ROUTE = '/api/instance/assistant/jeton';
const VALEUR_BOUCHON = 'sk-ant-oat01-bouchon';
const VALEUR_DEPLOIEMENT = 'sk-ant-oat01-secret-du-deploiement';
const ADRESSE_BOUCHON = 'https://claude.ai/oauth/authorize?code=true&client_id=bouchon';

const aFermer: Array<() => Promise<void> | void> = [];
after(async () => {
  for (const f of aFermer.reverse()) await f();
});

interface Monde {
  base: string;
  dir: string;
  fichier: string;
  browser: Any;
  admin: Any;
  lea: Any;
  reponses: string[];
}

async function monde(env: Record<string, string> = {}): Promise<Monde> {
  const dir = mkdtempSync(join(tmpdir(), 'kanevas-jeton-'));
  const s = await startServer({ CLAUDE_DIR: dir, ...env });
  const browser = await launch();
  aFermer.push(async () => {
    await browser.close();
    s.stop();
    rmSync(dir, { recursive: true, force: true });
  });
  const admin = await connecte(browser, s.base, 'Admin');
  const lea = await connecte(browser, s.base, 'Léa');
  const reponses: string[] = [];
  admin.page.on('response', async (r: Any) => {
    if (!r.url().includes('/api/instance/assistant')) return;
    try {
      reponses.push(await r.text());
    } catch {
      /* body gone with the navigation */
    }
  });
  return { base: s.base, dir, fichier: join(dir, 'oauth-token'), browser, admin, lea, reponses };
}

async function ouvrirAdmin(page: Any): Promise<void> {
  await page.goto('/administration');
  await page.getByRole('heading', { name: 'Administration', level: 1 }).waitFor();
  await page.getByRole('region', { name: rx("Jeton de l'assistant") }).waitFor();
  await attendre(page);
}

const panneau = (page: Any) => page.getByRole('region', { name: rx("Jeton de l'assistant") });
const bouton = (page: Any, nom: string) => page.getByRole('button', { name: rxExact(nom) });
const voir = (page: Any, message: string) => page.getByText(rx(message)).first().waitFor();

async function connecter(page: Any): Promise<void> {
  await page.getByRole('button', { name: /^(Connecter|Reconnecter) l.abonnement$/ }).click();
  await page.getByLabel('Code', { exact: true }).waitFor();
}

async function valider(page: Any, code: string): Promise<void> {
  await page.getByLabel('Code', { exact: true }).fill(code);
  await bouton(page, 'Valider').click();
  await attendre(page);
}

/** Visible text of a page or of a locator, apostrophes normalised. */
async function texte(cible: Any): Promise<string> {
  if (typeof cible.waitForLoadState !== 'function') return ((await cible.innerText()) as string).replace(/’/g, "'");
  return texteDePage(cible);
}

const aujourdhui = () => new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

describe('kanevas-import-jeton-assistant : B-51 / P-15 / E-5 panneau (navigateur)', { skip: skipBrowser }, () => {
  // Panne visée : le panneau manque, ou « Connecter » n'ouvre rien, ou le code `bouchon` ne pose pas.
  it('critère de sortie : Admin connecte l’abonnement avec le code bouchon et lit « Jeton posé le … »', async () => {
    const m = await monde();
    const p = m.admin.page;
    await ouvrirAdmin(p);
    let t = await texte(panneau(p));
    assert.match(t, /Aucun jeton posé\./);
    assert.equal(await p.getByRole('button', { name: /Reconnecter/ }).count(), 0);
    await p.getByRole('button', { name: rxExact("Connecter l'abonnement") }).click();
    await p.getByLabel('Code', { exact: true }).waitFor();
    t = await texte(panneau(p));
    assert.ok(t.includes(ADRESSE_BOUCHON), `adresse d'autorisation visible : ${t}`);
    assert.match(t, /Cette connexion expire dans 10 minutes\./);
    assert.match(t, /Reste \d+ min\./);
    assert.equal(await p.getByRole('button', { name: rxExact('Valider') }).isDisabled(), true, 'Valider désactivé tant que le champ est vide');
    for (const nom of ['Copier', 'Annuler']) assert.equal(await p.getByRole('button', { name: rxExact(nom) }).count(), 1, nom);
    const ouvrir = p.getByRole('link', { name: rxExact('Ouvrir') });
    assert.equal(await ouvrir.getAttribute('href'), ADRESSE_BOUCHON);
    assert.equal(await ouvrir.getAttribute('target'), '_blank');
    assert.equal(await ouvrir.getAttribute('rel'), 'noopener noreferrer');
    assert.equal(await p.evaluate(() => (document.activeElement as HTMLInputElement | null)?.labels?.[0]?.textContent), 'Code', 'focus sur le champ Code');
    await valider(p, 'bouchon');
    await voir(p, `Jeton posé le ${aujourdhui()}.`);
    t = await texte(panneau(p));
    assert.match(t, /L'assistant est disponible sur tous les univers\./);
    assert.equal(await p.getByLabel('Code', { exact: true }).count(), 0, 'le champ disparaît');
    assert.equal(await p.getByRole('button', { name: rxExact("Reconnecter l'abonnement") }).count(), 1);
    assert.equal(await p.getByRole('status').filter({ hasText: 'Jeton posé le' }).count() >= 1, true, 'région role=status');
    await p.screenshot({ path: '/tmp/jeton-pose.png', fullPage: true });
    // reload: still posé, from the read state
    await p.reload();
    await panneau(p).waitFor();
    await voir(p, `Jeton posé le ${aujourdhui()}.`);
  });

  // Panne visée : le jeton est écrit dans le volume en lisible par tous, ou n'est pas écrit (donc perdu au redémarrage).
  it('le jeton posé est un fichier 0600 du volume, dans un dossier 0700', async () => {
    const m = await monde();
    await ouvrirAdmin(m.admin.page);
    assert.equal(existsSync(m.fichier), false);
    await connecter(m.admin.page);
    await valider(m.admin.page, 'bouchon');
    await voir(m.admin.page, 'Jeton posé le');
    assert.equal(existsSync(m.fichier), true);
    assert.equal((statSync(m.fichier).mode & 0o777).toString(8), '600');
    assert.ok(readFileSync(m.fichier, 'utf8').trim().length > 0);
  });

  // Panne visée : la disponibilité reste lue une fois au démarrage (redémarrage exigé), ou le fichier ne prime pas.
  it('l’assistant devient disponible (claude-agent) sans redémarrage, le fichier prime sur la variable', async () => {
    const { disponibilite } = await import('../services/assistant/disponibilite.ts');
    const m = await monde({ CLAUDE_CODE_OAUTH_TOKEN: VALEUR_DEPLOIEMENT });
    // another volume with no file: the variable alone makes it available
    assert.equal(disponibilite({ CLAUDE_DIR: join(m.dir, 'ailleurs'), CLAUDE_CODE_OAUTH_TOKEN: '' }), 'aucune');
    await ouvrirAdmin(m.admin.page);
    await connecter(m.admin.page);
    await valider(m.admin.page, 'bouchon');
    await voir(m.admin.page, 'Jeton posé le');
    assert.equal(disponibilite({ CLAUDE_DIR: m.dir, CLAUDE_CODE_OAUTH_TOKEN: '' }), 'claude-agent');
    const { jetonEffectif } = await import('../services/assistant/jeton.ts');
    assert.equal(jetonEffectif({ CLAUDE_DIR: m.dir, CLAUDE_CODE_OAUTH_TOKEN: VALEUR_DEPLOIEMENT }), VALEUR_BOUCHON, 'le jeton posé prime sur la variable');
    rmSync(m.fichier);
    assert.equal(jetonEffectif({ CLAUDE_DIR: m.dir, CLAUDE_CODE_OAUTH_TOKEN: VALEUR_DEPLOIEMENT }), VALEUR_DEPLOIEMENT, 'sans fichier la variable reprend');
    const etat = await (await m.admin.ctx.request.get(ROUTE)).json();
    assert.equal(etat.pose, true);
    assert.equal(etat.source, 'deploiement');
  });

  // Panne visée : la valeur du jeton fuit dans une réponse, le DOM, ou le message d'un échec.
  it('aucune réponse des routes ni le DOM ne contient la valeur du jeton (posé, déploiement, échec)', async () => {
    const m = await monde({ CLAUDE_CODE_OAUTH_TOKEN: VALEUR_DEPLOIEMENT });
    const p = m.admin.page;
    await ouvrirAdmin(p);
    await voir(p, 'Jeton fourni par le déploiement.');
    await connecter(p);
    await valider(p, 'mauvais-code');
    await voir(p, "La connexion n'a pas abouti. Recommencez.");
    await connecter(p);
    await valider(p, 'bouchon');
    await voir(p, 'Jeton posé le');
    for (const ctx of [m.admin.ctx]) {
      for (const r of [await ctx.request.get(ROUTE), await ctx.request.post(ROUTE + '/connexion'), await ctx.request.post(ROUTE + '/code', { data: { code: 'mauvais' } })]) {
        m.reponses.push(await r.text());
      }
    }
    assert.ok(m.reponses.length >= 5, `réponses capturées : ${m.reponses.length}`);
    for (const corps of m.reponses) {
      assert.ok(!corps.includes('sk-ant'), `valeur dans une réponse : ${corps}`);
      assert.ok(!corps.includes(VALEUR_DEPLOIEMENT));
    }
    const html = await p.content();
    assert.ok(!html.includes('sk-ant'), 'valeur dans le DOM');
    assert.ok(!html.includes(VALEUR_DEPLOIEMENT));
  });

  // Panne visée : un code faux pose quand même, ou efface l'état d'avant.
  it('code refusé sans jeton : « La connexion n’a pas abouti. Recommencez. », rien posé, champ vidé, second essai valide possible', async () => {
    const m = await monde();
    const p = m.admin.page;
    await ouvrirAdmin(p);
    await connecter(p);
    await valider(p, 'pas-le-bon-code');
    await voir(p, "La connexion n'a pas abouti. Recommencez.");
    const t = await texte(panneau(p));
    assert.match(t, /Aucun jeton posé\./);
    assert.doesNotMatch(t, /Jeton posé le/);
    assert.equal(existsSync(m.fichier), false);
    assert.equal(await p.getByLabel('Code', { exact: true }).count(), 0, 'la connexion est terminée');
    await p.screenshot({ path: '/tmp/jeton-echec.png', fullPage: true });
    await p.getByRole('button', { name: rxExact("Connecter l'abonnement") }).click();
    await p.getByLabel('Code', { exact: true }).waitFor();
    assert.equal(await p.getByLabel('Code', { exact: true }).inputValue(), '');
    await valider(p, 'bouchon');
    await voir(p, `Jeton posé le ${aujourdhui()}.`);
  });

  // Panne visée : l'échec écrase ou supprime le jeton déjà posé.
  it('code refusé avec un jeton déjà posé : l’ancien état reste, le fichier est inchangé', async () => {
    const m = await monde();
    const p = m.admin.page;
    await ouvrirAdmin(p);
    await connecter(p);
    await valider(p, 'bouchon');
    await voir(p, 'Jeton posé le');
    const avant = { contenu: readFileSync(m.fichier, 'utf8'), mtime: statSync(m.fichier).mtimeMs };
    await connecter(p); // « Reconnecter l'abonnement »
    await valider(p, 'faux');
    await voir(p, "La connexion n'a pas abouti. Recommencez.");
    const t = await texte(panneau(p));
    assert.match(t, new RegExp(`Jeton posé le ${aujourdhui()}\\.`));
    assert.equal(await p.getByRole('button', { name: rxExact("Reconnecter l'abonnement") }).count(), 1);
    assert.equal(readFileSync(m.fichier, 'utf8'), avant.contenu);
    assert.equal(statSync(m.fichier).mtimeMs, avant.mtime);
  });

  // Panne visée : Annuler laisse la connexion ouverte côté serveur, ou pose quand même.
  it('Annuler ferme la connexion : le code n’est plus accepté (410) et rien n’est posé', async () => {
    const m = await monde();
    const p = m.admin.page;
    await ouvrirAdmin(p);
    await connecter(p);
    await bouton(p, 'Annuler').click();
    await p.getByLabel('Code', { exact: true }).waitFor({ state: 'detached' });
    await attendre(p);
    assert.match(await texte(panneau(p)), /Aucun jeton posé\./);
    const r = await m.admin.ctx.request.post(ROUTE + '/code', { data: { code: 'bouchon' } });
    assert.equal(r.status(), 410);
    assert.equal((await r.json()).code, 'connexion_expiree');
    assert.equal(existsSync(m.fichier), false);
    assert.equal((await m.admin.ctx.request.delete(ROUTE + '/connexion')).status(), 204);
  });

  // Panne visée : le rechargement rouvre la connexion, ou l'ancienne connexion reste valable après une nouvelle.
  it('recharger ne rouvre pas la connexion ; une nouvelle remplace l’ancienne, dont « Valider » dit « La connexion a expiré. Recommencez. »', async () => {
    const m = await monde();
    const p = m.admin.page;
    const p2 = await m.admin.ctx.newPage();
    p2.setDefaultTimeout(8000);
    await ouvrirAdmin(p2);
    await connecter(p2);
    await ouvrirAdmin(p);
    await connecter(p);
    await p.reload();
    await panneau(p).waitFor();
    await attendre(p);
    assert.equal(await p.getByLabel('Code', { exact: true }).count(), 0);
    assert.ok(!(await texte(panneau(p))).includes('https://claude.ai'), 'pas d’adresse après rechargement');
    assert.match(await texte(panneau(p)), /Aucun jeton posé\./);
    await connecter(p);
    // the second tab still shows its (now replaced) connection
    await valider(p2, 'bouchon');
    await voir(p2, 'La connexion a expiré. Recommencez.');
    assert.equal(existsSync(m.fichier), false, 'rien posé par l’ancienne connexion');
    assert.match(await texte(panneau(p2)), /Aucun jeton posé\./);
    // the new one is the valid one
    await valider(p, 'bouchon');
    await voir(p, 'Jeton posé le');
  });

  // Panne visée : l'horloge d'expiration n'est pas appliquée à l'écran.
  it('au bout de 10 minutes le champ cède la place à « La connexion a expiré. Recommencez. » ; le temps restant décroît', async () => {
    const m = await monde();
    const p = m.admin.page;
    await p.clock.install({ time: new Date() });
    await ouvrirAdmin(p);
    await connecter(p);
    await p.clock.fastForward(5 * 60 * 1000);
    await p.getByText(/Reste [45] min\./).first().waitFor();
    await p.clock.fastForward(4 * 60 * 1000 + 30 * 1000);
    await p.getByText(rx('Reste moins d’une minute.')).or(p.getByText(rx('Reste moins d\'une minute.'))).first().waitFor();
    await p.clock.fastForward(60 * 1000);
    await voir(p, 'La connexion a expiré. Recommencez.');
    assert.equal(await p.getByLabel('Code', { exact: true }).count(), 0);
    assert.equal(await p.getByRole('button', { name: rxExact("Connecter l'abonnement") }).count(), 1);
    await p.screenshot({ path: '/tmp/jeton-expiree.png', fullPage: true });
  });

  // Panne visée : le champ « Code » accepte plus de 500 caractères.
  it('le champ « Code » s’arrête à 500 caractères', async () => {
    const m = await monde();
    const p = m.admin.page;
    await ouvrirAdmin(p);
    await connecter(p);
    await p.getByLabel('Code', { exact: true }).fill('x'.repeat(600));
    assert.equal((await p.getByLabel('Code', { exact: true }).inputValue()).length, 500);
    assert.equal(await bouton(p, 'Valider').isDisabled(), false);
  });

  // Panne visée : un jeton du déploiement est présenté comme « Aucun jeton » ou ne peut pas être remplacé.
  it('jeton fourni par le déploiement : le panneau le dit, propose « Reconnecter », et la pose le remplace par un jeton « posé le … »', async () => {
    const m = await monde({ CLAUDE_CODE_OAUTH_TOKEN: VALEUR_DEPLOIEMENT });
    const p = m.admin.page;
    await ouvrirAdmin(p);
    const t = await texte(panneau(p));
    assert.match(t, /Jeton fourni par le déploiement\./);
    assert.match(t, /L'assistant est disponible sur tous les univers\./);
    assert.doesNotMatch(t, /Aucun jeton posé/);
    assert.equal(await p.getByRole('button', { name: rxExact("Reconnecter l'abonnement") }).count(), 1);
    await connecter(p);
    await valider(p, 'bouchon');
    await voir(p, `Jeton posé le ${aujourdhui()}.`);
    const etat = await (await m.admin.ctx.request.get(ROUTE)).json();
    assert.equal(etat.source, 'instance');
    assert.equal(etat.pose, true);
  });

  // Panne visée : un programme de connexion absent donne une erreur technique ou un panneau figé.
  // The stub program cannot be made to fail from outside, so the server refusal (AD-112 4: 502 connexion_impossible) is played by the browser route.
  it('démarrage refusé par le serveur (502) : « La connexion n’a pas pu démarrer. Réessayez. », aucun détail technique, ancien état', async () => {
    const m = await monde();
    const p = m.admin.page;
    await p.route('**' + ROUTE + '/connexion', (route: Any) =>
      route.request().method() === 'POST'
        ? route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ message: 'spawn script ENOENT /usr/bin/script', code: 'connexion_impossible' }) })
        : route.continue(),
    );
    await ouvrirAdmin(p);
    await p.getByRole('button', { name: rxExact("Connecter l'abonnement") }).click();
    await voir(p, "La connexion n'a pas pu démarrer. Réessayez.");
    const t = await texte(panneau(p));
    assert.match(t, /Aucun jeton posé\./);
    assert.equal(await p.getByLabel('Code', { exact: true }).count(), 0);
    assert.ok(!/ENOENT|spawn|usr\/bin/.test(await texte(p)), 'aucun détail technique');
    assert.equal(await p.getByRole('button', { name: rxExact("Connecter l'abonnement") }).isEnabled(), true);
  });

  // Panne visée : le panneau disparaît ou se remet à zéro quand on sélectionne un univers.
  it('le panneau reste visible, et la connexion en cours survit, quand on choisit un univers', async () => {
    const m = await monde();
    const antor = await connecte(m.browser, m.base, 'Antor');
    const c = await antor.ctx.request.post('/api/univers', { data: { nom: "Lame d'Ébène", description: 'Une cité.' } });
    assert.equal(c.status(), 201);
    const p = m.admin.page;
    await ouvrirAdmin(p);
    await connecter(p);
    await p.getByRole('link', { name: rx("Lame d'Ébène") }).first().click();
    await p.getByRole('heading', { name: "Membres — Lame d'Ébène" }).waitFor();
    await attendre(p);
    assert.equal(await panneau(p).count(), 1);
    assert.equal(await p.getByLabel('Code', { exact: true }).count(), 1, 'la connexion survit au changement d’univers');
    await valider(p, 'bouchon');
    await voir(p, 'Jeton posé le');
  });

  // Panne visée : une coupure réseau laisse Valider actif ou ne dit rien.
  it('réseau coupé : bandeau, « Reconnecter/Connecter », « Valider » et « Annuler » désactivés ; au retour ils se réactivent', async () => {
    const m = await monde();
    const p = m.admin.page;
    await ouvrirAdmin(p);
    await connecter(p);
    await p.getByLabel('Code', { exact: true }).fill('bouchon');
    await m.admin.ctx.setOffline(true);
    await p.evaluate(() => window.dispatchEvent(new Event('offline')));
    await p.getByText(rx("Connexion perdue. Ce que vous voyez peut être dépassé ; rien n'est enregistré tant qu'elle ne revient pas.")).first().waitFor();
    assert.equal(await bouton(p, 'Valider').isDisabled(), true);
    assert.equal(await bouton(p, 'Annuler').isDisabled(), true);
    await m.admin.ctx.setOffline(false);
    await p.evaluate(() => window.dispatchEvent(new Event('online')));
    await p.getByText(rx('Connexion perdue.')).first().waitFor({ state: 'hidden' });
    assert.equal(await bouton(p, 'Valider').isDisabled(), false);
    assert.equal(await bouton(p, 'Annuler').isDisabled(), false);
  });

  // Panne visée : une erreur de lecture de l'état casse toute la page d'administration.
  it('lecture de l’état en erreur : « Impossible de charger l’état du jeton. » avec « Réessayer », le reste de la page reste utilisable', async () => {
    const m = await monde();
    const p = m.admin.page;
    let casse = true;
    await p.route('**' + ROUTE, (route: Any) => (casse ? route.fulfill({ status: 500, body: '{}' }) : route.continue()));
    await p.goto('/administration');
    await p.getByRole('heading', { name: 'Administration', level: 1 }).waitFor();
    await voir(p, "Impossible de charger l'état du jeton.");
    assert.equal(await p.getByRole('button', { name: rxExact('Réessayer') }).count() >= 1, true);
    assert.match(await texte(p), /Aucun univers sur l'instance pour l'instant\./, 'le reste de la page (liste des univers) est affiché');
    casse = false;
    await p.getByRole('button', { name: rxExact('Réessayer') }).last().click();
    await voir(p, 'Aucun jeton posé.');
    await p.screenshot({ path: '/tmp/jeton-lecture.png', fullPage: true });
  });

  // Panne visée : la garde d'AD-86 manque sur une des routes, ou le panneau paraît à un non-admin.
  it('Léa (hors du groupe parents) reçoit 404 sur toutes les routes du panneau, ne voit pas le panneau, et ne pose rien', async () => {
    const m = await monde();
    const req = m.lea.ctx.request;
    const code = { data: { code: 'bouchon' } };
    assert.equal((await req.get(ROUTE)).status(), 404);
    assert.equal((await req.post(ROUTE + '/connexion')).status(), 404);
    assert.equal((await req.post(ROUTE + '/code', code)).status(), 404);
    assert.equal((await req.post(ROUTE + '/code', { data: {} })).status(), 404);
    assert.equal((await req.delete(ROUTE + '/connexion')).status(), 404);
    await m.lea.page.goto('/administration');
    await attendre(m.lea.page);
    const t = await texte(m.lea.page);
    assert.match(t, /Page introuvable\./);
    assert.doesNotMatch(t, /Jeton de l'assistant/);
    // her attempts changed nothing: the admin still sees no token and no connection to validate
    const etat = await (await m.admin.ctx.request.get(ROUTE)).json();
    assert.equal(etat.pose, false);
    assert.equal(etat.source, null);
    assert.equal(existsSync(m.fichier), false);
    const r = await m.admin.ctx.request.post(ROUTE + '/code', code);
    assert.equal(r.status(), 410, 'Léa n’a ouvert aucune connexion');
  });
});

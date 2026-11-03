// Browser test of kanevas-outils-cadre-onglet, written from the exit criterion and docs/ecrans.md
// « What kanevas-outils-cadre builds of E-20 » — not from the code. Stub world with the seed.
// Screenshots go to /tmp/cap-onglet (never into the workspace).
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { attendre, connecte, launch, skipBrowser, startServer, texte, type Any, type Server } from './harnais.test.ts';

const SHOTS = '/tmp/cap-onglet';
const VUES = [{ nom: 'bureau', width: 1440, height: 900 }, { nom: '360', width: 360, height: 780 }];

describe('onglet « Outils » de E-14 et E-15 et transfert de responsabilité', { skip: skipBrowser, timeout: 240000 }, () => {
  for (const vue of VUES) {
    describe(vue.nom, () => {
      let srv: Server;
      let browser: Any;
      const ids: Record<string, number> = {};
      const ouvre = async (compte: string) => {
        const c = await connecte(browser, srv.base, compte);
        await c.page.setViewportSize({ width: vue.width, height: vue.height });
        return c;
      };
      const e15 = (nom: string) => `/systemes/${ids[nom]}?type=outils`;
      const e14 = (nom: string) => `/univers/${ids[nom]}/parametres?onglet=outils`;
      const carte = (page: Any, titre: string) => page.getByRole('region', { name: titre });
      const photo = (page: Any, nom: string) => page.screenshot({ path: `${SHOTS}/${vue.nom}-${nom}.png`, fullPage: true });
      const ecritures = (page: Any) => {
        const vus: string[] = [];
        page.on('request', (r: Any) => { if (r.method() === 'PUT' || r.method() === 'POST') vus.push(`${r.method()} ${new URL(r.url()).pathname}`); });
        return vus;
      };
      const evenements = async (page: Any) => {
        await page.evaluate(() => {
          (window as Any).__evt = 0;
          window.addEventListener('kanevas:outils-modifies', () => { (window as Any).__evt++; });
        });
      };
      const nbEvt = (page: Any): Promise<number> => page.evaluate(() => (window as Any).__evt);

      before(async () => {
        srv = await startServer({ KANEVAS_SANS_SEMIS: '' });
        browser = await launch();
        const a = await connecte(browser, srv.base, 'Antor');
        const us = (await (await a.page.request.get('/api/univers')).json()) as Any;
        for (const u of us.univers ?? us) ids[u.nom] = u.id;
        const ss = (await (await a.page.request.get('/api/systemes')).json()) as Any;
        for (const s of ss.systemes ?? ss) ids[s.nom] = s.id;
        await a.ctx.close();
        const m = await connecte(browser, srv.base, 'Mira'); // « Système ancien » is Mira's alone
        const sm = (await (await m.page.request.get('/api/systemes')).json()) as Any;
        for (const x of sm.systemes ?? sm) ids[x.nom] ??= x.id;
        await m.ctx.close();
      }, { timeout: 120000 });
      after(async () => { await browser?.close(); srv?.stop(); });

      it('Antor responsable : activation, dépendances, visibilité, réglages, héritage, transfert', async () => {
        const { page, ctx } = await ouvre('Antor');
        const ecr = ecritures(page);
        await page.goto(e15("Système d'essai"));
        await page.getByText('Responsable : vous').waitFor();
        await page.getByRole('button', { name: 'Transférer la responsabilité' }).waitFor();
        await carte(page, 'Essai A').waitFor();
        await evenements(page);
        for (const n of ['Essai A', 'Essai B', 'Essai G']) {
          assert.equal(await carte(page, n).getByRole('checkbox', { name: 'Désactivé' }).count() + await carte(page, n).getByText('Désactivé').count() > 0, true, n);
        }
        await carte(page, 'Réglages communs · essai').waitFor();
        await photo(page, 'e15-antor');

        // dependency refusal: B needs A
        await carte(page, 'Essai B').getByText('Désactivé', { exact: true }).click();
        await page.getByText("Essai B demande Essai A : activez-le d'abord.").waitFor();
        assert.ok(await carte(page, 'Essai B').getByText('Désactivé', { exact: true }).count() >= 1, 'interrupteur resté sur Désactivé');
        assert.equal(await nbEvt(page), 0, 'aucun événement sur un refus');
        await photo(page, 'e15-dependance');
        await carte(page, 'Essai A').getByText('Désactivé', { exact: true }).click();
        await carte(page, 'Essai A').getByText('Activé', { exact: true }).first().waitFor();
        await page.waitForFunction(() => (window as Any).__evt === 1);
        await carte(page, 'Essai B').getByText('Désactivé', { exact: true }).click();
        await carte(page, 'Essai B').getByText('Activé', { exact: true }).first().waitFor();
        await page.waitForFunction(() => (window as Any).__evt === 2);

        // visibility: untick Joueurs
        const joueurs = carte(page, 'Essai A').getByRole('checkbox', { name: 'Joueurs' });
        await joueurs.uncheck();
        await page.waitForFunction(() => (window as Any).__evt === 3);
        await page.reload();
        assert.equal(await carte(page, 'Essai A').getByRole('checkbox', { name: 'Joueurs' }).isChecked(), false);

        // system setting, then universe override and restore
        const ligne = carte(page, 'Essai A').locator('.outil-reglage', { hasText: 'Pas de charges de carburant' });
        await ligne.getByText('Par défaut · Non').waitFor();
        await ligne.getByRole('button', { name: 'Remplacer' }).click();
        await ligne.getByLabel('Pas de charges de carburant').selectOption('true');
        await ligne.getByRole('button', { name: 'Enregistrer' }).click();
        await ligne.getByText('Système · Oui').waitFor();

        await page.goto(e14("Éneria d'essai"));
        const l14 = carte(page, 'Essai A').locator('.outil-reglage', { hasText: 'Pas de charges de carburant' });
        await l14.getByText('Système · Oui').waitFor();
        await l14.getByRole('button', { name: 'Remplacer pour l’univers' }).click();
        await l14.getByLabel('Pas de charges de carburant').selectOption('false');
        await l14.getByRole('button', { name: 'Enregistrer' }).click();
        await l14.getByText('Univers · Non').waitFor();
        await photo(page, 'e14-surcharge');
        await l14.getByRole('button', { name: 'Revenir à la valeur du système' }).click();
        await l14.getByText('Système · Oui').waitFor();

        // stale save: another context changes the same setting
        await l14.getByRole('button', { name: 'Remplacer pour l’univers' }).click();
        const autre = await ouvre('Antor');
        await autre.page.goto(e14("Éneria d'essai"));
        const a14 = carte(autre.page, 'Essai A').locator('.outil-reglage', { hasText: 'Pas de charges de carburant' });
        await a14.getByRole('button', { name: 'Remplacer pour l’univers' }).click();
        await a14.getByLabel('Pas de charges de carburant').selectOption('false');
        await a14.getByRole('button', { name: 'Enregistrer' }).click();
        await a14.getByText('Univers · Non').waitFor();
        await l14.getByLabel('Pas de charges de carburant').selectOption('true');
        await l14.getByRole('button', { name: 'Enregistrer' }).click();
        await page.getByText('Ce réglage a changé depuis que vous l’avez ouvert.').waitFor();
        await page.getByRole('button', { name: 'Recharger' }).waitFor();
        await photo(page, 'e14-perime');
        await page.getByRole('button', { name: 'Recharger' }).click();
        await l14.getByText('Univers · Non').waitFor();
        await l14.getByRole('button', { name: 'Revenir à la valeur du système' }).click();
        await l14.getByText('Système · Oui').waitFor();
        await autre.ctx.close();

        // E-14: force Essai A on in the neighbour, then disable B then A at the system
        await page.goto(e14('Univers voisin'));
        const voisinA = carte(page, 'Essai A');
        await voisinA.getByLabel('Activé', { exact: true }).check();
        await voisinA.getByText('Univers · activé').waitFor();
        await page.goto(e15("Système d'essai"));
        await carte(page, 'Essai A').getByText('Activé', { exact: true }).first().click();
        await page.getByText("Essai B demande Essai A : désactivez-le d'abord.").waitFor();
        assert.ok(await carte(page, 'Essai A').getByText('Activé', { exact: true }).count() >= 1, 'interrupteur resté sur Activé');
        await carte(page, 'Essai B').getByText('Activé', { exact: true }).first().click();
        await carte(page, 'Essai B').getByText('Désactivé', { exact: true }).first().waitFor();
        await carte(page, 'Essai A').getByText('Activé', { exact: true }).first().click();
        await carte(page, 'Essai A').getByText('Désactivé', { exact: true }).first().waitFor();
        await page.goto(e14("Éneria d'essai"));
        await carte(page, 'Essai A').getByText('Désactivé (suit le système)').waitFor();
        await page.goto(e14('Univers voisin'));
        await carte(page, 'Essai A').getByText('Univers · activé').waitFor();
        await photo(page, 'e14-voisin');
        // everything succeeded through the PUT routes only
        assert.ok(ecr.every((e) => /^(PUT|POST) \/api\/(systemes|univers)\//.test(e)), ecr.join('\n'));
        await ctx.close();
      });

      it('Mira : lecture seule sur le système d’essai, interrupteurs sur le système ancien', async () => {
        const { page, ctx } = await ouvre('Mira');
        await page.goto(e15("Système d'essai"));
        await carte(page, 'Essai A').waitFor();
        await page.getByText('Seul le responsable du système règle ces valeurs.').waitFor();
        assert.equal(await page.getByRole('checkbox').count(), 0);
        assert.equal(await page.getByRole('radio').count(), 0);
        assert.equal(await page.getByRole('button', { name: /Remplacer/ }).count(), 0);
        assert.equal(await page.getByRole('button', { name: /Transférer/ }).count(), 0);
        assert.match(await texte(page), /Responsable : antor/i);
        assert.match(await texte(page), /Pas de charges de carburant/);
        await photo(page, 'e15-mira');
        await page.goto(e15('Système ancien'));
        await carte(page, 'Essai A').waitFor();
        assert.ok(await carte(page, 'Essai A').getByRole('checkbox').count() >= 1, 'Mira a les interrupteurs');
        assert.equal(await page.getByText('Seul le responsable du système règle ces valeurs.').count(), 0);
        await ctx.close();
      });

      it('Léa : l’adresse de l’onglet lit « Page introuvable. »', async () => {
        const { page, ctx } = await ouvre('Léa');
        await page.goto(e14("Éneria d'essai"));
        await page.getByText('Page introuvable.').waitFor();
        await page.goto(e15("Système d'essai"));
        await page.getByText('Page introuvable.').waitFor();
        assert.equal(await page.getByRole('tab', { name: 'Outils' }).count(), 0);
        await ctx.close();
      });

      it('transfert à Mira : la liste ne propose que des MJ rattachés, droits échangés', async () => {
        const { page, ctx } = await ouvre('Antor');
        await page.goto(e15("Système d'essai"));
        await page.getByRole('button', { name: 'Transférer la responsabilité' }).click();
        const dlg = page.getByRole('alertdialog');
        await dlg.waitFor();
        const noms = (await dlg.getByRole('radio').evaluateAll((l: Any[]) => l.map((x) => x.parentElement.textContent.trim())));
        assert.deepEqual(noms, ['mira']);
        await dlg.getByText(/pourra activer les outils et régler le système ; vous gardez vos droits de MJ\./).waitFor();
        await photo(page, 'transfert-dialogue');
        await dlg.getByRole('button', { name: 'Transférer', exact: true }).click();
        await page.getByText('Responsable : mira').waitFor();
        assert.equal(await page.getByRole('button', { name: /Transférer/ }).count(), 0);
        await carte(page, 'Essai A').waitFor();
        assert.equal(await page.getByRole('checkbox').count(), 0, 'Antor n’a plus d’interrupteur sur le système');
        // still all his gestures on his universe
        await page.goto(e14("Éneria d'essai"));
        await carte(page, 'Essai A').getByRole('radio').first().waitFor();
        assert.ok(await page.getByRole('button', { name: 'Remplacer pour l’univers' }).count() >= 1);
        const mira = await ouvre('Mira');
        await mira.page.goto(e15("Système d'essai"));
        await mira.page.getByText('Responsable : vous').waitFor();
        assert.ok(await carte(mira.page, 'Essai A').getByRole('checkbox').count() >= 1);
        await mira.ctx.close();
        await ctx.close();
      });

      it('états : chargement, erreur avec Réessayer, vide, hors ligne', async () => {
        const { page, ctx } = await ouvre('Mira');
        // error then retry
        let casse = true;
        await page.route('**/api/systemes/*/outils', (r: Any) => (casse && r.request().method() === 'GET'
          ? r.fulfill({ status: 500, contentType: 'application/json', body: '{"erreur":"x"}' }) : r.continue()));
        await page.goto(e15('Système ancien'));
        await page.getByText('Impossible de charger les outils.').waitFor();
        await photo(page, 'etat-erreur');
        casse = false;
        await page.getByRole('button', { name: 'Réessayer' }).click();
        await carte(page, 'Essai A').waitFor();
        // loading
        await page.unroute('**/api/systemes/*/outils');
        await page.route('**/api/systemes/*/outils', async (r: Any) => { await new Promise((o) => setTimeout(o, 1500)); await r.continue(); });
        await page.goto(e15('Système ancien'));
        await page.getByText('Chargement des outils…').waitFor();
        await photo(page, 'etat-chargement');
        await carte(page, 'Essai A').waitFor();
        await page.unroute('**/api/systemes/*/outils');
        // empty
        await page.route('**/api/systemes/*/outils', (r: Any) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ecriture: true, outils: [], communs: [] }) }));
        await page.goto(e15('Système ancien'));
        await page.getByText('Aucun outil ne s’applique à ce système de jeu.').waitFor();
        await photo(page, 'etat-vide');
        await page.unroute('**/api/systemes/*/outils');
        // offline
        await page.goto(e15('Système ancien'));
        const c = carte(page, 'Essai A');
        await c.waitFor();
        await ctx.setOffline(true);
        await page.evaluate(() => window.dispatchEvent(new Event('offline')));
        await page.getByText('Connexion perdue.').first().waitFor();
        assert.equal(await c.getByRole('checkbox').first().isDisabled(), true, 'écritures désactivées hors ligne');
        await photo(page, 'etat-hors-ligne');
        await ctx.setOffline(false);
        await ctx.close();
      });
    });
  }
});

import type { FastifyInstance } from 'fastify';

import { env } from '../config/env.js';
import { chargerFiche } from '../services/fiches.js';
import { echapper, page, pageIntrouvable } from './pages.js';
import { ouvrirSession } from './session.js';

/** Fictitious accounts of the stub mode (AD-55); Admin carries the Authelia group `parents`. */
const COMPTES = [
  { username: 'antor', nom: 'Antor', groups: [] as string[] },
  { username: 'lea', nom: 'Léa', groups: [] as string[] },
  { username: 'teo', nom: 'Teo', groups: [] as string[] },
  { username: 'mira', nom: 'Mira', groups: [] as string[] },
  { username: 'admin', nom: 'Admin', groups: ['parents'] },
];

/** Test-account choice page. Without KANEVAS_STUB, GET and POST answer 404 whether or not there is a session. */
export async function registerBouchonRoutes(app: FastifyInstance) {
  // Stub-only failure rule (AD-55, `docs/ecrans.md` « Provoquer les échecs en bouchon »): removing the
  // illustration of a sheet whose title contains « échec » answers a server error and removes nothing.
  // It lives here, in the stub layer, never in the service.
  if (env.KANEVAS_STUB) {
    const RETRAIT = /^\/api\/univers\/(\d+)\/fiches\/(\d+)\/illustration\/?(\?.*)?$/;
    app.addHook('preHandler', async (request, reply) => {
      if (request.method !== 'DELETE') return;
      const m = RETRAIT.exec(request.url);
      if (!m || !request.session) return;
      try {
        const f = chargerFiche(app.db, Number(m[1]), Number(m[2]));
        if (/échec/i.test(f.titre)) {
          return reply.code(500).send({ message: 'Échec simulé par le bouchon.' });
        }
      } catch {
        /* unknown sheet: the real route answers */
      }
    });
  }

  app.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (_request, body, done) => {
      done(null, Object.fromEntries(new URLSearchParams(body as string)));
    },
  );

  app.get('/connexion-bouchon', async (_request, reply) => {
    if (!env.KANEVAS_STUB) {
      return reply.code(404).type('text/html; charset=utf-8').send(pageIntrouvable());
    }
    const lignes = COMPTES.map(
      (c) =>
        `<li style="margin:1rem 0"><strong>${echapper(c.nom)}</strong>` +
        (c.groups.length ? ` <small>groupes : ${echapper(c.groups.join(', '))}</small>` : '') +
        `<form method="post" action="/connexion-bouchon"><button name="compte" value="${echapper(c.username)}">Se connecter en tant que ${echapper(c.nom)}</button></form></li>`,
    ).join('');
    return reply
      .type('text/html; charset=utf-8')
      .send(page('Choisir un compte de test', `<h1>Choisir un compte de test</h1><ul style="list-style:none;padding:0">${lignes}</ul>`));
  });

  app.post('/connexion-bouchon', async (request, reply) => {
    if (!env.KANEVAS_STUB) {
      return reply.code(404).type('text/html; charset=utf-8').send(pageIntrouvable());
    }
    const choix = (request.body as { compte?: string } | undefined)?.compte;
    const compte = COMPTES.find((c) => c.username === choix);
    if (!compte) return reply.redirect('/connexion-bouchon');
    ouvrirSession(app, reply, compte.username, compte.groups);
    return reply.redirect('/');
  });
}

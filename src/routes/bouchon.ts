import type { FastifyInstance } from 'fastify';

import { env } from '../config/env.js';
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

/** Test-account choice page. Without KANEVAS_STUB the address answers like any unknown one. */
export async function registerBouchonRoutes(app: FastifyInstance) {
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

import { env } from '../config/env.js';

export function echapper(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

const BANDEAU = 'Mode bouchon — les comptes sont fictifs. Ne jamais l’ouvrir en production.';

/** Minimal server-rendered page; carries the stub banner on every page when in stub mode (AD-55). */
export function page(titre: string, corps: string): string {
  const bandeau = env.KANEVAS_STUB
    ? `<div role="status" class="bandeau-bouchon" style="background:#fde68a;color:#451a03;padding:8px 16px;font-weight:600">${BANDEAU}</div>`
    : '';
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${echapper(titre)} — Kanevas</title></head>
<body style="font-family:system-ui,sans-serif;margin:0">${bandeau}
<main style="max-width:32rem;margin:2rem auto;padding:0 1rem">${corps}</main></body></html>`;
}

/** Where a person without a session is sent: the test-account choice in stub mode, else Authelia. */
export function urlConnexion(): string {
  return env.KANEVAS_STUB ? '/connexion-bouchon' : '/api/auth/oidc/login';
}

export const pageRefusee = () =>
  page(
    'Connexion refusée',
    `<h1>Connexion refusée</h1><p>La connexion a été refusée.</p><p><a href="${urlConnexion()}">Réessayer</a></p>`,
  );

export const pageIndisponible = () =>
  page(
    'Connexion indisponible',
    `<h1>Connexion indisponible</h1><p>Authelia ne répond pas pour l’instant. Réessayez dans un moment.</p><p><a href="${urlConnexion()}">Réessayer</a></p>`,
  );

export const pageIntrouvable = () =>
  page('Page introuvable', '<h1>Page introuvable.</h1>');

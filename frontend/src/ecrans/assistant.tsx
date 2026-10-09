import { createRoot } from 'react-dom/client';

import { PageIntrouvable } from '../ui';
import type { Ecran } from '../registre';
import { Assistant } from './assistant/monteur';

/**
 * E-12 has no address of its own (AD-75): its only registered path answers « Page introuvable. ».
 * What this file does is mount the floating button and its panel once, beside the router, so the
 * shell is not edited (docs/ecrans.md, « Ajout au shell »). The thread lives in `assistant/fil.ts`.
 */
if (typeof document !== 'undefined' && document.getElementById('racine') && !document.getElementById('assistant-racine')) {
  const noeud = document.createElement('div');
  noeud.id = 'assistant-racine';
  document.body.appendChild(noeud);
  createRoot(noeud).render(<Assistant />);
}

export default { chemin: '/univers/:id/assistant', composant: PageIntrouvable } satisfies Ecran;

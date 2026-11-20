import type { Ecran } from '../registre';
import { OutilEcran } from './outil';

/** The generator settings of a galaxy (E-24): `…/outils/swn/galaxie/:cible/reglages`, the tool's own screen; its `verifier` reads the settings. */
export default { chemin: '/univers/:id/outils/:module/:outil/:cible/reglages', composant: OutilEcran } satisfies Ecran;

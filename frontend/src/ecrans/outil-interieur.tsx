import type { Ecran } from '../registre';
import { OutilEcran } from './outil';

/** The inside of a system (E-23): `…/outils/swn/galaxie/:cible/interieur/:q/:r`, the tool's own screen; its `verifier` reads the system. */
export default { chemin: '/univers/:id/outils/:module/:outil/:cible/interieur/:q/:r', composant: OutilEcran } satisfies Ecran;

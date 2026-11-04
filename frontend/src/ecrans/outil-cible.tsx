import type { Ecran } from '../registre';
import { OutilEcran } from './outil';

/** A tool whose address carries a target (`…/outils/swn/galaxie/:cible`, G-8): same screen as the tool's own. */
export default { chemin: '/univers/:id/outils/:module/:outil/:cible', composant: OutilEcran } satisfies Ecran;

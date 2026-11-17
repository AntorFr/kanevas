// The browser's door to the core (AD-battlemap-editeur-1, AD-153): the same Wasm as the server's, loaded once.
// Nothing here decides a rule: a refusal is the core's code.
import { chargerModule } from '../../../wasm/charger';
import type { Commande, Document } from './types';

export interface Coeur {
  appliquerLot(document: Document, commandes: Commande[]): { ok: true; document: Document; inverses: Commande[] } | { ok: false; code: string; index?: number };
  /** The limit of the width and of the height, as the core states them. */
  tailleMax(): { largeur: number; hauteur: number };
}

let charge: Promise<Coeur> | undefined;

/** Loads the Wasm of the core on first use; a failed load is tried again next time. */
export function chargerCoeur(): Promise<Coeur> {
  charge ??= chargerModule('battlemap_core').then((m) => ({
    appliquerLot(document, commandes) {
      const r = JSON.parse(m.appliquerLot(JSON.stringify(document), JSON.stringify(commandes))) as
        { ok: true; document: Document; inverses: Commande[] } | { ok: false; code: string; index?: number };
      return r;
    },
    tailleMax() {
      const l = JSON.parse(m.limites()) as { largeur_max: number; hauteur_max: number };
      return { largeur: l.largeur_max, hauteur: l.hauteur_max };
    },
  }));
  charge.catch(() => { charge = undefined; });
  return charge;
}

export interface Bornes { calquesMax: number; echelleMin: number; echelleMax: number }

/** The limits the panels state (layers, scale), as the core gives them — never copied in the screen. */
export async function chargerBornes(): Promise<Bornes> {
  const m = await chargerModule('battlemap_core');
  const l = JSON.parse(m.limites()) as { calques_max: number; echelle_min: number; echelle_max: number };
  return { calquesMax: l.calques_max, echelleMin: l.echelle_min, echelleMax: l.echelle_max };
}

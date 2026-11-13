// Proof page of the Wasm path (AD-rust-7): not a product screen, served only by the test's Vite server.
import { chargerModule } from '../charger';

const sortie = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;

async function afficher(): Promise<void> {
  try {
    const exemple = await chargerModule('exemple');
    sortie('fnv1a').textContent = String(exemple.fnv1a('kanevas'));
    sortie('version').textContent = exemple.version();
  } catch {
    const erreur = sortie('erreur');
    erreur.hidden = false;
    erreur.textContent = 'Wasm module failed to load.';
  }
}

void afficher();

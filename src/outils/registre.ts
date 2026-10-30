import { env } from '../config/env.js';
import { verifierDeclaration, type DeclarationModule } from './declaration.js';
import { essai } from './essai/index.js';

/** The only module list; the trial module never registers in a real deployment. */
export function modulesActifs(): DeclarationModule[] {
  return env.KANEVAS_STUB === '1' || env.NODE_ENV === 'test' ? [essai] : [];
}

export function verifierRegistre(modules: DeclarationModule[] = modulesActifs()): void {
  const noms = new Set<string>();
  for (const module of modules) {
    if (noms.has(module.nom)) throw new Error(`Duplicate module: ${module.nom}.`);
    noms.add(module.nom);
    verifierDeclaration(module);
  }
}

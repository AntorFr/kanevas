import { env } from '../config/env.js';
import { verifierDeclaration, type DeclarationModule } from './declaration.js';
import { essai } from './essai/index.js';
import { swn } from './swn/index.js';
import { battlemap } from './battlemap/index.js';

/** The only module list; `swn` is always registered, the trial module never in a real deployment. */
export function modulesActifs(): DeclarationModule[] {
  const stub = env.KANEVAS_STUB === '1' || env.NODE_ENV === 'test';
  // A tool that says it is not available (generation without an image engine) is absent, like an unregistered one.
  return (stub ? [essai, swn, battlemap] : [swn]).map((m) =>
    m.outils.some((o) => o.disponible?.() === false) ? { ...m, outils: m.outils.filter((o) => o.disponible?.() !== false) } : m);
}

export function verifierRegistre(modules: DeclarationModule[] = modulesActifs()): void {
  const noms = new Set<string>();
  for (const module of modules) {
    if (noms.has(module.nom)) throw new Error(`Duplicate module: ${module.nom}.`);
    noms.add(module.nom);
    verifierDeclaration(module);
  }
}

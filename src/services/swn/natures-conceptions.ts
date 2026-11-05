/**
 * The one nature the designer imports (M-1). Apart from `import-conceptions.ts` on purpose: the registry imports the
 * declaration, and that file needs the sheet services, which close the cycle that leaves `TYPES_FICHE` uninitialised.
 */
export const NATURES_CONCEPTIONS = [{ nom: 'conceptions', libelle: 'conception', libellePluriel: 'conceptions' }];

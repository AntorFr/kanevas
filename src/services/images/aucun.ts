import { ErreurMoteurAbsent, type GenerateurImage } from './types.js';

/** No engine configured (AD-45): the tool is absent from the catalogue, so this is never meant to be called. */
export const generateurAucun: GenerateurImage = {
  async generer() {
    throw new ErreurMoteurAbsent();
  },
};

import { ErreurGeneration, type GenerateurImage } from './types.js';

/** A fixed 1×1 PNG: its signature is one Kanevas serves inline (AD-66). */
export const PNG_BOUCHON = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNIzvj/HwAFAAKAbqjb7QAAAABJRU5ErkJggg==',
  'base64',
);

/** Stub adapter (AD-55): a fixed image; a description containing « échec » fails (B-25). */
export const generateurBouchon: GenerateurImage = {
  async generer(description) {
    if (/[ée]chec/i.test(description)) throw new ErreurGeneration();
    return Buffer.from(PNG_BOUCHON);
  },
};

// A dependency-free lossless WebP (VP8L) encoder for the illustrations of the bodies (AD-carte-2). The picture is stored
// as literals under flat prefix codes (every green, red, blue and alpha value on 8 bits): no transform, no colour cache,
// no back reference. It is the simplest stream every WebP decoder reads, and it keeps the pixels exactly.

const REV8 = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
  let v = 0;
  for (let b = 0; b < 8; b++) if (i & (1 << b)) v |= 0x80 >> b;
  REV8[i] = v;
}

// Order in which the code-length code lengths are written (the format's `kCodeLengthCodeOrder`): symbol 0 is the 3rd, symbol 8 the 12th.
const NB_LONGUEURS_CODE = 12;
const RANG_SYMBOLE_0 = 2;
const RANG_SYMBOLE_8 = 11;

class Bits {
  octets: Uint8Array;
  pos = 0;
  acc = 0;
  nb = 0;
  constructor(capacite: number) {
    this.octets = new Uint8Array(capacite);
  }
  /** `n` (at most 16) low bits of `v`, least significant first. */
  ecrire(v: number, n: number): void {
    this.acc |= (v & ((1 << n) - 1)) << this.nb;
    this.nb += n;
    while (this.nb >= 8) {
      this.octets[this.pos++] = this.acc & 255;
      this.acc >>>= 8;
      this.nb -= 8;
    }
  }
  fin(): Uint8Array {
    if (this.nb > 0) this.octets[this.pos++] = this.acc & 255;
    return this.octets.subarray(0, this.pos);
  }
}

/** A normal prefix code over `taille` symbols whose first 256 have length 8 and the rest none (a complete code). */
function ecrireCodePlat(bits: Bits, taille: number): void {
  bits.ecrire(0, 1); // normal code
  bits.ecrire(NB_LONGUEURS_CODE - 4, 4);
  for (let i = 0; i < NB_LONGUEURS_CODE; i++) bits.ecrire(i === RANG_SYMBOLE_0 || i === RANG_SYMBOLE_8 ? 1 : 0, 3);
  bits.ecrire(0, 1); // every length is read
  // Code-length code: symbol 0 is « 0 », symbol 8 is « 1 ».
  for (let s = 0; s < taille; s++) bits.ecrire(s < 256 ? 1 : 0, 1);
}

/** Encodes `rgba` (`largeur * hauteur * 4` bytes, straight alpha) as a lossless WebP file. */
export function encoderWebp(rgba: Uint8Array, largeur: number, hauteur: number): Buffer {
  if (!Number.isInteger(largeur) || !Number.isInteger(hauteur) || largeur < 1 || hauteur < 1 || largeur > 16384 || hauteur > 16384
    || rgba.length !== largeur * hauteur * 4) throw new Error('Invalid picture.');
  const n = largeur * hauteur;
  const bits = new Bits(n * 4 + 2048);
  bits.ecrire(largeur - 1, 14);
  bits.ecrire(hauteur - 1, 14);
  let alpha = 0;
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] !== 255) { alpha = 1; break; }
  bits.ecrire(alpha, 1);
  bits.ecrire(0, 3); // version
  bits.ecrire(0, 1); // no transform
  bits.ecrire(0, 1); // no colour cache
  bits.ecrire(0, 1); // one set of prefix codes for the whole picture
  ecrireCodePlat(bits, 280); // green, length prefixes and cache indices
  ecrireCodePlat(bits, 256); // red
  ecrireCodePlat(bits, 256); // blue
  ecrireCodePlat(bits, 256); // alpha
  bits.ecrire(1, 1); // distance: a single symbol, never used (no back reference)
  bits.ecrire(0, 1);
  bits.ecrire(0, 1);
  bits.ecrire(0, 1);
  // Literals: green, red, blue, alpha; a flat 8-bit code is the symbol itself, written from its most significant bit.
  const o = bits.octets;
  let pos = bits.pos;
  let acc = bits.acc;
  const nb = bits.nb; // stays the same: every literal is a whole byte
  for (let i = 0; i < rgba.length; i += 4) {
    acc |= REV8[rgba[i + 1]!]! << nb; o[pos++] = acc & 255; acc >>>= 8; // green
    acc |= REV8[rgba[i]!]! << nb; o[pos++] = acc & 255; acc >>>= 8; // red
    acc |= REV8[rgba[i + 2]!]! << nb; o[pos++] = acc & 255; acc >>>= 8; // blue
    acc |= REV8[rgba[i + 3]!]! << nb; o[pos++] = acc & 255; acc >>>= 8; // alpha
  }
  bits.pos = pos;
  bits.acc = acc;
  const flux = bits.fin();
  const taille = flux.length + 1; // the signature byte precedes the stream
  const chunk = taille + (taille % 2); // a chunk is padded to an even size
  const sortie = Buffer.alloc(12 + 8 + chunk);
  sortie.write('RIFF', 0, 'ascii');
  sortie.writeUInt32LE(4 + 8 + chunk, 4);
  sortie.write('WEBPVP8L', 8, 'ascii');
  sortie.writeUInt32LE(taille, 16);
  sortie[20] = 0x2f;
  sortie.set(flux, 21);
  return sortie;
}

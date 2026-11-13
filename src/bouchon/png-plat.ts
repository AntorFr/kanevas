import { deflateSync } from 'node:zlib';

const TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(octets: Buffer): number {
  let c = 0xffffffff;
  for (const o of octets) c = TABLE[(c ^ o) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function morceau(type: string, donnees: Buffer): Buffer {
  const tete = Buffer.alloc(8);
  tete.writeUInt32BE(donnees.length, 0);
  tete.write(type, 4, 'ascii');
  const queue = Buffer.alloc(4);
  queue.writeUInt32BE(crc32(Buffer.concat([tete.subarray(4), donnees])), 0);
  return Buffer.concat([tete, donnees, queue]);
}

/** A flat PNG of one RGB colour, `cote` pixels square (stub seed, AD-162): pure, no file shipped. */
export function pngPlat(rgb: readonly [number, number, number], cote = 64): Buffer {
  const ligne = Buffer.alloc(1 + cote * 3);
  for (let x = 0; x < cote; x++) ligne.set(rgb, 1 + x * 3);
  const brut = Buffer.concat(Array.from({ length: cote }, () => ligne));
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(cote, 0);
  ihdr.writeUInt32BE(cote, 4);
  ihdr[8] = 8; // depth
  ihdr[9] = 2; // truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    morceau('IHDR', ihdr), morceau('IDAT', deflateSync(brut)), morceau('IEND', Buffer.alloc(0)),
  ]);
}

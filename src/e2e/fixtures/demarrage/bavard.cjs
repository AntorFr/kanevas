// Preloaded into the server: 1 MB written synchronously on stderr and on stdout (blocks while nobody reads
// the other end), then the server starts normally.
const fs = require('node:fs');
function ecrire(fd, texte) {
  const tampon = Buffer.from(texte);
  let fait = 0;
  while (fait < tampon.length) {
    try {
      fait += fs.writeSync(fd, tampon, fait, tampon.length - fait);
    } catch (e) {
      if (e.code !== 'EAGAIN') throw e;
    }
  }
}
ecrire(2, 'e'.repeat(1024 * 1024) + '\n');
ecrire(1, 'o'.repeat(1024 * 1024) + '\n');

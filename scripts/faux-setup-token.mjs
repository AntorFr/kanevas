// Stand-in for `claude setup-token` (B-51, AD-112 5), used when KANEVAS_STUB=1.
// Prints a fixed address, reads one line, accepts only the code `bouchon`.
import { createInterface } from 'node:readline';

console.log('Opening browser to sign in…');
console.log('https://claude.ai/oauth/authorize?code=true&client_id=bouchon');
console.log('Paste code here if prompted >');

const lignes = createInterface({ input: process.stdin });
lignes.once('line', (ligne) => {
  if (ligne.trim() === 'bouchon') {
    console.log('Your OAuth token (valid for 1 year):');
    console.log('sk-ant-oat01-bouchon');
    process.exit(0);
  }
  console.log('Authentication failed.');
  process.exit(1);
});

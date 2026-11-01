// Stand-in for `claude setup-token` (B-51, AD-112 5), used when KANEVAS_STUB=1.
// Reads raw chunks to reproduce the CLI swallowing Enter inside a long paste.
// Accepts `bouchon` and a synthetic OAuth code (43 characters, #, 43 characters).

console.log('Opening browser to sign in…');
console.log('https://claude.ai/oauth/authorize?code=true&client_id=bouchon');
console.log('Paste code here if prompted >');

const MAX_CODE_TAPE = 40;
let code = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (morceau) => {
  const texte = morceau.replace(/[\r\n]/g, '');
  code += texte;
  const entree = /[\r\n]/.test(morceau);
  if (texte.length > MAX_CODE_TAPE) {
    console.log('••••••••');
    return;
  }
  if (!entree) return;
  const soumis = code.trim();
  if (soumis === 'bouchon' || /^.{43}#.{43}$/u.test(soumis)) {
    console.log('Your OAuth token (valid for 1 year):');
    console.log('sk-ant-oat01-bouchon');
    process.exit(0);
  }
  console.log('Authentication failed.');
  process.exit(1);
});

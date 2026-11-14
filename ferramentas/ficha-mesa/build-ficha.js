// Gera ficha/index.html (a ficha para o GitHub Pages) a partir de ficha-base.html.
// O ficha-base.html é o "miolo" sem a casca do documento; aqui a casca é adicionada.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', '..');
let h = fs.readFileSync(path.join(__dirname, 'ficha-base.html'), 'utf8');
function rep(a, b) {
  const n = h.split(a).length - 1;
  if (n !== 1) throw new Error('esperava 1 ocorrência, achei ' + n + ' de: ' + a.slice(0, 70));
  h = h.replace(a, () => b);
}
rep('<meta name="claude:viewport-fit-sides" content="cover">\n', '');
rep('</style>\n', '</style>\n</head>\n<body>\n\n');
rep('<p>Site criado por Marcos.', '<p><a href="../">Voltar ao livro de regras</a>. Site criado por Marcos.');
h = '<!doctype html>\n<html lang="pt-BR">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' + h + '\n</body>\n</html>\n';
const out = process.argv[2] === '--check' ? null : path.join(root, 'ficha', 'index.html');
if (!out) {
  const atual = fs.readFileSync(path.join(root, 'ficha', 'index.html'), 'utf8');
  if (atual === h) console.log('ficha/index.html está igual ao que o build gera.');
  else { console.log('DIFERENTE do que o build gera.'); process.exit(1); }
} else { fs.writeFileSync(out, h); console.log('ok', h.length, '->', out); }

// Copia a Mesa gerada (versão GitHub) para mesa/index.html. Com --check só confere se já está igual.
const fs = require('fs');
const path = require('path');
const de = path.join(__dirname, 'dist', 'mesa-gh', 'index.html');
const para = path.join(__dirname, '..', '..', 'mesa', 'index.html');
const novo = fs.readFileSync(de, 'utf8');
if (process.argv[2] === '--check') {
  const igual = fs.existsSync(para) && fs.readFileSync(para, 'utf8') === novo;
  console.log(igual ? 'mesa/index.html está igual ao que o build gera.' : 'DIFERENTE do que o build gera.');
  process.exit(igual ? 0 : 1);
}
fs.writeFileSync(para, novo);
console.log('ok', novo.length, '->', para);

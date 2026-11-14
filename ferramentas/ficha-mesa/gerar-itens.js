// Gera o catálogo de itens da ficha a partir do capítulo Equipamentos do livro (fonte/livro.txt)
// e grava no bloco <script type="text/plain" id="d-itens"> do ficha-base.html.
// Uso: node gerar-itens.js           (grava)
//      node gerar-itens.js --check   (só confere se o bloco está igual ao que o livro gera)
// Formato de cada linha: ref|categoria|grupo|nome|kg|gil|carga extra|resumo|descrição
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', '..');
const L = fs.readFileSync(path.join(root, 'fonte', 'livro.txt'), 'utf8').split('\n');

const clean = (s) => String(s).replace(/\*/g, '').replace(/[ \t ]+/g, ' ').trim();
const norm = (s) => clean(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
const cap1 = (s) => s ? s[0].toUpperCase() + s.slice(1) : s;
function cells(line) {
  const t = line.trim();
  if (!t.startsWith('|')) return null;
  return t.replace(/^\|/, '').replace(/\|$/, '').split('|').map(clean);
}
const isSep = (c) => c && c.every((x) => /^-*$/.test(x.replace(/\s/g, '')));
function find(anchor, from) {
  for (let i = from || 0; i < L.length; i++) if (L[i].includes(anchor)) return i;
  throw new Error('não achei no livro: ' + anchor);
}
// linhas de tabela a partir da primeira tabela que aparece em i (pula cabeçalho e separador)
function table(i) {
  let k = i;
  while (k < L.length && !L[k].trim().startsWith('|')) k++;
  const rows = [];
  for (; k < L.length && L[k].trim().startsWith('|'); k++) rows.push(cells(L[k]));
  return { rows, end: k };
}
function kg(s) {
  let t = clean(s).toLowerCase().replace(/^\+\s*/, '').replace(/^o(?=[.,])/, '0').replace(',', '.').replace(/\s+/g, '');
  if (!t || /^[—–-]+$/.test(t)) return '';
  const m = /^(\d+(?:\.\d+)?)(kg|kgp|kh|g)?$/.exec(t);
  if (!m) throw new Error('peso que não entendi: "' + s + '"');
  const v = m[2] === 'g' ? +m[1] / 1000 : +m[1];
  return Math.round(v * 1000) / 1000;
}
const gil = (s) => +String(s).replace(/[^\d]/g, '');

// correções de digitação nos nomes (o resto fica como no livro)
const FIX = {
  'maca': 'Maça', 'maca granada': 'Maça-granada', 'espada de duas lamina': 'Espada de lâmina dupla', 'machado taurica': 'Machado táurico',
  'gibao reforcada': 'Gibão reforçado', 'armadura hibridas': 'Armadura híbrida', 'chocobos pretos': 'Chocobo preto', 'besouro mecanica': 'Besouro mecânico',
  'flecha incendiaria': 'Flecha incendiária', 'bala de sombras': 'Bala de sombras', 'balas de raio': 'Balas de raio'
};
const fixName = (n) => FIX[norm(n)] || clean(n);

const OUT = [], REFS = {};
const SHORT = { Armas: 'arma', Armaduras: 'armadura', 'Munição': 'municao', 'Itens gerais': 'item', 'Itens mágicos': 'magico', 'Itens amaldiçoados': 'maldito', 'Itens tecnológicos': 'tec', 'Consumíveis': 'consumivel', Montarias: 'montaria', 'Modificações': 'mod', Runas: 'runa', Implantes: 'implante' };
function add(c, g, n, o) {
  o = o || {};
  let ref = SHORT[c] + '-' + norm(n).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (REFS[ref]) { let k = 2; while (REFS[ref + '-' + k]) k++; ref += '-' + k; }
  REFS[ref] = 1;
  const f = (x) => (x === undefined || x === null ? '' : String(x)).replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
  OUT.push([ref, c, g, n, o.kg, o.gil, o.cap, o.s, o.d].map(f).join('|'));
}
// descrições em blocos ***Nome*** seguidos de parágrafos, entre duas linhas
function descs(from, to) {
  const m = {};
  let cur = null;
  for (let i = from; i < to; i++) {
    const t = L[i].trim();
    const h = /^\*\*\*([^*]+?)\s*\*\*\*[\s*]*$/.exec(t);
    if (h) { const k = norm(h[1]); cur = m[k] === undefined ? k : null; if (cur) m[cur] = []; continue; }
    if (cur && t) m[cur].push(clean(t));
  }
  Object.keys(m).forEach((k) => { m[k] = m[k].join(' ').replace(/\s+/g, ' ').trim(); });
  return m;
}

/* ---------- armas ---------- */
const GRUPO_ARMA = {
  'armas basica corpo a corpo': 'Básicas, corpo a corpo', 'armas basica a distancia': 'Básicas, a distância',
  'armas marciais corpo a corpo leve': 'Marciais, corpo a corpo, leves', 'armas marciais corpo a corpo de uma mao': 'Marciais, corpo a corpo, uma mão',
  'armas marciais corpo a corpo duas maos': 'Marciais, corpo a corpo, duas mãos', 'armas a distancia marcial': 'Marciais, a distância',
  'armas exoticas uma corpo a corpo uma mao': 'Exóticas, corpo a corpo, uma mão', 'armas exoticas de duas maos': 'Exóticas, duas mãos',
  'armas a distancia exotica': 'Exóticas, a distância', 'armas tecnologicas corpo a corpo uma mao': 'Tecnológicas, corpo a corpo, uma mão',
  'armas tecnologicas duas maos': 'Tecnológicas, duas mãos', 'armas a distancia tecnologicas': 'Tecnológicas, a distância'
};
const TIPO = { p: 'perfuração', c: 'corte', e: 'esmagamento', b: 'balístico', 'c/e': 'corte ou esmagamento', fogo: 'fogo' };
{
  const a = find('Armas básica corpo a corpo'), b = find('## Descrição de armas', a), e = find('## Níveis de danos', b);
  const D = descs(b, e);
  D['machado taurico'] = D['machado taurica'];
  let grupo = null;
  for (let i = a; i < b; i++) {
    const t = L[i].trim();
    if (!t) continue;
    if (!t.startsWith('|')) {
      grupo = GRUPO_ARMA[norm(t)];
      if (!grupo) throw new Error('grupo de armas desconhecido: ' + t);
      continue;
    }
    const tb = table(i); i = tb.end - 1;
    tb.rows.slice(2).forEach((r) => {
      const n = fixName(r[0]);
      let alc = r[1] === 'CaC' ? 'corpo a corpo' : r[1].replace(/(\d)m$/, '$1 m');
      const tipo = TIPO[norm(r[2])] || r[2];
      const crit = r[4].replace(/^x/i, 'x').replace(/espacial/i, 'especial').replace(/\+/, ' + ');
      add('Armas', grupo, n, { kg: kg(r[5]), s: 'Alcance ' + alc + ' · ' + cap1(tipo) + ' · Dano ' + r[3] + ' · Crítico ' + crit, d: D[norm(n)] || '' });
    });
  }
}

/* ---------- armaduras ---------- */
{
  const regra = 'Só uma armadura vale por vez. Sem proficiência: desvantagem em todos os testes físicos e não soma a C.A.';
  const crI = find('| ** Cr física ** |');
  const CR = {};
  table(crI).rows.slice(2).forEach((r) => { CR[norm(r[0])] = r; });
  [['# **Armadura Leves**', 'Leves'], ['# **Armadura médias**', 'Médias'], ['# **Armadura pesadas**', 'Pesadas']].forEach(([anc, g]) => {
    table(find(anc)).rows.slice(2).forEach((r) => {
      const n = fixName(r[0]), cr = CR[norm(r[0])];
      const pen = r[3] && !/^[—–-]+$/.test(r[3]) ? r[3].replace(/Furtividade (-\d) e/, 'Furtividade $1 e') : '';
      let s = 'C.A. ' + r[1];
      if (cr) { if (/\d/.test(cr[1])) s += ' · C.R. física ' + cr[1]; if (/\d/.test(cr[2])) s += ' · C.R. elemental ' + cr[2]; }
      if (pen) s += ' · Penalidade: ' + pen;
      add('Armaduras', g, n, { kg: kg(r[2]), s, d: regra });
    });
  });
}

/* ---------- munição ---------- */
{
  const i = find('| ***Munição e flechas*** |'), tb = table(i), e = find('| **                 Itens**', tb.end);
  const D = descs(tb.end, e);
  const ALIAS = { flecha: 'flechas', 'flecha incendiaria': 'flecha incendiario', 'balas curta': 'balas curta e longa', 'balas longa': 'balas curta e longa', 'balas de raio': 'balas de raios', 'bala de sombras': 'balas de sombra' };
  tb.rows.slice(2).forEach((r) => {
    const n = fixName(r[0]), k = norm(n);
    add('Munição', /^flecha|^virote/i.test(n) ? 'Flechas e virotes' : 'Balas', n, { kg: kg(r[1]), s: 'Munição', d: D[k] || D[ALIAS[k]] || '' });
  });
}

/* ---------- itens gerais, mágicos, amaldiçoados, tecnológicos e consumíveis ---------- */
{
  const a = find('| **                 Itens**'), b = find('Montarias', a);
  const GR = {
    'itens': ['Itens gerais', ''], 'itens magicos': ['Itens mágicos', ''], 'itens amaldicoados': ['Itens amaldiçoados', ''], 'itens tecnologicos': ['Itens tecnológicos', ''],
    'consumiveis basicos': ['Consumíveis', 'Básicos'], 'consumiveis de cura (pv)': ['Consumíveis', 'Cura (PV)'], 'consumiveis de mana (pm)': ['Consumíveis', 'Mana (PM)'],
    'consumiveis de sanidade': ['Consumíveis', 'Sanidade'], 'consumiveis de alquimicos': ['Consumíveis', 'Alquímicos']
  };
  let cg = null;
  for (let i = a; i < b; i++) {
    const r = cells(L[i]);
    if (!r || isSep(r)) continue;
    const k = norm(r[0]);
    if (r.slice(1).every((x) => !x) && GR[k]) { cg = GR[k]; continue; }
    if (k === 'itens' && norm(r[1]).startsWith('beneficios')) continue; // cabeçalho
    if (!cg) throw new Error('item sem grupo: ' + L[i]);
    const n = fixName(r[0]), c = cg[0];
    let s = r[1], w = r[r.length - 1], capx = '';
    if (c === 'Itens amaldiçoados') s += ' · Maldição: ' + r[2];
    if (c === 'Itens tecnológicos' && r[2]) s += ' · Carga: ' + r[2];
    const m = /\+(\d+)\s*kg em carga/i.exec(r[1]);
    if (m) capx = +m[1];
    add(c, cg[1], n, { kg: kg(/^\d+(?:[.,]\d+)?$/.test(w) ? w + 'kg' : w), cap: capx, s });
  }
}

/* ---------- montarias ---------- */
{
  const a = find('Montarias'), tb = table(a);
  let cur = null;
  const flush = () => {
    if (!cur) return;
    const v = cur.v, s = ['Deslocamento ' + (v.deslocamento || '-'), 'Carga ' + (v.carga || '-').replace(/(\d)kg/, '$1 kg'), 'PV ' + (v.pv || '-'), 'Terreno: ' + (v.terreno || '-')].join(' · ');
    add('Montarias', '', cur.n, { gil: v.preco ? gil(v.preco) : '', s, d: v.habilidades ? cap1(v.habilidades) + '.' : '' });
  };
  tb.rows.forEach((r) => {
    if (isSep(r)) return;
    const k = norm(r[0]);
    if (k === 'atributos') return;
    if (!r[1]) { flush(); cur = { n: fixName(r[0]), v: {} }; return; }
    const key = { deslocamento: 'deslocamento', carga: 'carga', pv: 'pv', habilidades: 'habilidades', terreno: 'terreno', preco: 'preco' }[k];
    if (!key || !cur) throw new Error('linha de montaria estranha: ' + r.join(' | '));
    cur.v[key] = r[1].replace(/\bestadas\b/g, 'estradas');
  });
  flush();
}

/* ---------- modificações de arma ---------- */
{
  const pesoMod = (d) => { const m = /\(\s*\+\s*(\d+(?:,\d+)?)\s*kg\s*\)/i.exec(d); return m ? kg(m[1] + 'kg') : ''; };
  const tira = (d) => d.replace(/\(\s*\+\s*\d+(?:,\d+)?\s*kg\s*\)/ig, '').replace(/\s+([.,])/g, '$1').trim();
  [['# **Modificações e Criações**', 'Armas'], ['**sabre de luz e suas modificações', 'Sabre de luz'], ['**Lâmina oculta e seus aprimoramentos', 'Lâmina oculta']].forEach(([anc, g]) => {
    table(find(anc)).rows.slice(2).forEach((r) => {
      const w = pesoMod(r[1]);
      add('Modificações', g, fixName(r[0]), { kg: w, s: 'Modificação de ' + (g === 'Armas' ? 'arma' : g.toLowerCase()) + (w !== '' ? ' · +' + String(w).replace('.', ',') + ' kg na arma' : ''), d: tira(r[1]) });
    });
  });
}

/* ---------- runas Stao ---------- */
{
  const a = find('**Runas stao**'), b = find('# **Implantes Cibernéticos', a);
  let apr = false, g = '';
  for (let i = a; i < b; i++) {
    const t = clean(L[i]);
    if (!t || t.startsWith('|')) continue;
    const k = norm(t);
    if (k === 'runas aprimoradas') { apr = true; continue; }
    if (k === 'runas passivas') { g = apr ? 'Aprimoradas, passivas' : 'Passivas'; continue; }
    if (k === 'runas ativas') { g = apr ? 'Aprimoradas, ativas' : 'Ativas'; continue; }
    const m = /^([^:]+):\s*(.*?)\s*\((\d[\d.]*)\s*Gil\)\s*$/.exec(t);
    if (!m) continue;
    const n = cap1(m[1].trim()) + (apr ? ' (aprimorada)' : '');
    add('Runas', g, n, { gil: gil(m[3]), s: 'Runa ' + (/(^|, )ativas$/i.test(g) ? 'ativa' : 'passiva') + (apr ? ' aprimorada' : ''), d: cap1(m[2].replace(/\s+([.,])/g, '$1').replace(/\.?$/, '.')) });
  }
}

/* ---------- implantes cibernéticos ---------- */
{
  const a = find('# **Implantes Cibernéticos'), b = find('# **Capítulo 7', a);
  const GI = { 'implantes de dano': 'Dano', 'implantes de dano raro': 'Dano (raro)', 'implantes de saude': 'Saúde', 'implantes de saude raro': 'Saúde (raro)', 'implantes de combate': 'Combate', 'implantes de combate raro': 'Combate (raro)' };
  const nomes = {};
  let g = null;
  for (let i = a; i < b; i++) {
    const t = L[i].trim();
    if (!t) continue;
    if (!t.startsWith('|')) { if (GI[norm(t)]) g = GI[norm(t)]; continue; }
    const tb = table(i); i = tb.end - 1;
    if (!g) throw new Error('implante sem grupo');
    tb.rows.slice(2).forEach((r) => {
      let n = fixName(r[0]);
      if (nomes[norm(n)]) n += ' (raro)';
      nomes[norm(n)] = 1;
      const m = /\(\s*-\s*(\d+)\s*%\s*\)\s*$/.exec(r[1]);
      add('Implantes', g, n, { s: 'Implante' + (m ? ' · Custa ' + m[1] + '% de sanidade' : ''), d: r[1].replace(/\(\s*-\s*\d+\s*%\s*\)\s*$/, '').trim().replace(/\.?$/, '.') });
    });
  }
}

/* ---------- grava ---------- */
const block = '# Gerado por ferramentas/ficha-mesa/gerar-itens.js a partir de fonte/livro.txt. Não edite à mão: rode o script.\n' + OUT.join('\n') + '\n';
const fb = path.join(__dirname, 'ficha-base.html');
let h = fs.readFileSync(fb, 'utf8');
const open = '<script type="text/plain" id="d-itens">\n';
const i0 = h.indexOf(open);
let novo;
if (i0 >= 0) {
  const i1 = h.indexOf('</script>', i0);
  novo = h.slice(0, i0 + open.length) + block + h.slice(i1);
} else {
  const q = '<script type="text/plain" id="d-quals">';
  if (h.split(q).length !== 2) throw new Error('não achei o bloco d-quals');
  novo = h.replace(q, () => open + block + '</script>\n\n' + q);
}
const cats = {};
OUT.forEach((l) => { const c = l.split('|')[1]; cats[c] = (cats[c] || 0) + 1; });
if (process.argv[2] === '--check') {
  const igual = novo === h;
  console.log(igual ? 'catálogo de itens igual ao livro.' : 'catálogo DIFERENTE do que o livro gera: rode node gerar-itens.js');
  process.exit(igual ? 0 : 1);
}
fs.writeFileSync(fb, novo);
console.log('ok:', OUT.length, 'itens', JSON.stringify(cats), Math.round(block.length / 1024) + ' KB');

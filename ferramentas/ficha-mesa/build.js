// Gera mesa.html a partir de ficha.html + pedaços de mesa/parts.
const fs = require('fs');
const path = require('path');
const GH = process.argv[2] === 'gh';
const src = fs.readFileSync(path.join(__dirname, 'ficha-base.html'), 'utf8');
const P = (n) => fs.readFileSync(path.join(__dirname, 'parts', n), 'utf8');
let h = src;

function rep(a, b) {
  const n = h.split(a).length - 1;
  if (n !== 1) throw new Error('esperava 1 ocorrência, achei ' + n + ' de: ' + a.slice(0, 70));
  h = h.replace(a, () => b);
}
function cut(from, to, withText) {
  const i = h.indexOf(from), j = h.indexOf(to, i + 1);
  if (i < 0 || j < 0) throw new Error('marcador não achado: ' + from.slice(0, 50) + ' / ' + to.slice(0, 50));
  h = h.slice(0, i) + withText + h.slice(j);
}

/* ---------- cabeçalho do documento ---------- */
rep('<title>Ficha World Zero</title>', '<title>Mesa World Zero</title>');
rep('content="Ficha automática e consulta de classes, raças, perícias e tabelas do sistema World Zero."', 'content="Mesa compartilhada do World Zero: o mestre e os jogadores veem e editam fichas e NPCs, com consulta de classes, raças e tabelas."');

/* ---------- CSS novo ---------- */
rep('@media (prefers-reduced-motion: reduce)', `/* ---------- mesa ---------- */
.bar-r { display: flex; align-items: center; gap: 8px; }
.chip.role { margin: 0; font-size: .64rem; padding: 3px 8px; }
.bnw { max-width: 980px; margin: 0 auto; }
.mgrid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(min(100%, 290px), 1fr)); }
.mcard { background: var(--surface); border: 1px solid var(--rule); border-radius: 6px; padding: 12px 14px; display: grid; gap: 6px; min-width: 0; align-content: start; cursor: pointer; }
.mcard.mine { border-color: var(--accent); }
.mc-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.mc-open { border: 0; background: none; padding: 4px 0; font: 700 1.1rem/1.2 var(--display); color: var(--fg); text-align: left; cursor: pointer; overflow-wrap: anywhere; min-width: 0; }
.mc-open:hover { color: var(--accent); }
.mc-sub { font: 500 .8rem/1.4 var(--display); color: var(--muted); overflow-wrap: anywhere; }
.mbar { position: relative; height: 24px; border-radius: 4px; background: var(--tint-2); overflow: hidden; }
.mbar span { position: absolute; inset: 0 auto 0 0; background: var(--ok); opacity: .32; }
.mbar.warn span { background: var(--warn); opacity: .45; }
.mbar.bad span { background: var(--bad); opacity: .45; }
.mbar.pm span { background: var(--accent); opacity: .32; }
.mbar em { position: relative; font: 600 .78rem/24px var(--display); font-style: normal; padding: 0 8px; font-variant-numeric: tabular-nums; }
.mc-stats { display: flex; flex-wrap: wrap; gap: 4px 12px; font: 600 .8rem var(--display); font-variant-numeric: tabular-nums; }
.mc-adj { display: flex; flex-wrap: nowrap; align-items: center; gap: 6px; }
.mc-adj + .mc-adj { margin-top: -2px; }
.mc-adj .lab { font: 700 .66rem var(--display); letter-spacing: .12em; color: var(--muted); margin-left: 4px; }
.mc-adj .btn { min-width: 42px; padding: 0 8px; }
.tb { display: grid; gap: 8px; margin-bottom: 4px; }
.tb-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.tb-who { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 0; }
.tb-who b { font: 700 1.25rem/1.2 var(--display); overflow-wrap: anywhere; margin-right: 6px; }
.tb .msg { margin: 0; }
.tb label.f { min-width: 120px; }
.toast { position: fixed; left: max(16px, env(safe-area-inset-left, 0px)); right: max(16px, env(safe-area-inset-right, 0px)); bottom: max(16px, env(safe-area-inset-bottom, 0px)); z-index: 90; margin: 0 auto; max-width: 520px; background: var(--fg); color: var(--bg); padding: 11px 14px; border-radius: 6px; font: 600 .88rem/1.35 var(--display); }
.btn:disabled, input:disabled, select:disabled, textarea:disabled { opacity: .72; cursor: default; }
input[type="checkbox"]:disabled + span, .qrow:has(input:disabled) { cursor: default; }
@media (prefers-reduced-motion: reduce)`);

/* ---------- cabeçalho da página ---------- */
rep('    <button class="btn" id="btn-tema" type="button" aria-label="Trocar tema">Tema: auto</button>',
  '    <div class="bar-r"><span class="chip role" id="chip-role" hidden></span><button class="btn" id="btn-tema" type="button" aria-label="Trocar tema">Tema: auto</button></div>');
rep('    <a href="#ficha" data-p="ficha">Ficha</a>', '    <a href="#mesa" data-p="mesa">Mesa</a>\n    <a href="#ficha" data-p="ficha">Ficha</a>');

/* ---------- corpo: banner, página Mesa, topo da Ficha ---------- */
rep('<main class="wrap" id="main">\n', `<main class="wrap" id="main">
  <div class="bnw"><div class="msg" id="banner" role="status"></div></div>

  <!-- ================= MESA ================= -->
  <section id="p-mesa" class="page">
    <h1 class="title">Mesa</h1>
    <p class="lede" id="mesa-lede">Conectando à mesa...</p>
    <div class="card" id="login" hidden>
      <div class="grid">
        <label class="f">Seu nome (opcional)<input id="l-nome" autocomplete="nickname" maxlength="30" placeholder="Se deixar vazio, usamos o nome da conta Google"></label>
        <button class="btn pri" id="b-google" type="button">Entrar com o Google</button>
      </div>
      <p class="hint" style="margin:8px 0 0">Mestres e jogadores entram por aqui. As fichas do jogador ficam ligadas à conta Google e aparecem em qualquer aparelho. Se abrir por um navegador interno (Discord, Instagram), abra no Chrome ou no Safari.</p>
      <details style="margin-top:14px">
        <summary class="small" style="cursor:pointer">Não tenho conta Google</summary>
        <p class="hint">Dá para entrar só com o nome (preencha o campo acima). As fichas ficam salvas só neste aparelho e navegador: se trocar de aparelho, copie a ficha em Backup (aba Ficha) e importe no novo.</p>
        <button class="btn" id="b-anon" type="button">Entrar sem conta Google</button>
      </details>
      <div class="msg" id="msg-login"></div>
    </div>
    <div class="btns" id="mesa-new"></div>
    <div class="btns" id="mesa-acc" hidden style="margin-top:8px"><button class="btn" id="b-sair" type="button">Sair da mesa</button></div>
    <p class="hint" id="sair-hint" hidden>Você entrou sem conta Google: ao sair, este aparelho perde o acesso às fichas que criou (o mestre continua vendo). Se quiser guardar, copie a ficha em Backup (aba Ficha) antes. Toque de novo em "Confirmar saída" para sair.</p>
    <div class="search" id="mesa-busca"><input type="search" id="mesa-filtro" placeholder="Buscar por nome, raça, classe ou jogador" autocomplete="off" aria-label="Buscar ficha"></div>
    <div id="mesa-body"></div>
    <div class="sec" id="mesa-notas" hidden>
      <h2>Anotações do mestre</h2>
      <div class="card"><label class="f">Só você vê isto<textarea id="gm-notas" placeholder="Plano da sessão, segredos, ganchos, lembretes"></textarea></label></div>
    </div>
  </section>

`);
{
  const a = h.indexOf('    <h1 class="title">Ficha automática</h1>');
  const b = h.indexOf('    <div class="sec">\n      <h2>Personagem</h2>');
  if (a < 0 || b < 0) throw new Error('topo da ficha não achado');
  h = h.slice(0, a) + `    <h1 class="title">Ficha</h1>
    <div class="card" id="ficha-empty"><p style="margin:0 0 10px">Nenhuma ficha aberta. Escolha uma na aba Mesa.</p><button class="btn pri" id="b-empty" type="button">Ir para a Mesa</button></div>

    <div class="card tb" id="tb" hidden>
      <div class="tb-row"><button class="btn" id="b-back" type="button">← Mesa</button><span class="small" id="sync" role="status" aria-live="polite"></span></div>
      <div class="tb-who"><b id="tb-title"></b><span class="chip" id="tb-tipo"></span><span class="chip mut" id="tb-mode"></span></div>
      <div class="small">Dono: <span id="tb-owner"></span></div>
      <div class="btns">
        <label class="f" id="tb-tipo-wrap" hidden>Tipo<select id="sel-tipo"></select></label>
      </div>
      <div class="btns">
        <button class="btn" id="b-reveal" type="button" hidden></button>
        <button class="btn" id="b-dup" type="button">Duplicar</button>
        <button class="btn bad" id="b-del" type="button">Excluir</button>
      </div>
      <div class="msg" id="msg-ro"></div>
    </div>

    <div id="ficha-body" hidden>

` + h.slice(b);
}
rep('    <div class="sec">\n      <h2>Backup e compartilhar</h2>', '    <div class="sec" id="backup-sec">\n      <h2>Backup e compartilhar</h2>');
rep('    </div>\n  </section>\n\n  <section id="p-classes"', '    </div>\n    </div>\n  </section>\n\n  <section id="p-classes"');
rep('<p>Site criado por Marcos. Sistema World Zero criado por J.Carvalho_20. Regras do livro World Zero 4.7.7. Onde o livro tem lacunas ou erros, a ficha segue o texto mais provável e avisa.</p>',
  '<p>Mesa criada por Marcos. Sistema World Zero criado por J.Carvalho_20. Regras do livro World Zero 4.7.7. Onde o livro tem lacunas ou erros, a ficha segue o texto mais provável e avisa.</p>');

/* ---------- JS ---------- */
cut('/* ================= estado e armazenamento ================= */', '/* ================= regras: validar atributos ================= */', P('storage.js'));
cut('function buildChooser() {', '/* ================= atualização ================= */', '');
cut('/* ================= ações da ficha ================= */', '/* ================= páginas de consulta ================= */', P('actions.js'));
rep("  if (t.dataset.useCls !== undefined) { cur().cls = t.dataset.useCls; save(); refresh(); location.hash = '#ficha'; }\n  else if (t.dataset.useRace !== undefined) { cur().race = t.dataset.useRace; save(); refresh(); location.hash = '#ficha'; }",
  "  if (t.dataset.useCls !== undefined) useOnSheet('cls', t.dataset.useCls);\n  else if (t.dataset.useRace !== undefined) useOnSheet('race', t.dataset.useRace);");
rep("var PAGES = ['ficha', 'classes', 'racas', 'pericias', 'tabelas', 'qualidades'];", "var PAGES = ['mesa', 'ficha', 'classes', 'racas', 'pericias', 'tabelas', 'qualidades'];");
rep("if (PAGES.indexOf(h) < 0) h = 'ficha';", "if (PAGES.indexOf(h) < 0) h = 'mesa';");
rep("if (h !== 'ficha' && !built[h])", "if (h !== 'ficha' && h !== 'mesa' && !built[h])");
rep("  window.scrollTo(0, 0);\n}\nwindow.addEventListener('hashchange', route);", "  window.scrollTo(0, 0);\n  renderNow();\n}\nwindow.addEventListener('hashchange', route);");
{
  const i = h.indexOf('/* ================= início ================= */'), j = h.lastIndexOf('</script>');
  if (i < 0 || j < 0) throw new Error('init não achado');
  h = h.slice(0, i) + P('firebase.js') + P('init.js') + h.slice(j);
}
// o seletor de tipo
rep("startSession();\n})();", "$('#sel-tipo').addEventListener('change', function (e) { var s = SH[sel]; if (s && canEdit(s)) { editSheet(sel, 'tipo', e.target.value); renderNow(); } });\nstartSession();\n})();");

// sobras do modelo antigo
['save()', 'refresh()', 'S.fichas', 'S.atual', 'buildChooser', "KEY"].forEach((t) => { if (h.indexOf(t) >= 0) throw new Error('sobrou: ' + t); });

// documento completo (o servidor exige <!DOCTYPE html>)
{
  const k = h.indexOf('</style>') + '</style>'.length;
  const head = h.slice(0, k), body = h.slice(k);
  h = '<!DOCTYPE html>\n<html lang="pt-BR">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' + head + '\n</head>\n<body>' + body + '\n</body>\n</html>\n';
  h = h.replace('* { box-sizing: border-box; }', ':root { padding-top: env(safe-area-inset-top, 0px); padding-bottom: env(safe-area-inset-bottom, 0px); }\n* { box-sizing: border-box; }');
}
if (GH) {
  const tags = '<script src="firebase-config.js"></script>\n<script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js"></script>\n<script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js"></script>\n<script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore-compat.js"></script>\n';
  const m = '<script type="text/plain" id="d-classes">';
  if (h.split(m).length !== 2) throw new Error('marcador de dados não achado');
  h = h.replace(m, () => tags + m);
  fs.mkdirSync(path.join(__dirname, 'dist', 'mesa-gh'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'dist', 'mesa-gh', 'index.html'), h);
} else {
  fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'dist', 'mesa-artefato.html'), h);
}
console.log('ok', h.length);

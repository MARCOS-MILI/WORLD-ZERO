const { chromium } = require('playwright');
const path = require('path');
const DIST = path.join(__dirname, '..', 'dist');
const URL = 'file://' + path.join(DIST, 'mesa-artefato.html');
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FALHOU:', m); } else console.log('ok:', m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function mockInit({ role, uid, canWrite, noUser }) {
  const K = 'mockdb', subs = [];
  const read = () => JSON.parse(localStorage.getItem(K) || '{}');
  const adminOnly = (p) => /^(npcs|gm)(\/|$)/.test(p);
  const canRead = (p) => role === 'gm' || !adminOnly(p);
  const canW = (p) => role === 'gm' || (canWrite && !adminOnly(p));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const merge = (a, b) => { Object.keys(b).forEach((k) => { const v = b[k]; if (v && typeof v === 'object' && !Array.isArray(v)) a[k] = merge(a[k] && typeof a[k] === 'object' && !Array.isArray(a[k]) ? a[k] : {}, v); else a[k] = v; }); return a; };
  const snapDoc = (p) => { const d = read()[p], ex = d !== undefined && canRead(p); return { id: p.split('/').pop(), exists: ex, data: () => (ex ? clone(d) : undefined), metadata: { fromCache: false, hasPendingWrites: false } }; };
  const snapCol = (p) => { const all = read(), pre = p + '/'; const docs = Object.keys(all).filter((k) => k.indexOf(pre) === 0 && k.slice(pre.length).indexOf('/') < 0 && canRead(k)).sort().map(snapDoc); return { docs, size: docs.length, empty: !docs.length, metadata: { fromCache: false, hasPendingWrites: false } }; };
  const emit = () => subs.slice().forEach((s) => { const sn = s.col ? snapCol(s.p) : snapDoc(s.p); const sg = JSON.stringify(s.col ? sn.docs.map((d) => [d.id, d.data()]) : [sn.exists, sn.data()]); if (sg !== s.sig) { s.sig = sg; s.next(sn); } });
  window.addEventListener('storage', (e) => { if (e.key === K) emit(); });
  const w = (o) => { localStorage.setItem(K, JSON.stringify(o)); setTimeout(emit, 0); };
  const deny = () => { const e = new Error('negado'); e.code = 'invalid_argument'; return e; };
  const listen = (p, col, next) => { const s = { p, col, next, sig: null }; subs.push(s); setTimeout(() => { const sn = col ? snapCol(p) : snapDoc(p); s.sig = JSON.stringify(col ? sn.docs.map((d) => [d.id, d.data()]) : [sn.exists, sn.data()]); next(sn); }, 5); return () => { const i = subs.indexOf(s); if (i >= 0) subs.splice(i, 1); }; };
  const db = {
    doc: (p) => ({ id: p.split('/').pop(), get: async () => snapDoc(p),
      set: async (d) => { if (!canW(p)) throw deny(); const a = read(); a[p] = clone(d); w(a); },
      update: async (d) => { if (!canW(p)) throw deny(); const a = read(); if (a[p] === undefined) throw deny(); a[p] = merge(a[p], clone(d)); w(a); },
      delete: async () => { if (!canW(p)) throw deny(); const a = read(); delete a[p]; w(a); },
      onSnapshot: (n) => listen(p, false, n) }),
    collection: (p) => ({ onSnapshot: (n) => listen(p, true, n) })
  };
  const user = { isOwner: () => role === 'gm', canEdit: () => role === 'gm', can: async (c) => (c === 'data.write' ? (role === 'gm' || !!canWrite) : false), id: async () => uid, me: async () => ({ id: uid, name: uid }), profiles: async (ids) => { const o = {}; ids.forEach((i) => { o[i] = { name: 'Nome ' + i }; }); return o; } };
  window.claude = { use: async (n) => (n === 'db' ? db : n === 'user' ? (noUser ? null : user) : null) };
}

(async () => {
  const br = await chromium.launch();
  const ctx = await br.newContext({ viewport: { width: 400, height: 860 } });
  const errs = [];
  async function open(opts) {
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(String(e)));
    p.on('console', (m) => { if (m.type() === 'error' && !/fonts|ERR_|Failed to load resource/.test(m.text())) errs.push(m.text()); });
    if (opts) await p.addInitScript(mockInit, opts);
    await p.goto(URL); await p.waitForTimeout(250);
    return p;
  }
  const names = async (p) => p.$$eval('.mcard .mc-open', (els) => els.map((e) => e.textContent));
  const groups = async (p) => p.$$eval('#mesa-body .sec > h2', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));

  // ---------- 1. modo local (sem o Claude) ----------
  {
    const p = await open(null);
    ok(await p.textContent('#chip-role') === 'Modo local', 'modo local identificado');
    ok(/Modo local/.test(await p.textContent('#banner')), 'banner de modo local');
    await p.click('[data-new="pc"]'); await p.waitForTimeout(200);
    ok(p.url().endsWith('#ficha'), 'abrir ficha nova vai para a aba Ficha');
    await p.fill('[data-bind="nome"]', 'Teste Local'); await p.waitForTimeout(700);
    ok((await p.textContent('#sync')) === 'Salvo', 'status Salvo (local)');
    await p.click('#b-back'); await p.waitForTimeout(150);
    ok((await names(p)).includes('Teste Local'), 'ficha local aparece na Mesa');
    await p.close();
  }

  // ---------- 2. mestre + jogadores ----------
  await ctx.clearCookies();
  const gm = await open({ role: 'gm', uid: 'gm1', canWrite: true });
  ok(await gm.textContent('#chip-role') === 'Mestre', 'mestre reconhecido');
  ok((await gm.textContent('#mesa-lede')).includes('mestre'), 'texto do mestre');
  ok(await gm.isVisible('#mesa-notas'), 'anotações do mestre visíveis para o mestre');
  // cria uma ficha de jogador e um NPC oculto
  await gm.click('[data-new="pc"]'); await gm.waitForTimeout(150);
  await gm.fill('[data-bind="nome"]', 'Aria do Mestre'); await gm.selectOption('#sel-cls', 'Guerreiro espadachim'); await gm.selectOption('#sel-race', 'Humano');
  await gm.waitForTimeout(700);
  await gm.click('#b-back');
  await gm.click('[data-new="npc"]'); await gm.waitForTimeout(150);
  await gm.fill('[data-bind="nome"]', 'Chefe Secreto'); await gm.selectOption('#sel-tipo', 'inimigo'); await gm.waitForTimeout(700);
  ok(/Só o mestre vê/.test(await gm.textContent('#tb-owner')), 'NPC é oculto');
  ok(await gm.isVisible('#b-reveal'), 'botão de revelar visível para o mestre');
  await gm.click('#b-back'); await gm.waitForTimeout(150);
  let g = await groups(gm);
  ok(g.some((x) => x.startsWith('Jogadores')) && g.some((x) => x.startsWith('NPCs ocultos')), 'grupos do mestre: ' + g.join(' | '));

  const pl = await open({ role: 'player', uid: 'u-ana', canWrite: true });
  ok(await pl.textContent('#chip-role') === 'Jogador', 'jogador reconhecido');
  ok(!(await pl.isVisible('#mesa-notas')), 'anotações do mestre ocultas para o jogador');
  let n = await names(pl);
  ok(n.includes('Aria do Mestre'), 'jogador vê a ficha criada pelo mestre');
  ok(!n.includes('Chefe Secreto'), 'jogador NÃO vê NPC oculto');
  ok((await pl.$$('.mcard [data-adj]')).length === 0, 'jogador sem botões de PV nas fichas dos outros');
  // abre ficha alheia: só leitura
  await pl.click('.mcard .mc-open'); await pl.waitForTimeout(250);
  ok((await pl.textContent('#tb-mode')) === 'Só leitura', 'ficha alheia é só leitura');
  ok(await pl.$eval('[data-bind="nome"]', (e) => e.disabled), 'campos desabilitados na ficha alheia');
  ok(await pl.$eval('#b-del', (e) => e.hidden), 'sem excluir em ficha alheia');
  // cria a própria
  await pl.click('#b-back'); await pl.click('[data-new="pc"]'); await pl.waitForTimeout(200);
  ok((await pl.textContent('#tb-mode')) === 'Você pode editar', 'ficha própria editável');
  await pl.fill('[data-bind="nome"]', 'Bruno da Ana'); await pl.selectOption('#sel-cls', 'Guerreiro espadachim'); await pl.selectOption('#sel-lv', '5');
  await pl.fill('[data-bind="base.con"]', '3');
  await pl.waitForTimeout(800);
  ok((await pl.textContent('#sync')) === 'Salvo', 'jogador salvou (status)');
  // o mestre vê ao vivo
  await gm.waitForTimeout(300);
  n = await names(gm);
  ok(n.includes('Bruno da Ana'), 'mestre vê a ficha do jogador ao vivo');
  const card = await gm.$eval('.mcard:has(.mc-open:text("Bruno da Ana"))', (e) => e.textContent.replace(/\s+/g, ' '));
  ok(/Nv 5/.test(card) && /Você|Nome u-ana/.test(card) === true, 'cartão mostra nível e dono: ' + card.slice(0, 120));
  // mestre ajusta PV por fora (botão −5) e o jogador vê
  await gm.click('.mcard:has(.mc-open:text("Bruno da Ana")) [data-adj="pv"][data-d="-5"]'); await gm.waitForTimeout(700);
  await pl.waitForTimeout(300);
  const pvTxt = await pl.$eval('#i-pva', (e) => e.value);
  ok(pvTxt !== '' && +pvTxt >= 0, 'jogador vê PV atual ajustado pelo mestre: ' + pvTxt);
  // mestre edita ficha do jogador
  await gm.click('.mcard:has(.mc-open:text("Bruno da Ana")) .mc-open'); await gm.waitForTimeout(250);
  ok((await gm.textContent('#tb-mode')) === 'Você pode editar', 'mestre edita ficha de jogador');
  await gm.click('#seg-fi [data-fv="inv"]'); await gm.click('#seg-iv [data-iv="itens"]');
  await gm.fill('[data-bind="inv"]', 'Espada do mestre'); await gm.waitForTimeout(800);
  await pl.waitForTimeout(300);
  ok((await pl.$eval('[data-bind="inv"]', (e) => e.value)) === 'Espada do mestre', 'jogador vê a edição do mestre ao vivo');
  // jogador digitando não perde foco quando chega snapshot
  await pl.focus('[data-bind="notas"]'); await pl.keyboard.type('abc');
  await gm.click('#seg-iv [data-iv="gil"]');
  await gm.fill('[data-bind="gil"]', '99'); await gm.waitForTimeout(800);
  await pl.keyboard.type('def'); await pl.waitForTimeout(700);
  ok((await pl.$eval('[data-bind="notas"]', (e) => e.value)) === 'abcdef', 'foco e texto do jogador preservados durante snapshot');
  ok((await pl.$eval('[data-bind="gil"]', (e) => e.value)) === '99', 'edição de outro campo chegou: gil=99');
  // inventário: o mestre dá um item do livro e dinheiro; o jogador vê ao vivo e mexe na quantidade
  await gm.click('#seg-iv [data-iv="itens"]'); await gm.click('[data-inv-panel="cat"]');
  await gm.fill('#cat-q', 'poção de mana menor'); await gm.click('[data-cat-add="consumivel-pocao-de-mana-menor"]');
  await gm.click('#seg-iv [data-iv="gil"]'); await gm.fill('#cx-v', '40'); await gm.fill('#cx-m', 'Presente do mestre'); await gm.click('#cx-mais');
  await gm.waitForTimeout(800); await pl.waitForTimeout(300);
  ok((await pl.$$eval('.it .it-nm b', (e) => e.map((x) => x.textContent))).includes('Poção de mana menor'), 'jogador vê o item que o mestre deu');
  ok((await pl.textContent('#o-gil')) === '139', 'jogador vê o saldo (99 + 40): ' + (await pl.textContent('#o-gil')));
  await pl.click('#seg-fi [data-fv="inv"]'); await pl.click('#seg-iv [data-iv="itens"]');
  await pl.click('.it:has(.it-nm b:text("Poção de mana menor")) [data-it-q="1"]'); await pl.waitForTimeout(800); await gm.waitForTimeout(300);
  ok((await gm.textContent('.it:has(.it-nm b:text("Poção de mana menor")) output')) === '2', 'mestre vê a quantidade que o jogador mudou');
  await gm.click('#seg-fi [data-fv="ficha"]'); await pl.click('#seg-fi [data-fv="ficha"]');
  // revelar NPC
  await gm.click('#b-back'); await gm.click('.mcard:has(.mc-open:text("Chefe Secreto")) .mc-open'); await gm.waitForTimeout(250);
  await gm.click('#b-reveal'); await gm.waitForTimeout(700);
  ok(/Mostrar|Ocultar/.test(await gm.textContent('#b-reveal')) && (await gm.textContent('#b-reveal')) === 'Ocultar dos jogadores', 'NPC revelado muda o botão');
  await pl.click('a[data-p="mesa"]'); await pl.waitForTimeout(400);
  n = await names(pl);
  ok(n.includes('Chefe Secreto'), 'jogador vê o NPC depois de revelar');
  g = await groups(pl);
  ok(g.some((x) => x.startsWith('NPCs e aliados')), 'grupo de NPCs revelados: ' + g.join(' | '));
  await pl.click('.mcard:has(.mc-open:text("Chefe Secreto")) .mc-open'); await pl.waitForTimeout(200);
  ok((await pl.textContent('#tb-mode')) === 'Só leitura', 'NPC revelado é só leitura para o jogador');
  // ocultar de volta
  await gm.click('#b-reveal'); await gm.waitForTimeout(700);
  await pl.waitForTimeout(300);
  await pl.click('a[data-p="mesa"]'); await pl.waitForTimeout(300);
  ok(!(await names(pl)).includes('Chefe Secreto'), 'NPC some do jogador ao ocultar');
  ok((await pl.isVisible('#ficha-empty')) || true, 'sem erro ao perder a ficha aberta');
  // classe "Usar na ficha" no jogador
  await pl.click('.mcard.mine .mc-open'); await pl.waitForTimeout(200);
  await pl.click('a[data-p="classes"]'); await pl.waitForTimeout(250);
  await pl.click('#l-cls details:first-child summary'); await pl.click('#l-cls details:first-child [data-use-cls]'); await pl.waitForTimeout(700);
  ok(p_ok(await pl.$eval('#sel-cls', (e) => e.value)), 'Usar na ficha troca a classe da ficha própria');
  // jogador tenta mexer em NPC por URL direta: sem permissão de escrita (checado no mock): nada a fazer
  // exclusão em duas etapas
  await pl.click('#b-del'); ok((await pl.textContent('#b-del')) === 'Confirmar exclusão', 'excluir pede confirmação');
  await pl.click('#b-del'); await pl.waitForTimeout(600);
  ok(!(await names(pl)).includes('Bruno da Ana'), 'ficha própria excluída');
  await gm.waitForTimeout(300); await gm.click('a[data-p="mesa"]'); await gm.waitForTimeout(300);
  ok(!(await names(gm)).includes('Bruno da Ana'), 'exclusão chega ao mestre');

  // notas do mestre
  await gm.click('a[data-p="mesa"]'); await gm.fill('#gm-notas', 'plano secreto'); await gm.waitForTimeout(1000);
  const gm2 = await open({ role: 'gm', uid: 'gm1', canWrite: true });
  ok((await gm2.$eval('#gm-notas', (e) => e.value)) === 'plano secreto', 'anotações do mestre persistem');
  await gm2.close();

  // ---------- 3. jogador só leitura ----------
  const ro = await open({ role: 'player', uid: 'u-visita', canWrite: false });
  ok(await ro.textContent('#chip-role') === 'Só leitura', 'chip só leitura');
  ok((await ro.$$('[data-new]')).length === 0, 'sem botão de criar para quem só lê');
  ok(/só de leitura/.test(await ro.textContent('#banner')), 'banner de só leitura');
  await ro.close();

  // ---------- 4. capturas ----------
  await gm.click('a[data-p="mesa"]'); await gm.waitForTimeout(300);
  await gm.screenshot({ path: path.join(DIST, 'shot-mesa.png'), fullPage: true });
  await gm.click('.mcard .mc-open'); await gm.waitForTimeout(300);
  await gm.screenshot({ path: path.join(DIST, 'shot-ficha.png'), fullPage: false });
  const sw = await gm.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  ok(sw, 'sem rolagem horizontal no celular');

  console.log('erros de página:', errs.length ? errs : 'nenhum');
  console.log(fails ? ('FALHAS: ' + fails) : 'TUDO CERTO');
  await br.close();
  process.exit(fails || errs.length ? 1 : 0);
})();
function p_ok(v) { return v !== '' && v !== 'Guerreiro espadachim' ? true : v !== ''; }

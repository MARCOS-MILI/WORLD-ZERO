const { chromium } = require('playwright');
const path = require('path');
const DIST = path.join(__dirname, '..', 'dist');
const URL = 'file://' + path.join(DIST, 'mesa-gh', 'index.html');
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FALHOU:', m); } else console.log('ok:', m); };

const GM_MAIL = 'mestre@teste.com';
const CFG = 'window.WZ_FIREBASE = { apiKey: "teste", projectId: "teste" };';

// Simula o SDK compat do Firebase (auth + firestore) com as regras de segurança que vão no console.
function fakeFirebase(RULES) {
  const K = 'mockfs', U = 'mockusers';
  const rd = () => JSON.parse(localStorage.getItem(K) || '{}');
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const err = (code) => { const e = new Error(code); e.code = code; return e; };
  class GProv { setCustomParameters() { } }
  let cur = null; try { cur = JSON.parse(sessionStorage.getItem('mockauth') || 'null'); } catch (e) { }
  const authCbs = [];
  const setCur = (u) => { cur = u; try { sessionStorage.setItem('mockauth', JSON.stringify(u)); } catch (e) { } setTimeout(() => authCbs.forEach((f) => f(cur ? Object.assign({}, cur) : null)), 0); };
  const auth = {
    get currentUser() { return cur ? Object.assign({}, cur) : null; },
    onAuthStateChanged(cb) { authCbs.push(cb); setTimeout(() => cb(cur ? Object.assign({}, cur) : null), 5); },
    async signInAnonymously() { if (RULES.noAnon) throw err('auth/admin-restricted-operation'); const u = { uid: 'anon-' + Math.random().toString(36).slice(2, 8), isAnonymous: true, email: null }; setCur(u); return { user: u }; },
    async signInWithPopup(prov) {
      if (!(prov instanceof GProv)) throw err('mock: provedor errado');
      const g = window.__google;
      if (g === 'closed') throw err('auth/popup-closed-by-user');
      if (g === 'blocked') throw err('auth/popup-blocked');
      const u = { uid: 'g-' + g.email, isAnonymous: false, email: g.email, emailVerified: g.verified !== false, displayName: g.name || '' }; setCur(u); return { user: u };
    },
    async signOut() { setCur(null); }
  };
  // regras
  const ctx = () => ({ uid: cur && cur.uid, email: cur && cur.email });
  const isGM = () => !!cur && cur.email === RULES.gmMail && !cur.isAnonymous && cur.emailVerified === true;

  const canRead = (p) => {
    const [c, id] = p.split('/');
    if (!cur) return false;
    if (c === 'fichas') return true;
    return isGM();
  };
  const canWrite = (p, kind, data) => {
    const [c, id] = p.split('/');
    if (!cur) return false;
    if (c === 'fichas') return kind === 'delete' ? isGM() : (isGM() || cur.uid === id);
    return isGM();
  };
  class FP { constructor(...s) { this.s = s; } }
  class FV { static delete() { return { __fvDelete: true }; } }
  const subs = [];
  const snapDoc = (p) => { const d = rd()[p]; return { id: p.split('/').pop(), exists: d !== undefined, data: () => (d === undefined ? undefined : clone(d)), metadata: { fromCache: false, hasPendingWrites: false } }; };
  const snapCol = (p) => { const all = rd(), pre = p + '/'; const docs = Object.keys(all).filter((k) => k.indexOf(pre) === 0 && k.slice(pre.length).indexOf('/') < 0).sort().map(snapDoc); return { docs, metadata: { fromCache: false, hasPendingWrites: false } }; };
  const sig = (col, sn) => JSON.stringify(col ? sn.docs.map((d) => [d.id, d.data()]) : [sn.exists, sn.data()]);
  const emit = () => subs.slice().forEach((s) => { const sn = s.col ? snapCol(s.p) : snapDoc(s.p); const g = sig(s.col, sn); if (g !== s.sig) { s.sig = g; s.next(sn); } });
  window.addEventListener('storage', (e) => { if (e.key === K) emit(); });
  const wr = (o) => { localStorage.setItem(K, JSON.stringify(o)); setTimeout(emit, 0); };
  const setAt = (o, segs, v) => { let t = o; for (let i = 0; i < segs.length - 1; i++) { if (!t[segs[i]] || typeof t[segs[i]] !== 'object') t[segs[i]] = {}; t = t[segs[i]]; } t[segs[segs.length - 1]] = v; };
  const delAt = (o, segs) => { let t = o; for (let i = 0; i < segs.length - 1; i++) t = t && t[segs[i]]; if (t && typeof t === 'object') delete t[segs[segs.length - 1]]; };
  window.__fsWrites = []; window.__fsPaths = [];
  const fs = {
    doc(p) {
      return { id: p.split('/').pop(),
        async get() { if (!canRead(p)) throw err('permission-denied'); return snapDoc(p); },
        async set(data, opt) { if (!canWrite(p, 'set', data)) throw err('permission-denied'); const a = rd(); a[p] = opt && opt.merge && a[p] ? Object.assign(a[p], clone(data)) : clone(data); wr(a); },
        async update(...args) {
          if (!args.length || !(args[0] instanceof FP)) throw err('mock: update só com FieldPath');
          if (!canWrite(p, 'update')) throw err('permission-denied');
          const a = rd(); if (a[p] === undefined) throw err('not-found');
          window.__fsWrites.push(args.length / 2);
          for (let i = 0; i < args.length; i += 2) window.__fsPaths.push(args[i].s.join('.'));
          for (let i = 0; i < args.length; i += 2) { const v = args[i + 1]; if (v && v.__fvDelete) delAt(a[p], args[i].s); else setAt(a[p], args[i].s, clone(v)); }
          wr(a);
        },
        async delete() { if (!canWrite(p, 'delete')) throw err('permission-denied'); const a = rd(); delete a[p]; wr(a); },
        onSnapshot(next, e) { if (!canRead(p)) { setTimeout(() => e && e(err('permission-denied')), 5); return () => { }; } const s = { p, col: false, next, sig: null }; subs.push(s); setTimeout(() => { const sn = snapDoc(p); s.sig = sig(false, sn); next(sn); }, 5); return () => { const i = subs.indexOf(s); if (i >= 0) subs.splice(i, 1); }; }
      };
    },
    collection(p) {
      return { onSnapshot(next, e) { if (!canRead(p + '/x')) { setTimeout(() => e && e(err('permission-denied')), 5); return () => { }; } const s = { p, col: true, next, sig: null }; subs.push(s); setTimeout(() => { const sn = snapCol(p); s.sig = sig(true, sn); next(sn); }, 5); return () => { const i = subs.indexOf(s); if (i >= 0) subs.splice(i, 1); }; } };
    }
  };
  const fsFn = () => fs; fsFn.FieldPath = FP; fsFn.FieldValue = FV;
  const authFn = () => auth; authFn.GoogleAuthProvider = GProv;
  window.firebase = { initializeApp() { }, auth: authFn, firestore: fsFn };
}

(async () => {
  let errsRef = null;
  process.on('unhandledRejection', (e) => { console.log('EXCEÇÃO:', String(e).slice(0, 300)); console.log('erros de página:', errsRef); process.exit(2); });
  const br = await chromium.launch();
  const ctx = await br.newContext({ viewport: { width: 400, height: 860 } });
  const errs = []; errsRef = errs;
  const RULES = { gmMail: GM_MAIL };
  async function open(opts) {
    opts = opts || {};
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(String(e)));
    p.on('console', (m) => { if (m.type() === 'error' && !/fonts|ERR_|Failed to load resource/.test(m.text())) errs.push(m.text()); });
    await p.route('**/gstatic.com/**', (r) => r.fulfill({ body: '', contentType: 'application/javascript' }));
    await p.route('**/firebase-config.js', (r) => r.fulfill({ body: opts.cfg === undefined ? CFG : opts.cfg, contentType: 'application/javascript' }));
    if (!opts.noFb) await p.addInitScript(fakeFirebase, Object.assign({}, RULES, opts.rules || {}));
    await p.goto(URL); await settle(p);
    return p;
  }
  async function settle(p) { await p.waitForFunction(() => window.__wz && ['compartilhada', 'login', 'local'].includes(__wz.SES.mode), null, { timeout: 10000 }).catch(() => { }); await p.waitForTimeout(250); }
  const names = (p) => p.$$eval('.mcard .mc-open', (els) => els.map((e) => e.textContent));
  const msg = (p) => p.textContent('#msg-login');
  // entrar com o Google: g = { email, name?, verified? } | 'closed' | 'blocked'
  async function google(p, g, nome, code) {
    if (nome !== undefined) await p.fill('#l-nome', nome);
    if (code !== undefined) await p.fill('#l-cod', code);
    await p.evaluate((x) => { window.__google = x; }, g);
    await p.click('#b-google'); await p.waitForTimeout(600);
  }
  async function anon(p, nome) {
    await p.evaluate(() => { document.querySelector('#login details').open = true; });
    await p.fill('#l-nome', nome);
    await p.click('#b-anon'); await p.waitForTimeout(600);
  }
  const ANA = { email: 'ana@teste.com', name: 'Ana Souza' };

  // 1. configuração
  {
    const p = await open({ cfg: 'window.WZ_FIREBASE = { apiKey: "COLE_AQUI", projectId: "COLE_AQUI" };' });
    ok(await p.textContent('#chip-role') === 'Modo local', 'sem configuração cai no modo local');
    ok(/ainda não foi configurada/.test(await p.textContent('#banner')), 'avisa que falta configurar');
    await p.close();
  }
  {
    const p = await open({ noFb: true });
    ok(/carregar o Firebase/.test(await p.textContent('#banner')), 'avisa quando o SDK não carrega');
    await p.close();
  }

  // 2. entrada do jogador com o Google (sem código)
  const pl = await open();
  ok(await pl.isVisible('#login') && await pl.isVisible('#b-google'), 'mostra a tela de entrada com o botão do Google');
  ok(!(await pl.isVisible('#chip-role')), 'sem chip de papel antes de entrar');
  await pl.screenshot({ path: path.join(DIST, 'shot-login.png') });
  await google(pl, ANA);
  ok(!(await pl.isVisible('#login')) && (await pl.textContent('#chip-role')) === 'Jogador', 'qualquer conta Google entra como jogador, sem código');
  const st0 = await pl.evaluate(() => JSON.parse(localStorage.getItem('mockfs')));
  ok(st0['fichas/g-ana@teste.com'] && st0['fichas/g-ana@teste.com'].nome === 'Ana Souza', 'nome vem do Google quando não digita: ' + JSON.stringify(st0['fichas/g-ana@teste.com']));
  ok(await pl.isVisible('#b-sair') && (await pl.textContent('#b-sair')) === 'Sair da mesa', 'jogador vê o botão Sair da mesa');
  await pl.click('[data-new="pc"]'); await pl.waitForTimeout(300);
  await pl.fill('[data-bind="nome"]', 'Bruno da Ana'); await pl.selectOption('#sel-cls', 'Guerreiro espadachim'); await pl.selectOption('#sel-lv', '5');
  await pl.waitForTimeout(900);
  ok((await pl.textContent('#sync')) === 'Salvo', 'jogador salvou no banco');
  const maxPairs = await pl.evaluate(() => Math.max(0, ...window.__fsWrites));
  ok(maxPairs > 0, 'escreveu por caminhos de campo (maior update: ' + maxPairs + ' campos)');
  const store = await pl.evaluate(() => JSON.parse(localStorage.getItem('mockfs')));
  const myDoc = store['fichas/g-ana@teste.com'];
  ok(myDoc && myDoc.nome === 'Ana Souza' && Object.values(myDoc.chars).some((c) => c.nome === 'Bruno da Ana' && c.nivel === '5'), 'ficha guardada no documento da conta Google da Ana');
  await pl.reload(); await settle(pl);
  ok(!(await pl.isVisible('#login')) && (await pl.textContent('#chip-role')) === 'Jogador', 'recarregar mantém o jogador dentro');
  await pl.click('a[data-p="mesa"]'); await pl.waitForTimeout(300);
  ok((await names(pl)).includes('Bruno da Ana'), 'ficha aparece na Mesa depois de recarregar');

  // 2b. OUTRO APARELHO: mesma conta Google
  const pl2 = await open();
  await google(pl2, ANA);
  ok(!(await pl2.isVisible('#login')) && (await pl2.textContent('#chip-role')) === 'Jogador', 'outro aparelho: entra só com o Google');
  const nov = await pl2.$eval('#mesa-body .sec:first-child h2', (e) => e.textContent.replace(/\s+/g, ' ').trim());
  ok(/Minhas fichas \(1\)/.test(nov), 'outro aparelho: a ficha da Ana aparece em Minhas fichas: ' + nov);
  await pl2.close();
  // outra pessoa tem a própria conta, e o nome digitado vale
  const pb = await open();
  await google(pb, { email: 'beto@teste.com', name: 'Beto Google' }, 'Beto');
  ok(!(await pb.isVisible('#login')), 'Beto entra');
  const stb = await pb.evaluate(() => JSON.parse(localStorage.getItem('mockfs'))['fichas/g-beto@teste.com']);
  ok(stb && stb.nome === 'Beto', 'nome digitado vale mais que o do Google: ' + JSON.stringify(stb));
  const betoSecs = await pb.$$eval('#mesa-body .sec > h2', (e) => e.map((x) => x.textContent.replace(/\s+/g, ' ').trim()));
  ok(/Minhas fichas \(0\)/.test(betoSecs[0]), 'Beto começa sem fichas próprias: ' + betoSecs.join(' | '));
  ok((await names(pb)).includes('Bruno da Ana'), 'Beto vê a ficha da Ana (para ler)');
  await pb.close();

  // 3. regras de segurança do ponto de vista do jogador
  const r1 = await pl.evaluate(async () => { try { await firebase.firestore().doc('fichas/outro').update(new (firebase.firestore.FieldPath)('chars', 'x'), 1); return 'ok'; } catch (e) { return e.code; } });
  ok(r1 === 'permission-denied', 'jogador não escreve na ficha de outro: ' + r1);
  const r2 = await pl.evaluate(async () => { try { await firebase.firestore().doc('npcs/x').get(); return 'ok'; } catch (e) { return e.code; } });
  ok(r2 === 'permission-denied', 'jogador não lê NPC oculto: ' + r2);
  const r3 = await pl.evaluate(async () => { try { await firebase.firestore().doc('fichas/mesa').set({ chars: {} }); return 'ok'; } catch (e) { return e.code; } });
  ok(r3 === 'permission-denied', 'jogador não escreve nas fichas da mesa: ' + r3);

  // 4. mestre (mesma tela, e-mail da lista de mestres)
  const gm = await open();
  await google(gm, 'closed');
  ok((await msg(gm)) === '' && await gm.isVisible('#login'), 'fechar a janela do Google só cancela');
  await google(gm, 'blocked');
  ok(/bloqueou/.test(await msg(gm)), 'avisa quando o pop-up é bloqueado');
  await google(gm, { email: GM_MAIL, verified: false, name: 'Falso Mestre' });
  ok(!(await gm.isVisible('#login')) && (await gm.textContent('#chip-role')) === 'Jogador' && !(await gm.isVisible('#mesa-notas')), 'e-mail de mestre não verificado entra só como jogador');
  const nn = await gm.evaluate(async () => { try { await firebase.firestore().doc('npcs/x').get(); return 'ok'; } catch (e) { return e.code; } });
  ok(nn === 'permission-denied', 'e ele não lê NPC oculto: ' + nn);
  await gm.click('#b-sair'); await gm.waitForTimeout(700);
  await settle(gm);
  await google(gm, { email: GM_MAIL });
  ok(!(await gm.isVisible('#login')), 'mestre entrou');
  ok((await gm.textContent('#chip-role')) === 'Mestre', 'chip Mestre');
  ok(await gm.isVisible('#b-sair') && (await gm.textContent('#b-sair')) === 'Sair (mestre)', 'mestre vê o botão Sair (mestre)');
  ok(await gm.isVisible('#mesa-notas'), 'mestre vê as anotações');
  await gm.waitForTimeout(300);
  ok((await names(gm)).includes('Bruno da Ana'), 'mestre vê a ficha do jogador');
  const label = await gm.$eval('.mcard:has(.mc-open:text("Bruno da Ana")) .mc-sub', (e) => e.textContent);
  ok(/Ana/.test(label), 'nome do jogador aparece no cartão: ' + label);
  await gm.click('.mcard:has(.mc-open:text("Bruno da Ana")) [data-adj="pv"][data-d="-5"]'); await gm.waitForTimeout(800);
  await pl.click('a[data-p="mesa"]'); await pl.waitForTimeout(400);
  await pl.click('.mcard .mc-open'); await pl.waitForTimeout(300);
  ok(+(await pl.$eval('#i-pva', (e) => e.value)) > 0, 'jogador vê o PV que o mestre mexeu');
  await gm.click('[data-new="npc"]'); await gm.waitForTimeout(400);
  await gm.fill('[data-bind="nome"]', 'Chefe Secreto'); await gm.waitForTimeout(900);
  await pl.click('a[data-p="mesa"]'); await pl.waitForTimeout(300);
  ok(!(await names(pl)).includes('Chefe Secreto'), 'NPC oculto não chega ao jogador');
  await gm.click('#b-reveal'); await gm.waitForTimeout(900);
  await pl.waitForTimeout(400);
  ok((await names(pl)).includes('Chefe Secreto'), 'NPC revelado chega ao jogador');
  await gm.click('#b-back'); await gm.click('a[data-p="mesa"]');
  await gm.fill('#gm-notas', 'segredo do mestre'); await gm.waitForTimeout(1100);
  ok((await gm.evaluate(() => JSON.parse(localStorage.getItem('mockfs'))['gm/notas'])).texto === 'segredo do mestre', 'anotações salvas');
  await pl.click('.mcard:has(.mc-open:text("Chefe Secreto")) .mc-open'); await pl.waitForTimeout(250);
  ok((await pl.textContent('#tb-mode')) === 'Só leitura', 'NPC revelado é só leitura para o jogador');
  // 4b. inventário e dinheiro
  const anaDoc = () => pl.evaluate(() => JSON.parse(localStorage.getItem('mockfs'))['fichas/g-ana@teste.com']);
  const bruno = async () => Object.values((await anaDoc()).chars).find((c) => c.nome === 'Bruno da Ana');
  const itNames = (p) => p.$$eval('.it .it-nm b', (e) => e.map((x) => x.textContent));
  const ITEM = (n) => '.it:has(.it-nm b:text-is("' + n + '"))';
  await pl.click('a[data-p="mesa"]'); await pl.click('.mcard.mine .mc-open'); await pl.waitForTimeout(250);
  await pl.click('#seg-fi [data-fv="inv"]'); await pl.click('#seg-iv [data-iv="itens"]');
  ok(await pl.isVisible('#inv-btns') && /Nenhum item/.test(await pl.textContent('#inv-empty')), 'jogador abre o inventário da própria ficha (vazio)');
  await pl.evaluate(() => { window.__fsPaths.length = 0; });
  await pl.click('[data-inv-panel="cat"]'); await pl.fill('#cat-q', 'poção de cura menor');
  await pl.click('[data-cat-add="consumivel-pocao-de-cura-menor"]'); await pl.click('[data-cat-add="consumivel-pocao-de-cura-menor"]');
  ok(/agora você tem 2/.test(await pl.textContent('#msg-cat')), 'adicionar de novo soma: ' + await pl.textContent('#msg-cat'));
  await pl.fill('#cat-q', 'espada longa'); await pl.click('[data-cat-add="arma-espada-longa"]');
  await pl.click('[data-inv-panel="novo"]');
  await pl.click('#nv-ok'); ok(/nome/.test(await pl.textContent('#msg-nv')), 'item manual sem nome pede o nome');
  await pl.fill('#nv-n', 'Vinho raro'); await pl.fill('#nv-kg', '1.5'); await pl.fill('#nv-gil', '50'); await pl.click('#nv-ok');
  await pl.waitForTimeout(900);
  let bd = await bruno();
  const its = Object.values(bd.itens || {});
  ok(its.length === 3, 'três itens salvos no banco: ' + its.map((i) => i.n + ' x' + i.q).join(', '));
  ok(its.some((i) => i.ref === 'consumivel-pocao-de-cura-menor' && +i.q === 2), 'item do livro com quantidade 2');
  const vinho = its.find((i) => i.n === 'Vinho raro');
  ok(vinho && vinho.ref === '' && +vinho.kg === 1.5 && vinho.a === 'Ana Souza', 'item manual do jogador com peso e autor: ' + JSON.stringify(vinho));
  ok(Object.values(bd.caixa || {}).some((e) => e.v === -50 && /Vinho raro/.test(e.m)), 'pagar o item manual lança -50 no dinheiro');
  ok((await pl.textContent('#o-peso')) === '10', 'peso somado (2 × 3 + 2,5 + 1,5 kg): ' + await pl.textContent('#o-peso'));
  const paths = await pl.evaluate(() => window.__fsPaths.slice());
  ok(paths.length > 0 && paths.every((x) => /^chars\.[^.]+\.(itens|caixa)\.[^.]+(\.[^.]+)?$/.test(x)), 'inventário grava por caminho de campo, nunca o mapa inteiro: ' + paths.slice(0, 3).join(' ; '));
  await pl.click('#seg-iv [data-iv="gil"]');
  await pl.fill('#cx-v', '30'); await pl.click('#cx-menos');
  ok(/motivo/.test(await pl.textContent('#msg-cx')), 'dinheiro sem motivo pede o motivo');
  await pl.fill('#cx-m', 'Comprei flechas'); await pl.click('#cx-menos');
  await pl.fill('#cx-v', '200'); await pl.fill('#cx-m', 'Ganhei a aposta na taverna'); await pl.click('#cx-mais');
  await pl.waitForTimeout(900);
  ok((await pl.textContent('#o-gil')) === '120', 'saldo = 0 - 50 - 30 + 200: ' + await pl.textContent('#o-gil'));
  ok(/Ganhei a aposta/.test(await pl.textContent('#cx-list .lg:first-child')), 'histórico mostra o mais novo primeiro');
  await gm.click('a[data-p="mesa"]'); await gm.waitForTimeout(300);
  ok(/Gil 120/.test(await gm.textContent('.mcard:has(.mc-open:text("Bruno da Ana"))')), 'cartão da Mesa mostra o dinheiro do personagem');
  await gm.click('.mcard:has(.mc-open:text("Bruno da Ana")) .mc-open'); await gm.waitForTimeout(300);
  await gm.click('#seg-fi [data-fv="inv"]'); await gm.click('#seg-iv [data-iv="itens"]');
  ok((await itNames(gm)).includes('Vinho raro'), 'mestre vê o item manual do jogador');
  await gm.click('[data-inv-panel="novo"]'); await gm.fill('#nv-n', 'Chave do cofre'); await gm.fill('#nv-d', 'Abre o cofre do barão'); await gm.click('#nv-ok');
  await gm.click('#seg-iv [data-iv="gil"]'); await gm.fill('#cx-v', '500'); await gm.fill('#cx-m', 'Recompensa da missão'); await gm.click('#cx-mais');
  await gm.waitForTimeout(900); await pl.waitForTimeout(300);
  await pl.click('#seg-iv [data-iv="itens"]');
  ok((await itNames(pl)).includes('Chave do cofre'), 'jogador vê ao vivo o item que o mestre criou');
  ok((await pl.textContent('#o-gil')) === '620', 'jogador vê o dinheiro que o mestre deu: ' + await pl.textContent('#o-gil'));
  bd = await bruno();
  ok(Object.values(bd.caixa).some((e) => e.a === 'Mestre' && e.v === 500), 'lançamento do mestre fica marcado como Mestre');
  await pl.click(ITEM('Vinho raro') + ' .it-nm');
  await pl.click(ITEM('Vinho raro') + ' [data-it-del]');
  ok((await pl.textContent(ITEM('Vinho raro') + ' [data-it-del]')) === 'Confirmar remoção', 'remover item pede confirmação');
  await pl.click(ITEM('Vinho raro') + ' [data-it-del]');
  await pl.click(ITEM('Poção de cura menor') + ' [data-it-q="-1"]');
  await pl.click('#seg-iv [data-iv="gil"]');
  await pl.click('#cx-list .lg:has(b:text("Comprei flechas")) [data-cx-del]'); await pl.click('#cx-list .lg:has(b:text("Comprei flechas")) [data-cx-del]');
  await pl.waitForTimeout(1000); await gm.waitForTimeout(300);
  bd = await bruno();
  const its2 = Object.values(bd.itens), cx2 = Object.values(bd.caixa);
  ok(!its2.some((i) => i && i.n === 'Vinho raro') && its2.every((i) => i && typeof i === 'object'), 'item removido do banco (campo apagado, sem null)');
  ok(+its2.find((i) => i.ref === 'consumivel-pocao-de-cura-menor').q === 1, 'quantidade diminuiu para 1');
  ok(!cx2.some((e) => e && /flechas/.test(e.m)) && cx2.every((e) => e && typeof e === 'object'), 'lançamento apagado do banco');
  ok((await pl.textContent('#o-gil')) === '650', 'saldo sem o lançamento apagado: ' + await pl.textContent('#o-gil'));
  await gm.click('#seg-iv [data-iv="itens"]');
  ok(!(await itNames(gm)).includes('Vinho raro'), 'remoção chega ao mestre');
  // outro jogador: vê o inventário, mas só para ler
  const pb2 = await open();
  await google(pb2, { email: 'beto@teste.com', name: 'Beto Google' });
  await pb2.click('.mcard:has(.mc-open:text("Bruno da Ana")) .mc-open'); await pb2.waitForTimeout(300);
  await pb2.click('#seg-fi [data-fv="inv"]'); await pb2.click('#seg-iv [data-iv="itens"]');
  ok(!(await pb2.isVisible('#inv-btns')) && !(await pb2.isVisible('#cx-form')), 'outro jogador: sem adicionar item nem lançar dinheiro na ficha alheia');
  ok((await itNames(pb2)).includes('Chave do cofre'), 'outro jogador vê os itens');
  ok(await pb2.$$eval('.it .qty .btn', (e) => e.length > 0 && e.every((x) => x.hidden)), 'sem botões de quantidade na ficha alheia');
  ok(await pb2.$eval('.it input[data-bind$=".n"]', (e) => e.disabled), 'campos do item desabilitados na ficha alheia');
  const wr = await pb2.evaluate(async () => { try { await firebase.firestore().doc('fichas/g-ana@teste.com').update(new (firebase.firestore.FieldPath)('chars', 'x', 'itens', 'y', 'n'), 'roubado'); return 'ok'; } catch (e) { return e.code; } });
  ok(wr === 'permission-denied', 'outro jogador não grava no inventário alheio: ' + wr);
  await pb2.close();
  // ficha antiga (sem itens nem caixa): abre, Gil vira saldo inicial e aceita item novo
  await gm.evaluate(async () => { await firebase.firestore().doc('fichas/mesa').update(new (firebase.firestore.FieldPath)('chars', 'cantiga'), { nome: 'Ficha antiga', tipo: 'npc', gil: '300', inv: 'Corda velha', base: { car: '0', con: '1', des: '2', for: '3', int: '4', pre: '5' } }); });
  await gm.click('#b-back'); await gm.waitForTimeout(400);
  await gm.click('.mcard:has(.mc-open:text("Ficha antiga")) .mc-open'); await gm.waitForTimeout(300);
  ok((await gm.textContent('#o-gil')) === '300' && (await gm.$eval('[data-bind="inv"]', (e) => e.value)) === 'Corda velha', 'ficha antiga abre: Gil vira saldo inicial e o texto do inventário fica');
  await gm.click('[data-inv-panel="cat"]'); await gm.fill('#cat-q', 'tocha'); await gm.click('[data-cat-add="item-tocha"]'); await gm.waitForTimeout(900);
  const antiga = await gm.evaluate(() => JSON.parse(localStorage.getItem('mockfs'))['fichas/mesa'].chars.cantiga);
  ok(antiga.itens && Object.values(antiga.itens).length === 1 && Object.values(antiga.itens)[0].n === 'Tocha', 'ficha antiga ganha o primeiro item');
  // copiar e importar leva o inventário junto
  await pl.click('#seg-fi [data-fv="ficha"]');
  await pl.evaluate(() => { document.querySelector('#backup-sec details').open = true; });
  await pl.click('#b-copy'); await pl.waitForTimeout(200);
  const txt = await pl.$eval('#out-json', (e) => e.value);
  ok(Object.values(JSON.parse(txt).ficha.itens).some((i) => i.n === 'Chave do cofre'), 'o texto da ficha leva os itens');
  await pl.fill('#in-json', txt); await pl.click('#b-imp'); await pl.waitForTimeout(800);
  await pl.click('#seg-fi [data-fv="inv"]'); await pl.click('#seg-iv [data-iv="itens"]');
  ok((await itNames(pl)).includes('Chave do cofre') && (await pl.textContent('#o-gil')) === '650', 'ficha importada vem com itens e dinheiro');
  await pl.click('#b-del'); await pl.click('#b-del'); await pl.waitForTimeout(700);
  await pl.click('a[data-p="mesa"]'); await pl.click('.mcard.mine .mc-open'); await pl.waitForTimeout(250);
  await pl.screenshot({ path: path.join(DIST, 'shot-inventario.png'), fullPage: true });
  await gm.click('a[data-p="mesa"]'); await gm.waitForTimeout(200);
  await pl.click('#b-del'); await pl.click('#b-del'); await pl.waitForTimeout(700);
  ok(!(await names(pl)).includes('Bruno da Ana'), 'jogador excluiu a própria ficha');

  // 5. sair
  await gm.click('#b-sair'); await gm.waitForTimeout(700);
  ok(await gm.isVisible('#login'), 'mestre: Sair volta para a entrada na hora');
  await pl.click('a[data-p="mesa"]'); await pl.click('#b-sair'); await pl.waitForTimeout(700);
  ok(await pl.isVisible('#login') && !(await pl.isVisible('#sair-hint')), 'jogador com Google sai sem confirmação');
  await google(pl, ANA);
  ok(!(await pl.isVisible('#login')), 'e volta depois só com o Google (sem código)');

  // 6. sem conta Google
  const sp = await open();
  await anon(sp, 'Dani');
  ok(!(await sp.isVisible('#login')) && (await sp.textContent('#chip-role')) === 'Jogador', 'sem conta Google: entra só com o nome');
  await sp.click('#b-sair');
  ok((await sp.textContent('#b-sair')) === 'Confirmar saída' && await sp.isVisible('#sair-hint') && !(await sp.isVisible('#login')), 'sem conta: primeiro toque só pede confirmação');
  await sp.click('#b-sair'); await sp.waitForTimeout(700);
  ok(await sp.isVisible('#login') && !(await sp.isVisible('#chip-role')), 'sem conta: segundo toque sai');
  await sp.evaluate(() => { document.querySelector('#login details').open = true; });
  await sp.fill('#l-nome', ''); await sp.click('#b-anon');
  ok(/Preencha/.test(await msg(sp)), 'sem conta: campos vazios pedem preenchimento');
  await sp.close();
  const nx = await open({ rules: { noAnon: true } });
  await anon(nx, 'Carla');
  ok(/não está ligado/.test(await msg(nx)), 'avisa quando o login anônimo está desligado: ' + (await msg(nx)));

  const sw = await pl.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  ok(sw, 'sem rolagem horizontal');
  console.log('erros de página:', errs.length ? errs : 'nenhum');
  console.log(fails ? ('FALHAS: ' + fails) : 'TUDO CERTO');
  await br.close();
  process.exit(fails || errs.length ? 1 : 0);
})();

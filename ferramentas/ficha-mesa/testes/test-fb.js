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
  const subs = [];
  const snapDoc = (p) => { const d = rd()[p]; return { id: p.split('/').pop(), exists: d !== undefined, data: () => (d === undefined ? undefined : clone(d)), metadata: { fromCache: false, hasPendingWrites: false } }; };
  const snapCol = (p) => { const all = rd(), pre = p + '/'; const docs = Object.keys(all).filter((k) => k.indexOf(pre) === 0 && k.slice(pre.length).indexOf('/') < 0).sort().map(snapDoc); return { docs, metadata: { fromCache: false, hasPendingWrites: false } }; };
  const sig = (col, sn) => JSON.stringify(col ? sn.docs.map((d) => [d.id, d.data()]) : [sn.exists, sn.data()]);
  const emit = () => subs.slice().forEach((s) => { const sn = s.col ? snapCol(s.p) : snapDoc(s.p); const g = sig(s.col, sn); if (g !== s.sig) { s.sig = g; s.next(sn); } });
  window.addEventListener('storage', (e) => { if (e.key === K) emit(); });
  const wr = (o) => { localStorage.setItem(K, JSON.stringify(o)); setTimeout(emit, 0); };
  const setAt = (o, segs, v) => { let t = o; for (let i = 0; i < segs.length - 1; i++) { if (!t[segs[i]] || typeof t[segs[i]] !== 'object') t[segs[i]] = {}; t = t[segs[i]]; } t[segs[segs.length - 1]] = v; };
  window.__fsWrites = [];
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
          for (let i = 0; i < args.length; i += 2) setAt(a[p], args[i].s, clone(args[i + 1]));
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
  const fsFn = () => fs; fsFn.FieldPath = FP;
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
  await pl.click('a[data-p="mesa"]'); await pl.click('.mcard.mine .mc-open'); await pl.waitForTimeout(250);
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

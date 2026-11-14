// Testa a ficha local (ficha/index.html, salva no navegador): inventário, dinheiro e fichas antigas.
const { chromium } = require('playwright');
const path = require('path');
const DIST = path.join(__dirname, '..', 'dist');
const URL = 'file://' + path.join(__dirname, '..', '..', '..', 'ficha', 'index.html');
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FALHOU:', m); } else console.log('ok:', m); };

(async () => {
  const br = await chromium.launch();
  const errs = [];
  async function page(ctx) {
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(String(e)));
    p.on('console', (m) => { if (m.type() === 'error' && !/fonts|ERR_|Failed to load resource/.test(m.text())) errs.push(m.text()); });
    return p;
  }
  const itNames = (p) => p.$$eval('.it .it-nm b', (e) => e.map((x) => x.textContent));
  const ITEM = (n) => '.it:has(.it-nm b:text-is("' + n + '"))';
  const txt = (p, s) => p.textContent(s);

  // 1. ficha de exemplo já vem com inventário
  const ctx = await br.newContext({ viewport: { width: 400, height: 860 } });
  const p = await page(ctx);
  await p.goto(URL); await p.waitForTimeout(300);
  ok(/4 itens, 10,5 kg. Dinheiro: 760 Gil/.test(await txt(p, '#o-invmini')), 'resumo do inventário na ficha: ' + await txt(p, '#o-invmini'));
  ok(!(await p.isVisible('#inv-list')), 'inventário escondido na parte Ficha');
  await p.click('#o-invmini + [data-fv="inv"]');
  ok(await p.isVisible('#inv-list') && !(await p.isVisible('[data-bind="nome"]')), '"Abrir inventário" troca para o inventário');
  ok((await txt(p, '#o-peso')) === '10,5' && /de 21 \(máximo 63\)/.test(await txt(p, '#s-peso')), 'peso e carga (3 × Força 6 + mochila 3): ' + await txt(p, '#s-peso'));
  ok((await itNames(p)).join() === 'Espada longa,Couro leve,Poção de cura menor,Mochila pequena', 'itens do exemplo em ordem de categoria');
  ok(/Dano 1d8 · Crítico x2/.test(await txt(p, ITEM('Espada longa') + ' .it-nm small')), 'arma mostra dano e crítico na linha');

  // 2. catálogo: adicionar, somar, comprar
  await p.click('[data-inv-panel="cat"]');
  ok(/Mostrando 60 de 253/.test(await txt(p, '#cat-info')), 'catálogo com os 253 itens do livro: ' + await txt(p, '#cat-info'));
  await p.selectOption('#cat-c', 'Runas'); await p.fill('#cat-q', 'macht');
  ok((await p.$$('#cat-res .cr')).length === 1, 'busca e filtro por categoria');
  await p.click('[data-cat-buy="runa-macht"]');
  ok((await txt(p, '#o-gil')) === '-2.240' && /negativo/.test(await txt(p, '#msg-cat')), 'comprar desconta o preço e avisa saldo negativo: ' + await txt(p, '#o-gil'));
  ok(await p.$eval('#o-gil', (e) => e.classList.contains('neg')), 'saldo negativo em vermelho');
  await p.selectOption('#cat-c', ''); await p.fill('#cat-q', 'poção de cura menor');
  ok(/tem 2/.test(await txt(p, '#cat-res .cr')), 'catálogo mostra quantos você já tem');
  await p.click('[data-cat-add="consumivel-pocao-de-cura-menor"]');
  ok((await txt(p, ITEM('Poção de cura menor') + ' output')) === '3', 'adicionar item que já tem soma a quantidade');

  // 3. item criado na mão
  await p.click('[data-inv-panel="novo"]');
  ok(!(await p.isVisible('#inv-cat')) && await p.isVisible('#inv-novo'), 'abre o formulário de item novo e fecha o catálogo');
  await p.fill('#nv-n', 'Vinho raro'); await p.fill('#nv-q', '2'); await p.fill('#nv-kg', '1.5'); await p.fill('#nv-d', 'Safra de 1890, presente do conde');
  await p.press('#nv-n', 'Enter');
  ok((await itNames(p)).includes('Vinho raro') && (await txt(p, ITEM('Vinho raro') + ' output')) === '2', 'Enter cria o item manual com quantidade');
  ok((await txt(p, '#o-peso')) === '16,5', 'peso inclui o item manual (13,5 + 2 × 1,5): ' + await txt(p, '#o-peso'));
  await p.click(ITEM('Vinho raro') + ' .it-nm');
  ok(await p.isVisible(ITEM('Vinho raro') + ' .it-more') && /Criado na mão/.test(await txt(p, ITEM('Vinho raro') + ' .it-by')), 'detalhes do item manual');
  await p.fill(ITEM('Vinho raro') + ' input[data-bind$=".n"]', 'Vinho raríssimo');
  ok((await itNames(p)).includes('Vinho raríssimo'), 'editar o nome atualiza a lista');
  await p.fill(ITEM('Vinho raríssimo') + ' input[data-bind$=".q"]', '6');
  ok((await txt(p, ITEM('Vinho raríssimo') + ' output')) === '6', 'editar a quantidade no campo atualiza o número');
  ok(/Acima da carga normal/.test(await txt(p, '#msg-peso')), 'avisa quando passa da carga normal: ' + await txt(p, '#msg-peso'));
  await p.click(ITEM('Espada longa') + ' [data-it-q="-1"]');
  ok((await txt(p, ITEM('Espada longa') + ' output')) === '0' && /acabou/.test(await txt(p, ITEM('Espada longa') + ' .it-nm small')), 'quantidade 0 fica marcada como acabou');
  await p.click(ITEM('Espada longa') + ' .it-nm'); await p.click(ITEM('Espada longa') + ' [data-it-del]'); await p.click(ITEM('Espada longa') + ' [data-it-del]');
  ok(!(await itNames(p)).includes('Espada longa'), 'remover item (com confirmação)');

  // 4. dinheiro
  await p.click('#seg-iv [data-iv="gil"]');
  ok(!(await p.isVisible('#inv-list')) && await p.isVisible('#cx-form'), 'aba Dinheiro');
  await p.fill('#cx-m', 'Venda da espada'); await p.click('#cx-mais');
  ok(/valor/.test(await txt(p, '#msg-cx')), 'pede valor');
  await p.fill('#cx-v', '3000'); await p.click('#cx-mais');
  ok((await txt(p, '#o-gil')) === '760' && /Entrou 3.000/.test(await txt(p, '#msg-cx')), 'ganhar dinheiro com motivo: ' + await txt(p, '#o-gil'));
  ok(/Venda da espada/.test(await txt(p, '#cx-list .lg:first-child')) && /saldo 760/.test(await txt(p, '#cx-list .lg:first-child')), 'histórico com o saldo depois de cada lançamento');
  await p.click('#cx-list .lg:has(b:text("Comprei Macht")) [data-cx-del]');
  ok((await txt(p, '#cx-list .lg:has(b:text("Comprei Macht")) [data-cx-del]')) === 'Apagar', 'apagar lançamento pede confirmação');
  await p.click('#cx-list .lg:has(b:text("Comprei Macht")) [data-cx-del]');
  ok((await txt(p, '#o-gil')) === '3.760', 'apagar lançamento devolve o saldo: ' + await txt(p, '#o-gil'));
  await p.fill('[data-bind="gil"]', '1000');
  ok((await txt(p, '#o-gil')) === '4.180', 'mudar o saldo inicial recalcula: ' + await txt(p, '#o-gil'));
  await p.screenshot({ path: path.join(DIST, 'shot-ficha-dinheiro.png'), fullPage: true });

  // 5. recarregar mantém tudo e lembra a aba
  await p.reload(); await p.waitForTimeout(300);
  ok((await txt(p, '#o-gil')) === '4.180' && await p.isVisible('#cx-form'), 'recarregar mantém o dinheiro e a aba aberta');
  await p.click('#seg-iv [data-iv="itens"]');
  ok((await itNames(p)).includes('Vinho raríssimo') && (await itNames(p)).includes('Macht'), 'recarregar mantém os itens');
  await p.screenshot({ path: path.join(DIST, 'shot-ficha-itens.png'), fullPage: true });

  // 6. copiar e importar levam o inventário
  await p.click('#seg-fi [data-fv="ficha"]');
  await p.evaluate(() => { document.querySelectorAll('details.adv').forEach((d) => { d.open = true; }); });
  await p.click('#b-copy'); await p.waitForTimeout(150);
  const json = await p.$eval('#out-json', (e) => e.value);
  await p.fill('#in-json', json); await p.click('#b-imp'); await p.waitForTimeout(150);
  ok((await p.$$eval('#sel-ficha option', (e) => e.length)) === 2 && /4.180 Gil/.test(await txt(p, '#o-invmini')), 'importar cria cópia com itens e dinheiro: ' + await txt(p, '#o-invmini'));
  const sw = await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  ok(sw, 'sem rolagem horizontal no celular');
  await ctx.close();

  // 7. ficha antiga salva antes do inventário
  const ctx2 = await br.newContext({ viewport: { width: 400, height: 860 } });
  const q = await page(ctx2);
  await q.addInitScript(() => {
    if (sessionStorage.getItem('feito')) return; sessionStorage.setItem('feito', '1');
    localStorage.setItem('wz-ficha-v1', JSON.stringify({ atual: 'velha', fichas: [{ id: 'velha', nome: 'Ficha velha', race: 'Humano', cls: 'Guerreiro espadachim', nivel: '3', base: { car: '0', con: '1', des: '2', for: '3', int: '4', pre: '5' }, rb: {}, up: {}, extra: { pv: '', pm: '', ca: '', cr: '' }, over: {}, per: {}, tal: [], q: {}, inv: 'Corda e tocha', gil: '250', notas: '' }] }));
    localStorage.setItem('wz-fview', 'inv');
  });
  await q.goto(URL); await q.waitForTimeout(300);
  ok((await txt(q, '#o-gil')) === '250' && /Nenhum item/.test(await txt(q, '#inv-empty')), 'ficha antiga abre: Gil vira saldo inicial, sem itens');
  ok((await q.$eval('[data-bind="inv"]', (e) => e.value)) === 'Corda e tocha', 'texto antigo do inventário continua nas anotações');
  await q.click('[data-inv-panel="cat"]'); await q.fill('#cat-q', 'corda'); await q.click('[data-cat-add="item-corda-15m"]');
  ok((await itNames(q)).join() === 'Corda (15m)', 'ficha antiga aceita item novo');
  await ctx2.close();

  console.log('erros de página:', errs.length ? errs : 'nenhum');
  console.log(fails ? ('FALHAS: ' + fails) : 'TUDO CERTO');
  await br.close();
  process.exit(fails || errs.length ? 1 : 0);
})();

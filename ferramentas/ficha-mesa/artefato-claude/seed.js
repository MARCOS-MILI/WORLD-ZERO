const { chromium } = require('playwright');
(async () => {
  const br = await chromium.launch(); const p = await br.newPage();
  await p.goto('file://' + require('path').join(__dirname, '..', 'dist', 'mesa-artefato.html')); await p.waitForTimeout(200);
  const out = await p.evaluate(() => {
    const a = window.__wz.exemplo(); a.id = 'cexemplo1'; a.tipo = 'pc'; a.dono = ''; a.criado = 1;
    const n = window.__wz.blank(); n.id = 'cexemplo2'; n.tipo = 'inimigo'; n.criado = 2;
    Object.assign(n, { nome: 'Goblin saqueador (exemplo)', race: 'Goblin', cls: 'Guerreiro espadachim', nivel: '2', xp: '1000', notas: 'NPC de exemplo, oculto dos jogadores. Use "Mostrar aos jogadores" para revelar. Pode excluir.' });
    n.base = { car: '1', con: '2', des: '5', 'for': '0', int: '3', pre: '4' };
    n.inv = 'Adaga enferrujada, bolsa com 12 de Gil';
    const c = (o) => ({ ...o, up: o.up, rb: o.rb });
    return { a, n, ca: window.__wz.compute(a).pv, cn: window.__wz.compute(n).pv };
  });
  require('fs').writeFileSync(require('path').join(__dirname, 'seed-a.json'), JSON.stringify(out.a));
  require('fs').writeFileSync(require('path').join(__dirname, 'seed-n.json'), JSON.stringify(out.n));
  console.log(JSON.stringify(out.a)); console.log(JSON.stringify(out.n)); console.log(out.ca, out.cn);
  await br.close();
})();

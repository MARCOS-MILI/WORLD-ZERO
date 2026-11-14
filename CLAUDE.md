# World Zero (site, ficha automática e Mesa)

Repositório do Marcos (GitHub MARCOS-MILI/WORLD-ZERO, publicado pelo GitHub Pages em https://marcos-mili.github.io/WORLD-ZERO/). O sistema de RPG World Zero (livro 4.7.7) foi criado pelo amigo dele, **J.Carvalho_20**. O Marcos faz o site.

Leia também: `docs/ESTADO.md` (o que está pronto, decisões e como publicar) e `docs/PEDIDO-INVENTARIO.md` (como o inventário foi feito e o que ficou de ideia para depois).

## Como falar com o Marcos
- Português do Brasil, informal e direto. Sem travessão longo. Frases curtas, nada de texto que pareça de IA.
- Ele é estudante do ensino médio, usa o celular e manda mensagens por voz (a transcrição vem bagunçada: interprete, não leia ao pé da letra).
- Prefere que você execute em vez de perguntar muito. Quando precisar que ele faça algo (por exemplo no console do Firebase), dê o passo a passo curto e o texto pronto para colar.
- Tudo que ele usa precisa funcionar bem no celular (largura de 400 px).
- Não peça nem guarde senhas, códigos nem e-mails de mestres no repositório.

## O que tem aqui

| Caminho | O que é | Como é gerado |
|---|---|---|
| `index.html` | O livro de regras em forma de site (1,4 MB, um arquivo só). | `fonte/` (`livro.txt`, `parse.py`, `build.py`, `template.html`). Veja o README. |
| `ficha/index.html` | Ficha de personagem automática (um arquivo só, salva no navegador). | `ferramentas/ficha-mesa/ficha-base.html` + `build-ficha.js` |
| `mesa/index.html` | A Mesa: mestre vê e edita tudo, jogadores editam as próprias fichas, tudo ao vivo (Firebase). | `ferramentas/ficha-mesa/ficha-base.html` + `parts/*.js` + `build.js` |
| `mesa/firebase-config.js` | Configuração pública do projeto Firebase `mesa-world-zero`. | À mão (já preenchida; é pública por natureza). |
| `mesa/regras-firestore.txt` | Regras de segurança do Firestore, com e-mails de exemplo. | À mão. Os e-mails reais dos mestres ficam só no console do Firebase. |
| `mesa/LEIA-ME.md` | Passo a passo do Firebase para o Marcos. | À mão. |
| `ferramentas/ficha-mesa/` | Fontes e testes da ficha e da Mesa. | Veja abaixo. |
| Catálogo de itens (bloco `d-itens` dentro do `ficha-base.html`) | 253 itens do capítulo Equipamentos do livro. | `ferramentas/ficha-mesa/gerar-itens.js` lê `fonte/livro.txt`. Não edite o bloco à mão. |

**Regra principal:** `ficha/index.html` e `mesa/index.html` são gerados. Não edite esses dois à mão: edite `ficha-base.html` ou `parts/*.js` e rode o build, senão a próxima geração apaga a mudança.

## Comandos (dentro de `ferramentas/ficha-mesa/`)

```
npm install                 # só na primeira vez (instala o Playwright)
npx playwright install chromium   # só na primeira vez, para os testes
npm run itens               # só o catálogo de itens (gerar-itens.js), se o livro mudou
npm run build               # catálogo + ficha/index.html + mesa/index.html
npm run check               # confere se catálogo e publicados batem com o que o build gera
npm test                    # build + testes (artefato do Claude, Firebase simulado e ficha local)
```

Os testes abrem a página num Chrome sem interface com 400 px de largura. `testes/test-fb.js` troca o Firebase por uma versão falsa que também simula as regras de segurança (e o `FieldValue.delete()`). `testes/test-ficha.js` testa a ficha local. Os três precisam terminar com "TUDO CERTO". Em sessões do Claude Code na nuvem o Playwright já vem instalado: não rode `npm install` nem `playwright install` lá, use direto os comandos `node ...`.

## Como a ficha e a Mesa se encaixam
- `ficha-base.html` é a ficha completa (HTML + CSS + JS + dados das 34 classes, 19 raças e qualidades). Os dados vêm do livro (`fonte/livro.txt`).
- A Mesa é a mesma ficha com outra "casca": `build.js` pega o `ficha-base.html` e troca trechos (tem erro claro se um trecho não for achado). `parts/storage.js` (banco local), `parts/actions.js` (lista da Mesa, edição, permissões), `parts/firebase.js` (login e Firestore) e `parts/init.js` (início) substituem o armazenamento da ficha.
- `build.js` gera dois sabores: `node build.js` (artefato do Claude, usa `claude.use('db')`) e `node build.js gh` (GitHub, com `firebase-config.js` e os scripts do Firebase).
- Dados no Firestore: `fichas/<uid>` (`{nome, chars:{<id>: ficha}}`), `fichas/mesa` (fichas do mestre e NPCs revelados), `npcs/<id>` (ocultos, só mestre), `gm/notas`.
- O Firestore troca mapas inteiros num `update`, então `FireDB` (em `parts/firebase.js`) transforma cada edição em caminhos de campo (`FieldPath`). **Para apagar uma chave, grave `null`**: `FireDB` troca por `FieldValue.delete()`, `deepMerge` (modo local e `patchRaw`) apaga a chave e `mergePatch` mantém o `null` nos patches que ainda não foram enviados. Não use `null` como valor de verdade em nenhum campo.
- Inventário (aba "Inventário" dentro da Ficha): `itens: {<id>: {n, q, kg, s, d, c, ref, t, a}}` e `caixa: {<id>: {v, m, t, a}}`, mapas com id (nunca listas). `ref` é o id do item no catálogo (vazio = item criado na mão); nome, peso e resumo são copiados na hora de adicionar. `a` = quem lançou ("Mestre", nome do jogador ou vazio na ficha local). Saldo = `gil` (saldo inicial) + soma de `caixa.*.v`. Carga = 3 × Força (normal) e 10 × Força (máximo), mais mochilas do catálogo e `extra.carga`.
- O código do inventário é o mesmo na ficha e na Mesa; só mudam três funções: `invCan` (pode editar?), `invSet(caminho, valor)` (grava; `null` apaga) e `invWho` (quem está mexendo). Na ficha local elas ficam no bloco "ações da ficha" do `ficha-base.html`; na Mesa, em `parts/actions.js`.
- Edição na Mesa: otimista, com espera de 450 ms, uma escrita por vez por documento, e o campo em foco nunca é sobrescrito por atualização remota.

## Cuidados
- Ao mudar `ficha-base.html`, lembre que ela vale para a ficha local **e** para a Mesa: rode `npm test`.
- Campos novos da ficha precisam ir em `blank()` (existe uma em `ficha-base.html` e outra em `parts/storage.js`) para a Mesa e a ficha local ficarem iguais. `fix()` chama `fixInv()`, que limpa entradas nulas de `itens` e `caixa`.
- O livro tem erros e lacunas conhecidos (veja `docs/ESTADO.md`). Onde o livro for incerto, a ficha segue o texto mais provável e avisa, não inventa regra.
- Não dá para testar o Firebase de verdade fora do navegador do Marcos: o teste usa uma versão simulada. Se algo falhar só no site de verdade, peça o print do erro.

## Como publicar
O Pages publica a branch `main`. Fluxo: criar branch, rodar `npm run build`, commitar `ficha/` e `mesa/` junto com as fontes, abrir pull request e fazer o merge em squash. Depois do merge, esperar o workflow "pages build and deployment" ficar verde (alguns minutos). Dica de saída: se o Marcos reclamar que "não mudou", é cache do navegador, peça para recarregar sem cache.

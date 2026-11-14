# Próximo pedido: inventário com catálogo e caixa de dinheiro

Status: **não começado** (só foi feita a análise abaixo). O Marcos pediu para parar e levar tudo para o Claude Code.

## O que o Marcos pediu (14/11/2026, por voz, organizado)
Dentro da ficha, um **inventário** com partes separadas:
1. **Adicionar itens do catálogo**: o jogador escolhe numa lista com todos os itens que o livro já tem (armas, armaduras, consumíveis, etc.) e adiciona.
2. **Criar item na mão**: o mestre pode criar um item que não existe no livro; o **jogador também** (por exemplo "ganhei um vinho raro" que só existe na campanha de RP). Os dois adicionam manualmente.
3. **Dinheiro (contabilidade)**, numa opção separada dentro do inventário: mostra o **saldo** e o histórico de como o jogador usou o dinheiro. Dá para **ganhar ou tirar** dinheiro e escrever um **motivo** ("comprei tal coisa", "ganhei tal coisa no RP").
4. Ele perguntou se dá para ajudar; resposta: sim, é viável.

## Onde isso encaixa no código (achados)
- A ficha já tem `inv: ''` (texto livre, textarea "Equipamento e inventário") e `gil: ''` (campo numérico "Gil"), na seção "Equipamento e anotações" do `ficha-base.html`. Há ficha de exemplo com `inv` preenchido. Não apague esses dados das fichas existentes: mantenha o texto livre (pode virar "Anotações de equipamento") e trate `gil` como **saldo inicial**.
- Os campos novos precisam entrar em `blank()` e `fix()` do `ficha-base.html` **e** em `blank()` de `parts/storage.js` (a Mesa tem a sua própria).
- Ligações de campo: `data-bind="caminho.do.campo"` já sincroniza o formulário com a ficha (local) e com o Firestore (Mesa, via `editSheet`). Em `parts/actions.js`, `applyAccess` desabilita os controles quando a ficha é só leitura: controles novos precisam entrar nesse seletor ou ser desabilitados à parte.
- Sugestão de interface: dentro da página Ficha, uma barra "Ficha | Inventário" (botões com `aria-pressed`, como `#seg-q` na aba Qualidades) que alterna entre as seções atuais e a seção nova. Assim a barra de ferramentas da Mesa (`#tb`: dono, modo, duplicar) continua valendo para o inventário. Dentro do inventário, duas partes: **Itens** e **Dinheiro**. Largura de 400 px.

## Modelo de dados recomendado
Use **mapas com id**, não listas:
```
itens: { <id>: { n: 'Poção de cura menor', q: 2, kg: 3, d: 'Cura 2d8 de PV', cat: 'Consumíveis', ref: 'poc-cura-menor', t: 1731590000000 } }
caixa: { <id>: { v: -250, m: 'Comprei uma espada curta', t: 1731590000000 } }
```
- Por quê: o Firestore atualiza por caminho de campo (`itens.<id>.q`), então duas pessoas mexendo ao mesmo tempo (jogador e mestre) não sobrescrevem a lista inteira. Listas (como `tal`) são trocadas inteiras.
- Item do catálogo guarda `ref` (id estável do item no catálogo) e **copia** nome, peso e descrição, para a ficha não quebrar se o catálogo mudar. Item manual tem `ref: ''`.
- Saldo = `gil` (saldo inicial) + soma de `caixa.*.v`. Valor positivo = ganhou, negativo = gastou. Ordene o histórico por `t`.
- `id`: use `uid()` (já existe na ficha).

## Armadilha importante: apagar item ou lançamento
Hoje o adaptador do Firestore (`FireDB` em `parts/firebase.js`) transforma o patch em pares caminho/valor e **não sabe apagar uma chave**: `flatten` trata `{}` como valor (grava mapa vazio) e `undefined` dá erro. Para remover um item ou desfazer um lançamento é preciso:
1. Escolher um marcador (por exemplo valor `null` = apagar), e em `FireDB.update` trocar por `firebase.firestore.FieldValue.delete()`;
2. Fazer `deepMerge` (em `parts/storage.js`, usado pelo modo local e por `patchRaw`) e `LocalDB` também removerem a chave quando o valor for esse marcador;
3. Atualizar o Firestore falso em `testes/test-fb.js` para aceitar `FieldValue.delete()`;
4. Na ficha local (sem Mesa), apagar direto do objeto (`delete f.itens[id]`).
Alternativa mais simples (menos elegante): apagar de forma "mole" (`x: true`) e esconder. Prefira a primeira.

## Catálogo de itens
Está no texto do livro, `fonte/livro.txt` (capítulo "Equipamentos", linhas 11000 a 12400 mais ou menos: armas a partir de "Armas básica corpo a corpo" (linha 11021), consumíveis em "Consumíveis básicos" (linha 12001), runas em "Runas stao" (12181) e implantes em "Implantes Cibernéticos" (12286)). Grupos que existem:
- **Armas** (básicas, marciais, exóticas, tecnológicas; corpo a corpo e a distância): colunas Alcance, Tipo, Dano, Crítico, Espaço (em kg).
- **Armaduras** (leves, médias, pesadas): C.A., espaço (kg), penalidade; tabela à parte com C.R. física e elemental.
- **Munição e flechas** (espaço), **itens gerais** (binóculos, corda, mochilas...), **itens mágicos**, **amaldiçoados**, **tecnológicos**, **consumíveis** (básicos, cura de PV, mana, sanidade, alquímicos).
- **Montarias** (com Preço em Gil, carga, PV), **modificações de arma**, **runas Stao** (com preço em Gil) e **implantes cibernéticos** (custo em % de sanidade).
- **Só montarias e runas têm preço.** Para o resto o preço não existe no livro: deixe o preço opcional no catálogo e não invente valores.
- Tem erros de digitação nas tabelas ("2kgp", "4kh", "250g", "Maçã" no lugar de "Maça", "1,5 kg" com espaço). O peso aparece como "1kg", "250g", "5g", "1,5 kg", "+3kg": ao extrair, converta para número em kg e revise na mão. Itens sem peso ficam com vazio.
- Sugestão: gerar o catálogo com um script a partir do `livro.txt` e guardar como bloco `<script type="text/plain" id="d-itens">` dentro do `ficha-base.html` (do mesmo jeito que `d-classes` e `d-quals`), com uma busca por nome e filtro por categoria.

## Extras que combinam com o livro (opcionais, confirmar com o Marcos)
- **Peso carregado × limite:** o livro diz que a carga normal é 3 × Força em kg, e o máximo é 10 × Força (acima da normal: −5 em Acrobacia, Atletismo, Furtividade e Crime e −3 m de deslocamento; anões ignoram a perda de deslocamento). Mostrar "Peso: X kg de Y kg" no inventário é natural. Mochilas somam à carga (+3, +6, +10 kg).
- Ao adicionar do catálogo um item que tenha preço, oferecer "comprar" (debita no caixa com motivo automático). Para itens sem preço, só adiciona.
- Aviso (sem bloquear) se o saldo ficar negativo; o mestre decide.

## Permissões na Mesa
Já valem as regras existentes: o dono edita a própria ficha, o mestre edita qualquer uma, os outros só leem. Item manual e lançamento no caixa seguem a mesma permissão (não precisa regra nova no Firestore, porque tudo mora dentro de `fichas/<uid>.chars.<id>`).

## Testes a acrescentar
Em `testes/test.js` e `testes/test-fb.js`: adicionar item do catálogo; criar item manual como jogador e como mestre; mudar quantidade; remover item; ganhar e gastar dinheiro com motivo; conferir saldo; apagar lançamento; outro jogador vendo em só leitura; mestre editando o inventário de um jogador; segundo aparelho vendo a mudança; patches indo por caminho de campo (nunca trocando `itens` inteiro); exportar/importar ficha com inventário; ficha antiga (sem os campos novos) abrindo sem erro.

## Decisões que podem ficar com o padrão (não precisa perguntar ao Marcos)
Saldo inicial = o campo `gil` existente; texto livre `inv` mantido; peso/capacidade mostrado como informação; comprar com preço só nos itens que têm preço.

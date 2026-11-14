# Estado do projeto (14/11/2026)

## Resumo
- Livro de regras em site: pronto e no ar (`index.html`, gerado por `fonte/`).
- Ficha automática: pronta e no ar em https://marcos-mili.github.io/WORLD-ZERO/ficha/ (salva no navegador).
- Mesa compartilhada (Firebase): código no ar em https://marcos-mili.github.io/WORLD-ZERO/mesa/ (PRs #3 a #8, todos com deploy verde). **Ainda não houve teste de verdade** com o Firebase real: só com a versão simulada. O Marcos recebeu o texto novo das regras (sem código da mesa) para colar e publicar no console; não confirmou ainda se fez.
- Inventário com catálogo do livro, item criado na mão e dinheiro com histórico: **feito em 14/11/2026** (ficha local e Mesa), na branch de trabalho do Claude Code. Veja a seção "Inventário" abaixo e `PEDIDO-INVENTARIO.md`.
- O site do livro ganhou atalhos para a Ficha e a Mesa (menu lateral e página inicial), e a Mesa ganhou o link "Voltar ao livro de regras".
- As fontes da ficha e da Mesa (`ferramentas/`), o `CLAUDE.md` e esta pasta `docs/` passaram a ficar no repositório (antes só existiam no zip que o Marcos mandou).

## A ficha automática
Abas: Ficha, Classes, Raças, Perícias, Tabelas, Qualidades. Calcula PV, PM, C.A., C.R., D.T., LCM, proficiência, bônus de atributo e total de perícias. Várias fichas no navegador (localStorage), duplicar, excluir, copiar e importar como texto. Os dados de 34 classes, 19 raças e as qualidades/defeitos estão dentro do `ficha-base.html`, copiados do livro.

### Regras adotadas (conferir com o J.Carvalho_20)
- "Vida média" do livro = metade do máximo do dado (2d6 = 6, 2d8 = 8). Dá para trocar para "Eu rolei".
- "Mod" = coluna Bônus da tabela de atributos.
- C.R. = bônus de Constituição + 1 a cada 20 PV (leitura do texto, não confirmada).
- D.T. = 12 + metade do nível + proficiência + modificador do atributo-chave (padrão Intelecto, dá para trocar).
- LCM por nível + bônus de Presença (como na tabela do livro).
- Perícia: bônus + proficiência + grau (Treinado +2, Veterano +3, Gênio +4), com 2 opções alternativas em Ajustes.
- Saldo de qualidades = pontos iniciais + defeitos − qualidades (interpretação). Sobrevida (+3 PV por nível) e Fonte de Poder (+3 PM por nível) entram sozinhas.
- Conferência: Humano, Guerreiro espadachim nível 5, atributos 2/4(3+1)/4/6(5+1)/1/0 → PV 62, PM 31, C.A. 11, C.R. 4, D.T. 15.

### Lacunas do livro que aparecem na ficha
- Sem PV, PM nem perícias no livro: Dark Knight, Dark Slayer, Devil Bringer, Mysterious man, Demon Weapon e O Visionário. Shinigami tem perícias mas não tem PV nem PM.
- Classes com PV mas sem PM no livro (só entram os extras de Ajustes): Assassino, Andarilho espiritual, Guerreiro comandante, Los lobos, Invocador de plantas, Lutador mágico, Metálica, Mestre das máscaras, Monarca das sombras, Samurai das almas, Rainha da podridão, Senhor das moscas e Vikings.
- Caçador estiloso e Berserk de metal: tabela de habilidades incompleta ou ausente. Metálica: tabela com vários níveis em branco.
- Anões e Vampiro incompletos. Perda de Memória recente sem valor de pontos.
- O livro não diz como combinar 2d20/3d20; a ficha mostra a rolagem e oferece d10/d12.

## Inventário (ficha local e Mesa)
Na página Ficha, a barra "Ficha | Inventário" troca de parte (a escolha fica lembrada no aparelho). O inventário tem duas abas:
- **Itens**: "Adicionar do livro" abre o catálogo (253 itens do capítulo Equipamentos: armas, armaduras, munição, itens gerais, mágicos, amaldiçoados, tecnológicos, consumíveis, modificações, runas, implantes e montarias), com busca e filtro por categoria. Adicionar um item que já existe soma a quantidade. "Comprar" (só montarias e runas, que são os únicos com preço no livro) adiciona e desconta o preço. "Criar item" é para o que não está no livro (o vinho raro do RP), com nome, categoria, quantidade, peso, descrição e "Paguei" opcional. Cada item tem − e +, e abre para editar nome, quantidade, peso e anotações, ou remover (com confirmação).
- **Dinheiro**: valor + motivo (obrigatório) e os botões "+ Ganhei" e "− Gastei". Histórico do mais novo para o mais velho, com data, quem lançou e o saldo depois de cada lançamento; × apaga um lançamento errado (com confirmação). Saldo negativo é permitido, mas aparece em vermelho e com aviso.
- Topo do inventário: dinheiro e peso carregado × carga (3 × Força normal, 10 × Força máximo, mochilas do catálogo somam, campo "Carga extra"). Passar da carga normal mostra as penalidades do livro.
- Fichas antigas: o campo "Gil" virou o **saldo inicial** e o texto antigo "Equipamento e inventário" continua como "Anotações de equipamento". Nada foi perdido.
- Na Mesa: mesmas permissões das outras edições (dono e mestre editam; os outros só veem, sem botões). O cartão da Mesa mostra o Gil. Lançamentos e itens guardam quem fez ("Mestre" ou o nome do jogador). Não precisou mudar as regras do Firestore.
- Regras adotadas (conferir com o J.Carvalho_20): a "Força" da carga é o total do atributo (0 a 12), então a carga fica baixa (Força 3 = 9 kg); por isso existe o campo "Carga extra". Mochilas somam a carga normal e a máxima.

## A Mesa (versão GitHub, Firebase)
Projeto Firebase: `mesa-world-zero` (plano gratuito Spark). Login do Google e Anônimo ligados, domínio `marcos-mili.github.io` autorizado, Firestore em modo de produção.

### Quem entra e como (decisão do Marcos, 13/11)
- Todos entram pelo botão "Entrar com o Google". **Qualquer pessoa** vira jogador, sem código da mesa. O nome vem da conta Google (ou o que ela digitar no campo opcional).
- **Mestre** = só os e-mails que estão na lista dentro da função `mestre()` das regras do Firestore (e-mail verificado e provedor google.com). Vários mestres: basta editar a lista no console (Firestore > Regras) e publicar. Os e-mails não ficam no repositório.
- Quem não tem Google usa "Não tenho conta Google" (login anônimo, só o nome); as fichas dele ficam presas àquele aparelho.
- Botão Sair no topo ("Sair (mestre)" ou "Sair da mesa").
- Fichas do jogador ficam em `fichas/<uid>` (a conta Google), então aparecem em qualquer aparelho.

### Regras do Firestore (resumo; o texto está em `mesa/regras-firestore.txt`)
- `fichas/{dono}`: qualquer logado lê; cria/atualiza só o mestre ou o próprio dono (`uid == dono`); exclui só o mestre.
- `npcs/*` e `gm/*`: só o mestre lê e escreve.
- Risco aceito pelo Marcos: quem tiver o link entra como jogador e lê as fichas dos outros jogadores (não lê NPCs ocultos nem anotações). Dá para voltar a exigir um código da mesa se virar problema (era assim antes do PR #8; veja o histórico do git).

### O que a Mesa faz
- Mestre: lista todas as fichas (Jogadores, Na mesa, NPCs ocultos), botões de PV/PM (−5, −1, +1, +5), cria ficha de jogador e NPC, muda o tipo (NPC, inimigo, aliado), "Mostrar aos jogadores" e "Ocultar dos jogadores", anotações só dele (um texto só; edição simultânea sobrescreve).
- Jogador: vê as fichas de todos, NPCs revelados e aliados; edita só as próprias; cria, duplica, exclui e importa as suas; "Copiar para mim" numa ficha alheia.
- Sem Firebase configurado a página abre em "modo local".

### Pontos de atenção conhecidos
- A `apiKey` do Firebase foi lida de um print do console. Se o login falhar com "API key not valid", pode ser uma letra lida errada (l minúsculo, I maiúsculo, O e zero): peça o texto copiado.
- O login do Google não funciona em navegador interno (Discord, Instagram): abrir no Chrome ou no Safari.
- Plano gratuito: 50 mil leituras e 20 mil escritas por dia; a página avisa se passar.
- Testes só com Firebase simulado. O que falta é o teste real: mestre pelo Google, jogador com Google em dois aparelhos, jogador sem conta Google, e agora o inventário (adicionar, remover item e apagar lançamento usam `FieldValue.delete()` no Firestore de verdade).

## A versão "artefato do Claude" da Mesa
Primeira versão, feita dentro do Claude (https://claude.ai/artifact/QZULvs7Nqj3v1FLPNXoEHz): usa o banco do próprio artefato e só funciona para quem tem conta no Claude. Está **parada** (não recebe as mudanças da versão GitHub) e a trava "jogador só edita a própria ficha" é só da tela. O Marcos escolheu a versão GitHub; considere aposentar o sabor `node build.js` (sem `gh`) quando não precisar mais dele. Os arquivos `ferramentas/ficha-mesa/artefato-claude/seed*` serviam para popular esse artefato com uma ficha e um NPC de exemplo.

## Histórico dos pull requests da Mesa
#3 Mesa inicial no GitHub · #4 login do mestre pelo Google · #5 vários mestres nas regras · #6 configuração do Firebase · #7 mensagens de erro do login mais claras · #8 jogadores entram só com o Google (sem código) e botão Sair.

## Observações sobre o ambiente em que isto foi feito
O Claude que montou isto trabalhava numa sessão sem push direto na `main` e sem acesso à internet fora do GitHub, por isso os merges foram feitos por pull request. Num computador normal basta o fluxo usual de git. O build e os testes funcionam offline.

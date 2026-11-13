# Mesa World Zero (versão do GitHub)

Página onde o mestre vê e edita todas as fichas e NPCs, e os jogadores veem as fichas e editam as próprias. Os dados ficam num banco gratuito do Firebase (Firestore), então tudo aparece na hora para todo mundo e funciona mesmo com o mestre offline.

Endereço depois de configurar: https://marcos-mili.github.io/WORLD-ZERO/mesa/

## Como funciona

- **Jogador:** qualquer pessoa pode entrar, com a conta Google (o nome vem da conta, ou ela digita outro). As fichas ficam ligadas à conta Google, então aparecem em qualquer aparelho. Cria, edita, duplica e exclui as próprias fichas. Vê as fichas dos outros e os NPCs que o mestre mostrar, só para ler. Quem não tem conta Google pode entrar só com o nome (aí as fichas ficam só naquele aparelho).
- **Mestre:** entra com a conta Google dele, pelo mesmo botão. Só quem está na lista de e-mails das regras vira mestre. Pode haver vários: para tirar ou pôr um mestre é só editar a lista e publicar de novo. Todos os mestres veem e editam tudo, inclusive NPCs ocultos e anotações (as anotações são um texto só), criam NPCs (ocultos até mostrar), ajustam PV e PM de qualquer ficha.
- A trava é de verdade: as regras do Firestore impedem que um jogador escreva na ficha de outro ou leia os NPCs ocultos.
- Sem configurar o Firebase, a página abre em **modo local** (as fichas ficam só naquele navegador).

## Passo a passo para ligar o Firebase (uns 10 minutos)

1. Entre em https://console.firebase.google.com com a sua conta Google e clique em **Criar um projeto**. Dê um nome (por exemplo `mesa-world-zero`). Pode desligar o Google Analytics. Clique em Criar.
2. Menu **Segurança > Authentication > Vamos começar**. Na aba **Método de login**, **Adicionar novo provedor > Google**, ligue **Ativar**, escolha o seu e-mail em "E-mail de suporte do projeto" e salve (é o login de mestres e jogadores). Ligue também **Anônimo** (é a opção para quem não tem conta Google).
3. Ainda em Authentication, aba **Configurações > Domínios autorizados > Adicionar domínio**: coloque `marcos-mili.github.io`. Sem isso o Google bloqueia o login.
4. Menu **Bancos de dados e armazenamento > Firestore Database > Criar banco de dados**. Escolha o modo de produção e um local (por exemplo `southamerica-east1`, São Paulo).
5. No Firestore, aba **Regras**: apague tudo, cole o conteúdo do arquivo `regras-firestore.txt`, troque os e-mails da lista dentro de `mestre()` pelos e-mails das contas Google dos mestres (em minúsculas, pode ter vários). Clique em **Publicar**.
6. Na engrenagem ao lado de "Visão geral do projeto" > **Configurações do projeto**, role até **Seus aplicativos**, clique no ícone web `</>`, dê um apelido (por exemplo `mesa`), deixe o Hosting desligado e clique em Registrar. Vai aparecer um bloco `firebaseConfig`. Copie.
7. Abra o arquivo `mesa/firebase-config.js` aqui no repositório e troque os `COLE_AQUI` pelos valores do bloco. Salve (commit). Em alguns minutos o GitHub Pages atualiza.

Os e-mails dos mestres ficam só nas regras do Firebase, não precisam estar neste repositório.

## Limites do plano gratuito

O plano gratuito do Firebase (Spark) dá 50 mil leituras e 20 mil escritas por dia, muito mais do que uma mesa usa. Se passar, a página avisa que o limite do dia foi atingido.

## Avisos

- O login do Google do mestre não funciona dentro de navegadores internos (Discord, Instagram). Abra no Chrome ou no Safari.
- Qualquer pessoa com o link consegue entrar como jogador e ler as fichas dos outros jogadores. Se isso virar problema, dá para voltar a exigir um código da mesa.
- O login do Google não funciona dentro de navegadores internos (Discord, Instagram). Abra no Chrome ou no Safari.
- Quem entra sem conta Google tem as fichas ligadas ao aparelho e navegador. Para trocar de aparelho, copie a ficha em Backup (aba Ficha) e importe no novo. O mestre sempre consegue editar qualquer ficha.

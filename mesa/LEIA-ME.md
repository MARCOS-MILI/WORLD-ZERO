# Mesa World Zero (versão do GitHub)

Página onde o mestre vê e edita todas as fichas e NPCs, e os jogadores veem as fichas e editam as próprias. Os dados ficam num banco gratuito do Firebase (Firestore), então tudo aparece na hora para todo mundo e funciona mesmo com o mestre offline.

Endereço depois de configurar: https://marcos-mili.github.io/WORLD-ZERO/mesa/

## Como funciona

- **Jogador:** entra com o nome e o código da mesa. Cria, edita, duplica e exclui as próprias fichas. Vê as fichas dos outros e os NPCs que o mestre mostrar, só para ler.
- **Mestre:** entra com a conta Google dele. Vê e edita tudo, cria NPCs (ocultos até ele mostrar), ajusta PV e PM de qualquer ficha e tem um campo de anotações só dele.
- A trava é de verdade: as regras do Firestore impedem que um jogador escreva na ficha de outro ou leia os NPCs ocultos.
- Sem configurar o Firebase, a página abre em **modo local** (as fichas ficam só naquele navegador).

## Passo a passo para ligar o Firebase (uns 10 minutos)

1. Entre em https://console.firebase.google.com com a sua conta Google e clique em **Criar um projeto**. Dê um nome (por exemplo `mesa-world-zero`). Pode desligar o Google Analytics. Clique em Criar.
2. Menu **Segurança > Authentication > Vamos começar**. Na aba **Método de login**, ligue **Anônimo** (é o login dos jogadores). Depois **Adicionar novo provedor > Google**, ligue **Ativar**, escolha o seu e-mail em "E-mail de suporte do projeto" e salve (é o login do mestre).
3. Ainda em Authentication, aba **Configurações > Domínios autorizados > Adicionar domínio**: coloque `marcos-mili.github.io`. Sem isso o Google bloqueia o login.
4. Menu **Bancos de dados e armazenamento > Firestore Database > Criar banco de dados**. Escolha o modo de produção e um local (por exemplo `southamerica-east1`, São Paulo).
5. No Firestore, aba **Regras**: apague tudo, cole o conteúdo do arquivo `regras-firestore.txt`, troque `SEU_EMAIL_DO_MESTRE` pelo e-mail da conta Google do mestre (em minúsculas) e `CODIGO_DA_MESA` por um código que você vai passar aos jogadores. Clique em **Publicar**.
6. Na engrenagem ao lado de "Visão geral do projeto" > **Configurações do projeto**, role até **Seus aplicativos**, clique no ícone web `</>`, dê um apelido (por exemplo `mesa`), deixe o Hosting desligado e clique em Registrar. Vai aparecer um bloco `firebaseConfig`. Copie.
7. Abra o arquivo `mesa/firebase-config.js` aqui no repositório e troque os `COLE_AQUI` pelos valores do bloco. Salve (commit). Em alguns minutos o GitHub Pages atualiza.

O código da mesa fica só com você. Não coloque ele neste repositório.

## Limites do plano gratuito

O plano gratuito do Firebase (Spark) dá 50 mil leituras e 20 mil escritas por dia, muito mais do que uma mesa usa. Se passar, a página avisa que o limite do dia foi atingido.

## Avisos

- O login do Google do mestre não funciona dentro de navegadores internos (Discord, Instagram). Abra no Chrome ou no Safari.
- As fichas de um jogador ficam ligadas ao aparelho e navegador onde ele entrou. Para trocar de aparelho, copiar a ficha em Backup (aba Ficha) e importar no novo. O mestre sempre consegue editar qualquer ficha.
- Quem apagar os dados do navegador perde a ligação com as fichas antigas (elas continuam no banco, e o mestre vê).

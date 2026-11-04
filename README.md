# World Zero 4.7.7

Livro de regras do RPG **World Zero** em formato de site, com busca em todo o livro, menu por capítulos e a aba "Andamento" (o que ainda falta terminar e o que foi alterado).

- Livro e sistema: **J.Carvalho_20**
- Site: **Marcos**

## Como o site funciona

O site é um arquivo só (`index.html`), sem servidor. O texto do livro está dentro dele.

## Como atualizar

Os arquivos que geram o site ficam na pasta `fonte/`:

- `livro.txt`: texto do livro
- `parse.py` e `build.py`: leem o texto e montam o site
- `template.html`: visual e funcionamento do site

Para gerar de novo (precisa do Python 3):

```
cd fonte
python3 build.py livro.txt
```

O resultado fica em `fonte/dist/index.html`. Copie esse arquivo para a raiz do repositório, no lugar do `index.html`.

## Ficha automática

A pasta `ficha/` tem a ficha de personagem automática (também um arquivo só, `ficha/index.html`). Ela calcula PV, PM, C.A., C.R., D.T., LCM e perícias a partir da raça, classe, nível e atributos, e tem abas de consulta de classes, raças, perícias, tabelas e qualidades. As fichas ficam salvas no próprio navegador.

Endereço: https://marcos-mili.github.io/WORLD-ZERO/ficha/

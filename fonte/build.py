#!/usr/bin/env python3
"""Gera o site do World Zero.

Uso: python3 -I build.py livro.txt
Saídas (pasta dist/):
  preview.html  fragmento para o Artifact
  index.html    página completa para o GitHub Pages
As duas versões têm a aba "Andamento" (o que falta terminar e o que foi alterado).
"""
import html
import json
import os
import re
import sys
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
BOOK = sys.argv[1]
sys.argv = ["parse", BOOK, os.devnull]
sys.path.insert(0, HERE)
import parse  # noqa: E402

sections, _ = parse.build()
data = parse.serialize(sections)

# ----------------------------------------------------------------- conferências automáticas
sg_count = Counter()   # (sec, título) -> sigilos na página
empty_tables = Counter()
for s in sections:
    for e in s["entries"]:
        sg_count[(s["id"], e["title"])] = sum(b["html"].count('class="sg"') for b in e["blocks"])
        for b in e["blocks"]:
            if b["html"].startswith("<div class='tw'>"):
                tds = re.findall(r"<td>(.*?)</td>", b["html"])
                if len(tds) >= 4 and sum(1 for t in tds if not t.strip()) / len(tds) >= 0.4:
                    empty_tables[(s["title"], e["title"])] += 1
print("tabelas quase vazias:", dict(empty_tables))
print("sigilos no total:", sum(sg_count.values()), "| correções de digitação:", sum(parse.TYPO_LOG.values()))

# ----------------------------------------------------------------- aba "Andamento"
id_of = {}
for s in data:
    for e in s["e"]:
        id_of[(s["id"], e["t"])] = e["id"]
sec_title = {s["id"]: s["t"] for s in data}


def esc(t):
    return html.escape(t, quote=False)


def link(sec, title, label=None):
    i = id_of.get((sec, title))
    label = esc(label or title)
    return f'<a href="#{i}">{label}</a>' if i else label


class Page:
    """Monta uma página com blocos numerados (data-b) e índice 'Nesta página'."""

    def __init__(self, pid, title):
        self.id, self.title, self.parts, self.nav = pid, title, [], []

    def add(self, h, nav=None):
        i = len(self.parts)
        self.parts.append(re.sub(r"^<(\w+)", lambda m: f"<{m.group(1)} data-b='{i}'", h, count=1))
        if nav:
            self.nav.append([i, nav])

    def head(self, text):
        self.add(f"<h4 class='sub'>{esc(text)}</h4>", nav=text)

    def entry(self):
        return dict(id=self.id, t=self.title, p=None, ln=0, nav=self.nav if len(self.nav) >= 3 else [], h="".join(self.parts))


def card(tag, cls, title, text, details=None, where=None):
    h = f"<div class='issue'><span class='sev {cls}'>{esc(tag)}</span><h4>{title}</h4>"
    if text:
        h += f"<p>{text}</p>"
    if details:
        h += "<ul>" + "".join(f"<li>{d}</li>" for d in details) + "</ul>"
    if where:
        h += "<div class='loc'>Ver na página: " + " ".join(where) + "</div>"
    return h + "</div>"


# ---- Falta terminar
todo = Page("andamento-1", "Falta terminar")
todo.add("<p class='it'>Tudo que ainda está incompleto, por fazer ou para conferir. Cada coisa continua no lugar dela no livro; "
         "esta página só reúne a lista. As páginas incompletas também têm um aviso no topo.</p>")

todo.head("Páginas incompletas")
for p in parse.PENDING:
    todo.add(card("Falta fazer", "alto", link(p["sec"], p["page"]), esc(p["what"]),
                  [esc(d) for d in p["detail"]], [link(p["sec"], p["page"], f"{sec_title[p['sec']]} › {p['page']}")]))

todo.head("Tabelas de evolução vazias")
todo.add("<p>Essas são as tabelas que estão sem os valores escritos. Os níveis marcados aqui ainda não têm nada.</p>")
rows = [
    ("racas", "Vampiro", "Vampiros de Cristal", "Evolução dos níveis 5, 10, 15 e 20"),
    ("racas", "Vampiro", "Vampiros Biomecânicos", "Evolução dos níveis 5, 10, 15 e 20"),
    ("classes", "Berserk de metal", "Brutalidade", "Cura e Pm dos níveis 2, 5, 9, 11 e 17"),
    ("classes", "O Visionário", "Habilidades por nível", "Níveis 2 a 20 (só o nível 1, Pincel, está escrito)"),
]
todo.add("<div class='tw'><table><thead><tr><th>Página</th><th>Tabela</th><th>O que falta</th></tr></thead><tbody>" +
         "".join(f"<tr><td>{link(sec, page)}</td><td>{esc(tab)}</td><td>{esc(miss)}</td></tr>" for sec, page, tab, miss in rows) +
         "</tbody></table></div>")
todo.add("<p class='it'>A tabela de evolução dos Vampiros Psíquicos está completa.</p>")

todo.head("Valores secretos (sigilos)")
todo.add("<p>Todo “?” do livro virou um sigilo no site: são valores que os jogadores ainda não sabem ou que ainda não foram feitos. "
         "Páginas com mais sigilos:</p>")
ranked = [(n, sec, t) for (sec, t), n in sg_count.items() if n > 0]
ranked.sort(key=lambda x: (-x[0], x[1], x[2]))
todo.add("<div class='tw'><table><thead><tr><th>Página</th><th>Sigilos</th></tr></thead><tbody>" +
         "".join(f"<tr><td>{link(sec, t)}</td><td>{n}</td></tr>" for n, sec, t in ranked) + "</tbody></table></div>")

todo.head("Para conferir")
todo.add(card("Conferir", "med", "Ranks que ficaram de fora do Sistema de Ranks",
              "O texto descreve os Ranks F, C, A, S e SSS. Os Ranks E, D e B (que aparecem na página inicial) não têm descrição.",
              None, [link("magias", "Sistema de Ranks de Poder")]))
todo.add(card("Conferir", "med", "Pontos de mana escritos de vários jeitos",
              "O livro escreve PM, Pm e pm. “PE” também aparece bastante (por exemplo no Assassino Mecânico). "
              "Se PE for outro recurso, está certo; se for o mesmo, vale padronizar.",
              None, [link("classes", "Assassino Mecânico")]))

# ---- Alterações feitas
done = Page("andamento-2", "Alterações feitas")
done.add("<p class='it'>Tudo que o site mudou em relação ao livro original. O livro em si não foi mexido: "
         "as mudanças existem só aqui no site. Páginas alteradas têm uma “Nota do site” no final.</p>")

done.head("Conteúdo corrigido")
for c in parse.CHANGES:
    done.add(card("Corrigido", "ok", esc(c["title"]), esc(c["text"]), None, [link(sec, t) for sec, t in c["pages"]]))

done.head("Títulos simplificados")
done.add("<p>Esses títulos mudaram para ficar mais fáceis de entender no site.</p>")
tl = [(a, b, sec) for a, b, sec in parse.TITLE_LOG if a != b]
done.add("<div class='tw'><table><thead><tr><th>No livro</th><th>No site</th></tr></thead><tbody>" +
         "".join(f"<tr><td>{esc(a)}</td><td>{esc(b)}</td></tr>" for a, b, sec in tl) + "</tbody></table></div>")
done.add("<p class='it'>A numeração “Capítulo 1, 5, 7…” saiu dos títulos. O menu agrupa tudo na ordem de leitura "
         "(Comece aqui, Criar personagem, Equipamento, Regras de jogo, O mundo).</p>")

done.head("Sigilos no lugar dos “?”")
done.add(card("Mudado", "med", "Marcadores “?” viraram sigilos",
              f"Os “?” que estavam no lugar de valores (“???”, “??d8”, “?? PV”) viraram sigilos: símbolos, letras soltas e "
              f"pontos de interrogação que mudam sozinhos, para dar ar de mistério. São {sum(sg_count.values())} no livro todo. "
              "A lista de páginas está em “Falta terminar”.", None, [f"<a href='#{todo.id}'>Ver Falta terminar</a>"]))

done.head("Mantido como está")
for title, text in [
    ("Piada “Meu saco” no Shinigami", "Fica. É de brincadeira e é para ficar."),
    ("Anões sem texto próprio", "Fica. A raça ainda não foi escrita (está em “Falta terminar”)."),
    ("Limite de mana nos níveis 19 e 20", "Fica. O salto é proposital."),
    ("Links de Instagram nos agradecimentos", "Ficam. Todo mundo confirmou que pode."),
]:
    done.add(card("Mantido", "baixo", esc(title), esc(text)))

done.head("Erros de digitação")
n_typo = sum(parse.TYPO_LOG.values())
done.add(f"<p>Foram corrigidas {n_typo} palavras e trechos com erro de escrita. Não é uma revisão completa: são só os erros "
         "que dava para ter certeza. Pode ter outros que passaram.</p>")
items = sorted(parse.TYPO_LOG.items(), key=lambda kv: (-kv[1], kv[0][0].lower()))
done.add("<details class='typos'><summary>Ver todas as correções (" + str(len(items)) + ")</summary><ul>" +
         "".join(f"<li>{esc(a)} → <b>{esc(b)}</b>" + (f" <small>({n}×)</small>" if n > 1 else "") + "</li>" for (a, b), n in items) +
         "</ul></details>")

andamento = dict(id="andamento", t="Andamento", e=[todo.entry(), done.entry()])

# ----------------------------------------------------------------- montagem
TEMPLATE = open(os.path.join(HERE, "template.html"), encoding="utf-8").read()
head, body = TEMPLATE.split("<!--body-->", 1)
ALL = data + [andamento]


def pack(d):
    return json.dumps(d, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")


def make(d):
    return (head + "<!--body-->" + body).replace("__DATA__", pack(d))


os.makedirs(os.path.join(HERE, "dist"), exist_ok=True)
preview = make(ALL)
open(os.path.join(HERE, "dist", "preview.html"), "w", encoding="utf-8").write(preview)

h2, b2 = preview.split("<!--body-->", 1)
full = (
    '<!doctype html>\n<html lang="pt-BR">\n<head>\n<meta charset="utf-8">\n'
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
    '<meta name="author" content="Marcos">\n'
    "<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}"
    "body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>\n"
    + h2 + "\n</head>\n<body>\n" + b2 + "\n</body>\n</html>\n"
)
open(os.path.join(HERE, "dist", "index.html"), "w", encoding="utf-8").write(full)
print("preview.html: %.2f MB | index.html: %.2f MB" % (len(preview.encode()) / 1e6, len(full.encode()) / 1e6))

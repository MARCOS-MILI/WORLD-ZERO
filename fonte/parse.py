#!/usr/bin/env python3
"""World Zero: converte o texto do livro em dados estruturados (seções > entradas > blocos HTML).

Uso: python3 -I parse.py livro.txt saida.json
"""
import collections
import html
import json
import re
import sys
import unicodedata

SRC, OUT = sys.argv[1], sys.argv[2]

# ----------------------------------------------------------------- correções de digitação
# Só erros óbvios. Tudo que for trocado aparece na página "Alterações feitas".
TYPO_LOG = collections.Counter()  # (antes, depois) -> vezes
WORD_FIXES = {
    "constiuição": "constituição", "tranformação": "transformação", "ecnologia": "tecnologia",
    "nstantâneo": "instantâneo", "oreografia": "coreografia", "subsititui": "substitui",
    "assasino": "assassino", "entrender": "entender", "instantâneamente": "instantaneamente",
    "projétils": "projéteis", "gatinlho": "gatilho", "acumele": "acumule", "pcooderes": "poderes",
    "mejorado": "melhorado", "recebê": "recebe", "inteligencia": "inteligência",
    "proficiencia": "proficiência", "instantaneo": "instantâneo", "variavel": "variável",
    "alguem": "alguém", "herois": "heróis", "maximo": "máximo", "padrao": "padrão",
    "varios": "vários", "nivel": "nível", "obvio": "óbvio", "proxima": "próxima",
    "passaro": "pássaro", "caido": "caído", "ínicio": "início", "acumulavel": "acumulável",
    "bonûs": "bônus", "bonus": "bônus", "emergencias": "emergências", "poderam": "puderam",
    "durantes": "durante", "oque": "o que", "danto": "dando",
}
PHRASE_FIXES = [
    (r"Espírito vagantes", "Espírito vagante"), (r"Homem-sapos", "Homem-sapo"),
    (r"samurai das alma(?!s)", "samurai das almas"), (r"mestre das máscara(?!s)", "mestre das máscaras"),
    (r"guerreiros precisão", "guerreiros precisam"), (r"suas palavras inspirados", "suas palavras inspiradoras"),
    (r"que comando um pelotão", "que comandam um pelotão"), (r"padrãovocê", "padrão você"),
    (r"conseguir vira fumaça", "consegue virar fumaça"), (r"conseguir fica \+3", "consegue ficar +3"),
    (r"desde do último", "desde o último"), (r"a mesm uma Dt", "a mesma Dt"),
    (r"marge se ameaça", "margem de ameaça"), (r"escama de dragons", "escama de dragão"),
    (r"lhe tando", "lhe dando"), (r"fi zesse", "fizesse"), (r"pŕedeterminado", "predeterminado"),
    (r"Eflo-luminosos", "Elfo-luminosos"), (r"Primeiro Moviment\b", "Primeiro Movimento"),
    (r"movimentoe/", "movimento/"), (r"Granada Lacrimogêneo", "Granada Lacrimogênea"),
    (r"incrustalas", "incrustá-las"),
]


def _case(src, new):
    if len(src) > 2 and src.isupper():
        return new.upper()
    return new[:1].upper() + new[1:] if src[:1].isupper() else new


def fix_typos(lines):
    word_rx = [(re.compile(r"(?<![A-Za-zÀ-ÿ0-9_])" + re.escape(w) + r"(?![A-Za-zÀ-ÿ0-9_])", re.I), n) for w, n in WORD_FIXES.items()]
    phr_rx = [(re.compile(p, re.I), n) for p, n in PHRASE_FIXES]
    out = []
    for line in lines:
        if "http" not in line:
            for rx, new in phr_rx + word_rx:
                def rep(m, new=new):
                    fixed = _case(m.group(0), new)
                    TYPO_LOG[(m.group(0), fixed)] += 1
                    return fixed
                line = rx.sub(rep, line)
        out.append(line)
    return out


LINES = fix_typos(open(SRC, encoding="utf-8").read().split("\n"))

# ----------------------------------------------------------------- sigilos (os "?" do livro)
SG_POOL = list("ΞΨΩΣΦΘΛΠЖЯЦЩБДЫ∆∑∞∴⊕⊗◊◆◇▲▽○◎░▒§¶†‡¤ÐÞØÆ#%&@$") + list("xzqkvwjyfh") + ["?"] * 14
_sg_n = [0]


def sigil_span(n):
    x = (_sg_n[0] * 2654435761 + 12345) & 0xFFFFFFFF
    glyphs = []
    for _ in range(n):
        x = (x * 1664525 + 1013904223) & 0xFFFFFFFF
        glyphs.append(SG_POOL[(x >> 8) % len(SG_POOL)])
    _sg_n[0] += 1
    delay = -((_sg_n[0] * 7) % 33) / 10
    return (f'<span class="sg" role="img" aria-label="informação oculta" '
            f'data-g="{html.escape("".join(glyphs), quote=True)}" style="--d:{delay}s;--n:{n}"></span>')


def sigilize(s):
    """Troca '?' de espaço reservado (e não de pergunta) por marcadores \\uE000n\\uE001."""
    out, pos = [], 0
    for m in re.finditer(r"\?+", s):
        i, j = m.span()
        n = j - i
        ok = n >= 2
        if not ok:
            k = i - 1
            while k >= 0 and s[k] == "*":
                k -= 1
            prev = s[k] if k >= 0 else " "
            if k < 0 or prev in " \t(:+/-–—>| ":
                ok = True
            elif prev in "dD" and k >= 1 and (s[k - 1].isdigit() or s[k - 1] == "?"):
                ok = True
        if ok:
            out.append(s[pos:i])
            out.append("\uE000%d\uE001" % max(3, min(6, n + 2)))
            pos = j
    out.append(s[pos:])
    return "".join(out)


def nav_clean(t):
    return re.sub("\uE000\\d+\uE001", "◈◈◈", sigilize(t))


# ----------------------------------------------------------------- utilidades
def norm(s):
    s = unicodedata.normalize("NFD", s.lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def plain(s):
    """Remove marcas de negrito/itálico e espaços sobrando."""
    s = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", s)
    s = s.replace("*", "")
    return re.sub(r"\s+", " ", s).strip()


def inline(s):
    """Markdown bagunçado do .docx -> HTML seguro (só negrito e links)."""
    links = []

    def keep(m):
        links.append((m.group(1), m.group(2)))
        return f"\u0000{len(links) - 1}\u0000"

    s = re.sub(r"\[([^\]]*)\]\(([^)\s]+)\)", keep, s)
    s = sigilize(s)
    parts = re.split(r"(\*{2,})", s)
    # conta alternâncias de negrito; se for ímpar, desiste do negrito neste trecho
    toggles = sum(1 for p in parts if p.startswith("**"))
    use_bold = toggles % 2 == 0
    out, bold, buf = [], False, []

    def flush():
        txt = "".join(buf)
        buf.clear()
        if not txt:
            return
        esc = html.escape(txt.replace("*", ""), quote=False)
        if bold and esc.strip():
            lead = esc[: len(esc) - len(esc.lstrip())]
            trail = esc[len(esc.rstrip()):]
            out.append(f"{lead}<strong>{esc.strip()}</strong>{trail}")
        else:
            out.append(esc)

    for p in parts:
        if p.startswith("**"):
            if use_bold:
                flush()
                bold = not bold
        else:
            buf.append(p)
    flush()
    res = "".join(out)
    res = re.sub("\uE000(\\d+)\uE001", lambda m: sigil_span(int(m.group(1))), res)

    def back(m):
        t, u = links[int(m.group(1))]
        t = html.escape(t.replace("*", "").strip() or u, quote=False)
        return f'<a href="{html.escape(u, quote=True)}" target="_blank" rel="noopener noreferrer">{t}</a>'

    res = re.sub(r"\u0000(\d+)\u0000", back, res)
    return re.sub(r"[ \t]{2,}", " ", res).strip()


BOLD_ONLY = re.compile(r"^(\*{2,}\s*[^*]*?\s*\*{2,}\s*)+$")
ITALIC_ONLY = re.compile(r"^\*[^*].*[^*]\*$|^\*[^*]\*$")
NUMERIC = re.compile(r"^[\d\s.,+\-–/ªº°%x]+$", re.I)


def cap(t):
    return t[:1].upper() + t[1:] if t else t


# ----------------------------------------------------------------- tokenizador
def tokenize():
    toks, i, n = [], 0, len(LINES)
    while i < n:
        raw = LINES[i]
        s = raw.strip()
        ln = i + 1
        if not s:
            i += 1
            continue
        m = re.match(r"^(#{1,6})\s+(.*)$", s)
        if m:
            lvl, txt = len(m.group(1)), m.group(2)
            # "título" que na verdade é um parágrafo inteiro (ou título + texto colado)
            title, rest = txt, ""
            sp = re.split(r"\s{3,}(?=\S)", re.sub(r"\*+\s*\*+", "**", txt), maxsplit=1)
            if len(sp) == 2 and len(plain(sp[0])) <= 60:
                title, rest = sp[0], sp[1]
            if len(plain(title)) > 90:
                toks.append(dict(k="p", ln=ln, raw=txt, bad_heading=True))
            else:
                toks.append(dict(k="h", ln=ln, lvl=lvl, title=plain(title), raw=txt))
                if rest.strip():
                    toks.append(dict(k="p", ln=ln, raw=rest, glued=True))
            i += 1
            continue
        if s.startswith("|"):
            rows, j = [], i
            while j < n and LINES[j].strip().startswith("|"):
                ln_s = LINES[j].strip()
                if re.match(r"^\|(\s*:?-{3,}:?\s*\|)+$", ln_s):
                    j += 1
                    continue
                cells = [c for c in re.split(r"(?<!\\)\|", ln_s)]
                cells = cells[1:-1] if ln_s.endswith("|") else cells[1:]
                rows.append(cells)
                j += 1
            toks.append(dict(k="t", ln=ln, rows=rows))
            i = j
            continue
        if re.match(r"^-\s+", s):
            toks.append(dict(k="li", ln=ln, raw=re.sub(r"^-\s+", "", s)))
            i += 1
            continue
        if BOLD_ONLY.match(s) and plain(s):
            toks.append(dict(k="sub", ln=ln, raw=s, text=plain(s)))
            i += 1
            continue
        toks.append(dict(k="p", ln=ln, raw=s, ital=bool(ITALIC_ONLY.match(s))))
        i += 1
    return toks


# ----------------------------------------------------------------- estrutura do livro
# (id, título do menu, regex do título onde a seção começa)
SECTIONS = [
    ("inicio", "Início", r"^__START__$"),
    ("atributos", "Atributos e mana", r"^Capítulo 1"),
    ("racas", "Raças", r"^Raças$"),
    ("classes", "Classes", r"^Classes$"),
    ("subclasses", "Subclasses", r"^Subclasses$"),
    ("pericias", "Perícias", r"^Perícias$"),
    ("personalizacao", "Personalização", r"^Capítulo 5"),
    ("equipamentos", "Equipamentos", r"^Equipamentos$"),
    ("combate", "Regras de combate", r"^Capítulo 7"),
    ("condicoes", "Condições", r"^Capítulo 8"),
    ("talentos", "Talentos", r"^Capítulo 9"),
    ("territorio", "Território amaldiçoado", r"^Capítulo 10"),
    ("divindades", "Divindades", r"^Divindades$"),
    ("gottes", "Gottes Strafe", r"^Capítulo 14"),
    ("treinamentos", "Treinamentos", r"^Capítulo 11"),
    ("mundanas", "Mundanas", r"^Mundanas"),
    ("casas", "Casas", r"^As casas"),
    ("magias", "Magias e emanações", r"^Sistema de Ranks de Poder"),
    ("armas", "Armas lendárias e míticas", r"^armas Lendárias"),
]

# títulos que NÃO viram página própria (ficam como subtítulo dentro da página anterior)
INLINE = {
    "classes": {"habilidades forma fisica", "habilidades forma de arma"},
    "equipamentos": {"armadura leves", "armadura medias", "armadura pesadas"},
    "treinamentos": {"como funciona", "progresso", "conclusao de linha", "intencao do sistema"},
    "magias": set(),
}
PARENT = {  # página filha -> título da página mãe
    "dark knight": "Caçador estiloso",
    "dark slayer": "Caçador estiloso",
    "devil bringer": "Caçador estiloso",
    "mysterious man": "Caçador estiloso",
}
SUBCLASSES = [
    "amaldiçoado", "antiquas", "caçador de monstros", "chapéu-preto",
    "espadachim negro", "guerreiro do tempo", "o chefe", "protetor",
]
_TF0 = {"o chefe": "O Chefe", "chapéu-preto": "Chapéu-preto"}


# títulos mais simples para o site (chave: título original sem acento e em minúsculas)
TITLE_LOG = []  # (antes, depois, seção)
TITLE_FIX = {
    **_TF0,
    "capitulo 1: atributos": "Atributos",
    "limite de canalizacao de mana (lcm)": "Limite de mana e backlash (LCM)",
    "capitulo 5: personalizacao": "Personalização",
    "capitulo 7: regra de combate": "Regras de combate",
    "mecanica de desvio e bloqueio": "Desvio e bloqueio",
    "capitulo 8: condicoes": "Condições",
    "capitulo 9: talentos": "Como funcionam os talentos",
    "defesa e controle ataques ofensivos": "Defesa e controle",
    "ataques ofensivos": "Ataques ofensivos",
    "ataques direcionados": "Ataques direcionados",
    "capitulo 10: territorio amaldicoado": "Território amaldiçoado",
    "capitulo 14: gottes strafe (manutencao)": "Gottes Strafe",
    "capitulo 11: treinamentos": "Treinamentos",
    "mundanas (manutencao)": "Mundanas",
    "as casas (manutencao)": "As casas",
    "niveis de danos": "Níveis de dano",
    "tipos de danos": "Tipos de dano",
    "evolucao das emanacao": "Evolução das emanações",
    "magias de dano": "Lista de magias",
    "deus do destino": "Deus do Destino e outras divindades",
    "modificacoes e criacoes": "Modificações e criações",
}
TITLE_FIX_N = {
    ("critico efeito", 1): "Efeitos de crítico",
    ("critico efeito", 2): "Dano médio e munições",
    ("critico", 1): "Mecânica de crítico",
}

CHANGES = []  # {"title", "text", "pages": [(sec_id, entry_title)]}


def _entry(sections, sec_id, title):
    for s in sections:
        if s["id"] == sec_id:
            for e in s["entries"]:
                if e["title"] == title:
                    return e
    return None


def _note(e, text):
    e.setdefault("notes", []).append(text)


def _reid(e):
    for i, b in enumerate(e["blocks"]):
        b["html"] = re.sub(r"\bid='b\d+'", f"id='b{i}'", b["html"], count=1)


PENDING = []  # o que ainda falta terminar: {"sec","page","what","detail":[...]}


def _pend(sections, sec, page, what, detail=None):
    e = _entry(sections, sec, page)
    if not e:
        return
    e["inc"] = (e["inc"] + " " if e.get("inc") else "") + what
    PENDING.append(dict(sec=sec, page=page, what=what, detail=detail or []))


def _remove_blocks(e, idxs):
    idxs = set(idxs)
    remap, kept = {}, []
    for i, b in enumerate(e["blocks"]):
        if i not in idxs:
            remap[i] = len(kept)
            kept.append(b)
    e["blocks"] = kept
    e["nav"] = [(remap[i], t) for i, t in e["nav"] if i in remap]
    _reid(e)


def _rename_sub(e, old, new, occurrence):
    seen = 0
    for i, b in enumerate(e["blocks"]):
        if b["html"].startswith("<h4") and b["text"] == old:
            seen += 1
            if seen == occurrence:
                b["html"] = b["html"].replace(old, new)
                b["text"] = new
                e["nav"] = [(j, new if j == i else t) for j, t in e["nav"]]
                return True
    return False


def apply_patches(sections):
    # 1. Bakudo #26 aparecia 6 vezes (1 preenchido + 5 modelos vazios)
    e = _entry(sections, "classes", "Shinigami")
    n = 0
    for b in e["blocks"]:
        if b["html"].startswith("<h4") and b["text"] == "Bakudo #26:":
            b["html"] = "<h4 class='sub'>Bakudo #" + sigil_span(4) + ":</h4>"
            b["text"] = "Bakudo #???:"
            n += 1
    if n:
        msg = (f"O título “Bakudo #26” aparecia 6 vezes. Ficou só o Kyokkō e os outros {n} modelos vazios "
               "foram trocados por “Bakudo #” com sigilo, já que ainda estão por fazer.")
        _note(e, msg)
        CHANGES.append(dict(title="Bakudo #26 repetido no Shinigami", text=msg, pages=[("classes", "Shinigami")]))

    # 2. Mestre das máscaras: poderes repetidos com custos diferentes. Fica o que gasta mais PV.
    e = _entry(sections, "classes", "Mestre das máscaras")
    for b in e["blocks"]:
        if b["html"].startswith("<ul>") and "Arma de Sangue" in b["text"]:
            items = re.findall(r"<li>.*?</li>", b["html"], flags=re.S)
            keep = [li for li in items if not re.match(r"<li>(?:<strong>)?\s*(Bênção de Sangue|Infecção de sangue)", li)]
            if len(keep) != len(items):
                b["html"] = "<ul>" + "".join(keep) + "</ul>"
                b["text"] = " • ".join(re.sub(r"<[^>]+>", "", li) for li in keep)
                msg = ("Bênção de sangue e Infecção de sangue apareciam duas vezes, com custos diferentes "
                       "(10 e 20 PV na Bênção, 15 e 30 PV na Infecção). Ficaram as versões que gastam mais PV: 20 PV e 30 PV.")
                _note(e, msg)
                CHANGES.append(dict(title="Poderes repetidos no Mestre das máscaras", text=msg,
                                    pages=[("classes", "Mestre das máscaras")]))
            break

    # 3. Caminho arcano (Mundanas): a segunda é a versão melhorada, então ganha outro título
    e = _entry(sections, "mundanas", "Mundanas")
    if e and _rename_sub(e, "Caminho arcano", "Caminho arcano aprimorado", 2):
        msg = ("A segunda “Caminho arcano” é uma versão melhorada da primeira (diz “melhorado”, tem +1 e valores maiores). "
               "Para as duas não ficarem com o mesmo nome, ela foi renomeada para “Caminho arcano aprimorado”.")
        _note(e, msg)
        CHANGES.append(dict(title="Caminho arcano repetido em Mundanas", text=msg, pages=[("mundanas", "Mundanas")]))

    # 4. Combo com Bola (Olho maldito): a segunda cópia sai
    e = _entry(sections, "classes", "Olho maldito")
    if e:
        hs = [i for i, b in enumerate(e["blocks"]) if b["html"].startswith("<h4") and b["text"] == "Combo com Bola"]
        if len(hs) == 2:
            end = next((i for i in range(hs[1] + 1, len(e["blocks"])) if e["blocks"][i]["html"].startswith("<h4")), len(e["blocks"]))
            _remove_blocks(e, range(hs[1], end))
            msg = ("“Combo com Bola” aparecia duas vezes, com o mesmo texto. Ficou a primeira cópia (6d8 de impacto). "
                   "A segunda foi removida; ela tinha 8d8 de impacto e a linha “Nível 19 - 17d8 de dano”. "
                   "Se esses valores forem os certos, é só avisar que a gente troca.")
            _note(e, msg)
            CHANGES.append(dict(title="Combo com Bola duplicado no Olho maldito", text=msg, pages=[("classes", "Olho maldito")]))

    # 5. Lista de efeitos de crítico repetida na página de dano médio
    e = _entry(sections, "equipamentos", "Dano médio e munições")
    if e:
        cut = next((i for i, b in enumerate(e["blocks"]) if b["text"].strip().upper().startswith("MECÂNICA DE DANO MÉDIO")), None)
        if cut:
            _remove_blocks(e, range(0, cut))
            msg = ("O começo desta página era a mesma lista de efeitos de crítico por arma (Arco, Bastão, Besta… Tiro) "
                   "que já existe em “Efeitos de crítico”. A cópia foi removida.")
            _note(e, msg)
            CHANGES.append(dict(title="Efeitos de crítico repetidos", text=msg,
                                pages=[("equipamentos", "Efeitos de crítico"), ("equipamentos", "Dano médio e munições")]))

    # 6. Os itens no fim da lista de magias ganham página própria, no começo de "Armas"
    e = _entry(sections, "magias", "Lista de magias")
    cut = next((i for i, b in enumerate(e["blocks"]) if b["text"].strip() == "Shinoyomi shinmei"), None) if e else None
    if cut:
        moved = e["blocks"][cut:]
        nav_moved = [(i - cut, t) for i, t in e["nav"] if i >= cut]
        e["blocks"] = e["blocks"][:cut]
        e["nav"] = [(i, t) for i, t in e["nav"] if i < cut]
        new = dict(id="armas-0", title="Armas e itens especiais", ln=e["ln"], parent=None,
                   blocks=moved, nav=nav_moved, raw_title="", manut=False)
        _reid(new)
        next(s for s in sections if s["id"] == "armas")["entries"].insert(0, new)
        msg = ("Os itens que estavam no final da lista de magias (Shinoyomi shinmei, Silence e Sculptor, Máscara sangrenta, "
               "Botas do dragão veloz, Carapaça do titio, Coroa de Satan, Espírito desanimado, Arcanista arcaico e Âncora abissal) "
               "foram para esta página nova, no começo de Armas. O texto não foi mexido.")
        _note(new, msg)
        CHANGES.append(dict(title="Itens separados da lista de magias", text=msg,
                            pages=[("armas", "Armas e itens especiais"), ("magias", "Lista de magias")]))

    # 8. A página dos deuses guarda todas as divindades: ganha um índice com o nome de cada uma
    e = _entry(sections, "divindades", "Deus do Destino e outras divindades")
    if e:
        keep = [(i, t) for i, t in e["nav"] if t.strip() in ("Relíquias", "Relação com os Outros Deuses")]
        gods = [(0, "Deus do Destino")]
        for i, b in enumerate(e["blocks"]):
            m = re.match(r"<p><strong>(.*?)</strong>", b["html"])
            if m and re.match(r"(Deus|Deusa|Víbora|Rei do inferno)", m.group(1)) and len(m.group(1)) <= 60:
                gods.append((i, m.group(1).strip()))
        e["nav"] = sorted(gods + keep)
        msg = ("Esta página junta o Deus do Destino e todas as outras divindades (Deus Dragão, Deus da Lua, Víbora celeste, "
               "Rei do inferno e outras), então o título foi trocado e ganhou uma lista “Nesta página” com o nome de cada uma. "
               "O texto não foi mexido.")
        _note(e, msg)
        CHANGES.append(dict(title="Deuses dentro da página do Deus do Destino", text=msg,
                            pages=[("divindades", "Deus do Destino e outras divindades")]))

    # 7. O que ainda falta terminar (banner na página + lista na aba Andamento)
    _pend(sections, "racas", "Anões",
          "Esta raça ainda não foi escrita. Por enquanto a página só repete o começo da descrição da Demon Weapon.")
    _pend(sections, "classes", "O Visionário",
          "Esta classe ainda é um modelo em branco.",
          ["Vida, perícias, mana e magias estão com sigilos no lugar dos valores.",
           "A tabela de habilidades por nível só tem o nível 1 (Pincel). Os níveis 2 a 20 estão vazios."])
    _pend(sections, "racas", "Vampiro",
          "Duas tabelas de evolução estão vazias.",
          ["Vampiros de Cristal: níveis 5, 10, 15 e 20 sem nada escrito.",
           "Vampiros Biomecânicos: níveis 5, 10, 15 e 20 sem nada escrito."])
    _pend(sections, "classes", "Berserk de metal",
          "A tabela de Brutalidade está sem os valores de cura e de Pm.",
          ["Níveis 2, 5, 9, 11 e 17: as colunas “cura” e “Pm” estão vazias."])
    _pend(sections, "classes", "Shinigami",
          "Cinco Bakudos ainda não foram feitos.",
          ["Aparecem como “Bakudo #” com sigilo, logo abaixo do Bakudo preenchido (Kyokkō)."])
    _pend(sections, "gottes", "Gottes Strafe", "O capítulo está marcado como “em manutenção” no livro.")
    _pend(sections, "mundanas", "Mundanas", "O capítulo está marcado como “em manutenção” no livro.")
    e = _entry(sections, "casas", "As casas")
    if e:
        titles = []
        bl = e["blocks"]
        for i, b in enumerate(bl):
            if b["html"].startswith("<h4") and (i + 1 >= len(bl) or bl[i + 1]["html"].startswith("<h4")):
                titles.append(b["text"].strip())
        _pend(sections, "casas", "As casas",
              "O capítulo está marcado como “em manutenção” no livro e a maioria das casas ainda não tem texto.",
              ["Só o Rei Dragão tem descrição. Sem texto: " + ", ".join(titles) + "."] if titles else [])
    _pend(sections, "armas", "Armas míticas", "Só tem uma arma, e dela só existe o dano (6d12).")
    _pend(sections, "armas", "Armas e itens especiais", "O item “Âncora abissal” está só com o título, sem texto.")


def build():
    toks = tokenize()
    sections = []  # {id,title,entries:[...]}
    cur_sec = None
    cur_ent = None
    seen_titles = {}

    def new_section(sid, title):
        nonlocal cur_sec
        cur_sec = dict(id=sid, title=title, entries=[])
        sections.append(cur_sec)

    def new_entry(title, ln, level=1, parent=None):
        nonlocal cur_ent
        base = cap(title)
        nk = norm(base)
        key = (cur_sec["id"], nk)
        seen_titles[key] = seen_titles.get(key, 0) + 1
        c = seen_titles[key]
        shown = TITLE_FIX_N.get((nk, c)) or TITLE_FIX.get(nk) or (base if c == 1 else f"{base} ({c})")
        if shown != base:
            TITLE_LOG.append((base, shown, cur_sec["title"]))
        cur_ent = dict(
            id=f"{cur_sec['id']}-{len(cur_sec['entries']) + 1}",
            title=shown, ln=ln, parent=parent, blocks=[], nav=[], raw_title=title,
            manut="MANUTEN" in title.upper(),
        )
        cur_sec["entries"].append(cur_ent)

    new_section("inicio", "Início")
    new_entry("Créditos e apresentação", 1)
    sec_ix = 1  # próxima seção a procurar

    def add(block, text, nav=None):
        cur_ent["blocks"].append(dict(html=block, text=text))
        if nav:
            cur_ent["nav"].append((len(cur_ent["blocks"]) - 1, nav))

    pending_li = []
    used_sub = set()

    def flush_li():
        nonlocal pending_li
        if pending_li:
            items = "".join(f"<li>{inline(x)}</li>" for x in pending_li)
            add(f"<ul>{items}</ul>", " • ".join(plain(x) for x in pending_li))
            pending_li = []

    for t in toks:
        if t["k"] != "li":
            flush_li()

        if t["k"] == "h":
            ttl = t["title"]
            # início de uma nova seção?
            if sec_ix < len(SECTIONS) and re.search(SECTIONS[sec_ix][2], ttl):
                sid, stitle, _ = SECTIONS[sec_ix]
                new_section(sid, stitle)
                sec_ix += 1
                new_entry(ttl, t["ln"])
                continue
            if t["lvl"] >= 4 or norm(ttl) in INLINE.get(cur_sec["id"], set()):
                add(f"<h3 class='in'>{html.escape(ttl)}</h3>", ttl, nav=ttl)
                continue
            if not cur_ent["blocks"] and cur_sec["entries"][-1] is cur_ent and cur_ent["raw_title"] == "":
                pass
            new_entry(ttl, t["ln"], parent=PARENT.get(norm(ttl)))
            continue

        if cur_sec["id"] == "subclasses" and t["k"] in ("sub", "p") and t["raw"].startswith("**"):
            m = re.match(r"^\*\*\s*([^*]+?)\s*\*\*\s*(.*)$", t["raw"])
            name = norm(m.group(1)) if m else ""
            if name in map(norm, SUBCLASSES) and name not in used_sub:
                used_sub.add(name)
                ttl = TITLE_FIX.get(name, plain(m.group(1)))
                new_entry(ttl, t["ln"])
                if plain(m.group(2)):
                    rest = m.group(2).strip()
                    add(f"<p class='it'>{inline(rest)}</p>", plain(rest))
                continue

        if t["k"] == "sub":
            txt = t["text"]
            shortish = 2 < len(txt) <= 70 and ":" not in txt
            sid = len(cur_ent["blocks"])
            add(f"<h4 class='sub' id='b{sid}'>{inline(t['raw'])}</h4>", txt, nav=nav_clean(txt) if shortish else None)
        elif t["k"] == "li":
            pending_li.append(t["raw"])
        elif t["k"] == "t":
            rows = [[c for c in r] for r in t["rows"]]
            if not rows:
                continue
            width = max(len(r) for r in rows)
            rows = [r + [""] * (width - len(r)) for r in rows]
            first = [plain(c) for c in rows[0]]
            has_head = bool(first[0]) and not NUMERIC.match(first[0]) and any(first)
            if has_head and len(rows) == 1:
                has_head = False
            body = rows[1:] if has_head else rows
            head_html = ""
            if has_head:
                head_html = "<thead><tr>" + "".join(f"<th>{inline(c)}</th>" for c in rows[0]) + "</tr></thead>"
            body_html = "".join(
                "<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>" for r in body
            )
            txt = " | ".join(" ; ".join(plain(c) for c in r) for r in rows)
            add(f"<div class='tw'><table>{head_html}<tbody>{body_html}</tbody></table></div>", txt)
        else:
            if t.get("ital") and not t.get("glued"):
                add(f"<p class='it'>{inline(t['raw'])}</p>", plain(t["raw"]))
            else:
                add(f"<p>{inline(t['raw'])}</p>", plain(t["raw"]))
    flush_li()

    # o "World zero" solto no topo vira só o título do livro (a home do site já mostra isso)
    first = sections[0]["entries"]
    if first and len(first[0]["blocks"]) == 1 and norm(first[0]["blocks"][0]["text"]) == "world zero":
        first.pop(0)
    sections[0]["title"] = "Agradecimentos"

    # limpeza: entradas vazias saem
    for sec in sections:
        sec["entries"] = [e for e in sec["entries"] if e["blocks"]]
    sections = [s for s in sections if s["entries"]]
    apply_patches(sections)
    return sections, toks


def serialize(sections):
    out = []
    for sec in sections:
        ents = []
        for e in sec["entries"]:
            parts = []
            for i, b in enumerate(e["blocks"]):
                h = b["html"]
                # marca cada bloco para busca/rolagem
                h = re.sub(r"^<(\w+)", lambda m: f"<{m.group(1)} data-b='{i}'", h, count=1)
                parts.append(h)
            item = dict(
                id=e["id"], t=e["title"], p=e["parent"], ln=e["ln"],
                nav=[[i, txt] for i, txt in e["nav"]] if len(e["nav"]) >= 4 else [],
                h="".join(parts),
            )
            if e.get("inc"):
                item["i"] = e["inc"]
            if e.get("notes"):
                item["no"] = e["notes"]
            ents.append(item)
        out.append(dict(id=sec["id"], t=sec["title"], e=ents))
    return out


if __name__ == "__main__":
    sections, toks = build()
    data = serialize(sections)
    json.dump(data, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    total = sum(len(s["e"]) for s in data)
    print(f"{len(data)} seções, {total} páginas, {len(json.dumps(data, ensure_ascii=False)) / 1e6:.2f} MB")
    for s in data:
        print(f"{s['t']:<30} {len(s['e']):>3} páginas")

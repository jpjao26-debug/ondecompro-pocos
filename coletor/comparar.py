"""Junta os catálogos, casa o mesmo produto entre mercados, guarda o histórico
e gera os arquivos que o app lê (site/dados/)."""
import re
from collections import defaultdict
from datetime import datetime, timedelta

from .comum import DADOS, SITE_DADOS, agora_br, hoje, ler_json, log, salvar_json, sem_acento

MERCADOS = {
    "sanmichel": {"nome": "San Michel", "cor": "#d2232a", "obs": "preço da loja online · retirada na Av. Mansur Frayha"},
    "supervale": {"nome": "Supervale", "cor": "#1f7a3a", "obs": "preço da loja online (SuperVale Online)"},
    "vilasul": {"nome": "Vila Sul", "cor": "#0d4f9e", "obs": "preço da loja online · Shopping Poços de Caldas"},
}

# ---------------------------------------------------------------- tamanho / unidade

_UNID = r"(kg|g|gr|mg|l|lt|litro|litros|ml|un|unid|unidades)"
_RE_TAM = re.compile(r"(\d+(?:[.,]\d+)?)\s*" + _UNID + r"\b", re.I)
_RE_MULTI = re.compile(r"(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*" + _UNID + r"\b", re.I)


def tamanho(nome):
    """Devolve (quantidade_em_unidade_base, base) — base 'kg', 'l' ou 'un'."""
    n = sem_acento(nome or "").lower()
    m = _RE_MULTI.search(n)
    if m:
        mult, qtd, un = float(m.group(1)), float(m.group(2).replace(",", ".")), m.group(3).lower()
    else:
        achados = [(float(q.replace(",", ".")), u.lower()) for q, u in _RE_TAM.findall(n)]
        pesos = [a for a in achados if a[1] not in ("un", "unid", "unidades", "mg")]
        escolhido = pesos[0] if pesos else (achados[0] if achados else None)
        if not escolhido:
            return None, None
        mult, (qtd, un) = 1.0, escolhido
    if un == "kg":
        return qtd * mult, "kg"
    if un in ("g", "gr"):
        return qtd * mult / 1000, "kg"
    if un == "mg":
        return None, None
    if un in ("l", "lt", "litro", "litros"):
        return qtd * mult, "l"
    if un == "ml":
        return qtd * mult / 1000, "l"
    return qtd * mult, "un"


_RE_QTD_EMB = re.compile(
    r"(?:\b(?:com|c/|cx|caixa|pack|pacote|kit|fardo|leve)\s*(?:com\s*)?)?(\d+)\s*"
    r"(?:un\b|uni\b|unis\b|unid|unidades|latas|garrafas|sach[eê]s|capsulas|c[aá]psulas|rolos|pacotes|barras|potes|"
    r"saquinhos|envelopes|tabletes|sticks|pe[cç]as|itens)", re.I)
_RE_LEVE = re.compile(r"\bleve\s*(\d+)", re.I)
_PALAVRAS_PACOTE = {"pack", "kit", "fardo", "combo", "multipack", "leve", "promocional"}


def embalagem(nome):
    """Quantas unidades vêm juntas (1 = unidade avulsa) e se é pack/kit."""
    n = sem_acento(nome or "").lower()
    m = _RE_LEVE.search(n) or _RE_MULTI.search(n) or _RE_QTD_EMB.search(n)
    qtd = int(m.group(1)) if m else 1
    # "Shampoo + Condicionador", "350+175ml": dois produtos juntos contam como kit
    pacote = bool(set(re.findall(r"[a-z]+", n)) & _PALAVRAS_PACOTE) or "+" in n
    return qtd, pacote


# ---------------------------------------------------------------- chave de comparação

_RUIDO = {"de", "da", "do", "com", "e", "em", "para", "tipo", "pacote", "caixa", "garrafa",
          "lata", "frasco", "sache", "pouch", "pote", "bandeja", "unidade", "unidades", "un", "c", "pct",
          "pet", "long", "neck", "embalagem", "economica"}


# "com gás" x "sem gás", "com sal" x "sem sal": nunca é o mesmo produto
_RE_COM_SEM = re.compile(r"\b(com|sem|c/|s/)\s*([a-z]{3,})")


def _com_sem(nome):
    pares = set()
    for prep, palavra in _RE_COM_SEM.findall(sem_acento(nome or "").lower()):
        pares.add(("sem" if prep in ("sem", "s/") else "com", palavra))
    return pares


def _conflito_com_sem(a, b):
    return any((("sem" if c == "com" else "com"), w) in b for c, w in a)


def _chave_marca(m):
    k = re.sub(r"[^a-z0-9]", "", sem_acento(m or "").lower())
    return None if len(k) < 3 or sem_acento(m or "").lower().strip() in _MARCA_GENERICA else k


def _marcas_batem(marca, marcas_grupo):
    """True se não dá para saber (sem marca de um dos lados) ou se alguma marca bate."""
    k = _chave_marca(marca)
    if not k or not marcas_grupo:
        return True
    return any(k in g or g in k for g in marcas_grupo)


def chave_nome(nome):
    """Chave de texto para casar produtos sem código de barras: palavras + tamanho."""
    q, base = tamanho(nome)
    n = sem_acento(nome or "").lower()
    n = _RE_MULTI.sub(" ", n)
    n = _RE_TAM.sub(" ", n)
    palavras = sorted(set(w for w in re.findall(r"[a-z0-9]+", n) if w not in _RUIDO and len(w) > 1))
    if not palavras or q is None:
        return None
    return " ".join(palavras) + f"|{round(q, 3)}{base}"


def _assinatura(nome):
    """(chave do tamanho, conjunto de palavras importantes)"""
    q, base = tamanho(nome)
    if q is None:
        return None, set()
    n = sem_acento(nome or "").lower()
    n = _RE_MULTI.sub(" ", n)
    n = _RE_TAM.sub(" ", n)
    pal = set(w for w in re.findall(r"[a-z0-9]+", n) if w not in _RUIDO and len(w) > 1)
    qtd, pacote = embalagem(nome)
    # pack, kit ou caixa com N unidades só casa com outro igual (antes juntava pack com unidade)
    return f"{round(q, 3)}{base}x{qtd}{'p' if pacote else ''}", pal


def _semelhanca(a, b, rigido=False):
    """Nota de 0 a 1; 0 quando não é o mesmo produto com segurança razoável."""
    if not a or not b:
        return 0.0
    inter = len(a & b)
    jac = inter / len(a | b)
    menor = min(len(a), len(b))
    # no máximo 2 palavras a mais (1 no modo rígido, usado para ofertas que só existem no encarte)
    contido = inter == menor and menor >= 3 and abs(len(a) - len(b)) <= (1 if rigido else 2)
    if jac >= 0.8 or (contido and jac >= 0.5):
        return jac
    return 0.0


# ---------------------------------------------------------------- histórico

# ---------------------------------------------------------------- marca (para o filtro do app)

_MARCA_GENERICA = {"diversos", "diverso", "generico", "generica", "sem marca", "outros", "outras", "variados",
                   "nao informado", "nao informada", "marca", "nenhuma", "na", "n/a", "-", "x",
                   # seções da loja que alguns sites põem no lugar da marca
                   "hortifruti", "hortifrutti", "hortifrutigranjeiros", "flv", "acougue", "padaria", "rotisseria",
                   "frios", "peixaria", "granel", "atacadao s/a", "atacadao s.a.", "atacadao",
                   "bandeiras"}


# no Shibata o "kg" marca bandeja/peça com peso aproximado: o preço é da embalagem, não do quilo
_KG_POR_EMBALAGEM = {"sanmichel", "supervale", "vilasul"}  # plataforma Vipcommerce (como o Shibata): "kg" é o preço da embalagem


def _por_quilo(p):
    return (p.get("unidade") or "").lower() == "kg" and p.get("mercado") not in _KG_POR_EMBALAGEM


def _vocabulario_marcas(todos):
    """Marcas que os sites informam -> forma de mostrar. Serve para achar a marca no nome
    dos produtos de mercados que não informam (Shibata, por exemplo)."""
    contagem = defaultdict(lambda: defaultdict(int))
    for p in todos:
        m = (p.get("marca") or "").strip()
        chave = sem_acento(m).lower().strip()
        if len(chave) < 3 or chave in _MARCA_GENERICA or chave in _RUIDO or chave.isdigit():
            continue
        contagem[chave][m] += 1
    vocab = {}
    for chave, formas in contagem.items():
        if sum(formas.values()) < 2:
            continue  # marca que aparece uma vez só costuma ser erro de cadastro
        forma = max(formas.items(), key=lambda x: x[1])[0]
        if forma.isupper() and len(forma) > 4:
            forma = forma.title()
        vocab[tuple(chave.split())] = forma
    return vocab


def _marca_do_grupo(ps, vocab):
    contagem = defaultdict(int)
    for p in ps:
        chave = tuple(sem_acento(p.get("marca") or "").lower().split())
        if chave in vocab:
            contagem[vocab[chave]] += 1
    if contagem:
        return max(contagem.items(), key=lambda x: x[1])[0]
    # sem marca informada: procura uma marca conhecida dentro do nome (a mais longa)
    for p in ps:
        pal = re.findall(r"[a-z0-9&'+]+", sem_acento(p["nome"]).lower())
        achada = None
        for i in range(len(pal)):
            for t in (3, 2, 1):
                seq = tuple(pal[i:i + t])
                if len(seq) == t and seq in vocab and (achada is None or t > len(achada)):
                    achada = seq
        if achada:
            return vocab[achada]
    return None


def _atualizar_historico(itens_por_id, data):
    """Guarda só mudanças de preço: {id: [[data, preço], ...]} (últimos 120 dias)."""
    caminho = DADOS / "historico_precos.json"
    hist = ler_json(caminho, {})
    limite = (datetime.strptime(data, "%Y-%m-%d") - timedelta(days=120)).strftime("%Y-%m-%d")
    for pid, item in itens_por_id.items():
        serie = hist.get(pid, [])
        if not serie or serie[-1][1] != item["preco"]:
            if serie and serie[-1][0] == data:
                serie[-1][1] = item["preco"]
            else:
                serie.append([data, item["preco"]])
        # mantém um ponto anterior ao limite para saber o preço "de antes"
        while len(serie) > 2 and serie[1][0] < limite:
            serie.pop(0)
        hist[pid] = serie
    salvar_json(caminho, hist)
    return hist


def _preco_anterior(serie, data):
    """Último preço registrado antes de hoje."""
    anteriores = [p for d, p in serie if d < data]
    return anteriores[-1] if anteriores else None


def _minimo_30d(serie, data):
    corte = (datetime.strptime(data, "%Y-%m-%d") - timedelta(days=30)).strftime("%Y-%m-%d")
    precos = [p for d, p in serie if d >= corte]
    antes = [p for d, p in serie if d < corte]
    if antes:
        precos.append(antes[-1])
    return min(precos) if precos else None


# ---------------------------------------------------------------- montagem

def montar(brutos, encartes, promos_encarte=None):
    data = hoje()
    promos_encarte = promos_encarte or []
    # só entra o que está disponível na loja de Poços de Caldas (sem estoque costuma ter preço antigo parado no site)
    todos = [p for lista in brutos.values() for p in lista if p.get("disponivel", True)]
    por_id = {p["id"]: p for p in todos}
    hist = _atualizar_historico(por_id, data)
    vocab_marcas = _vocabulario_marcas(todos)

    # 1) agrupa por código de barras
    grupos, sem_ean = defaultdict(list), []
    for p in todos:
        if (p.get("unidade") or "") == "kg":
            grupos["id:" + p["id"]].append(p)  # vendido por quilo: cada mercado mede de um jeito, não compara
        elif p.get("ean"):
            # alguns mercados usam o código do fardo na unidade avulsa: separa pela quantidade da embalagem
            grupos[f"ean:{p['ean']}x{embalagem(p['nome'])[0]}"].append(p)
        else:
            sem_ean.append(p)
    # índice por tamanho para achar candidatos parecidos
    por_tamanho = defaultdict(list)   # chave de tamanho -> [(k_grupo, palavras, mercados)]
    for k, ps in grupos.items():
        tk, pal = _assinatura(ps[0]["nome"])
        if tk:
            por_tamanho[tk].append([k, pal, {p["mercado"] for p in ps}, [x["preco"] for x in ps],
                                    {m for m in (_chave_marca(x.get("marca")) for x in ps) if m},
                                    set().union(*(_com_sem(x["nome"]) for x in ps))])
    # 2) quem não tem código de barras entra no grupo mais parecido (mesmo tamanho, outro mercado)
    sem_ean.sort(key=lambda p: p["mercado"])
    for p in sem_ean:
        tk, pal = _assinatura(p["nome"])
        if not tk or not pal:
            grupos["id:" + p["id"]].append(p)
            continue
        melhor, nota = None, 0.0
        cs = _com_sem(p["nome"])
        for cand in por_tamanho[tk]:
            if p["mercado"] in cand[2]:
                continue
            # "com X" x "sem X" (com gás x sem gás): outro produto
            if _conflito_com_sem(cs, cand[5]):
                continue
            # trava de segurança: nome parecido mas preço muito diferente costuma ser outro produto
            # (compara com o preço mais próximo do grupo: o atacado costuma ser bem mais barato)
            limite = 1.5 if p.get("encarte") else 2.0  # oferta só de encarte: nome curto, regra mais rígida
            if min(max(p["preco"], v) / max(0.01, min(p["preco"], v)) for v in cand[3]) > limite:
                continue
            n = _semelhanca(pal, cand[1], rigido=bool(p.get("encarte")))
            if n > nota:
                melhor, nota = cand, n
        if melhor and nota > 0:
            grupos[melhor[0]].append(p)
            melhor[2].add(p["mercado"])
            melhor[3].append(p["preco"])
            if _chave_marca(p.get("marca")):
                melhor[4].add(_chave_marca(p.get("marca")))
            melhor[5] |= cs
        else:
            k = "nome:" + " ".join(sorted(pal)) + "|" + tk
            if k in grupos:
                k = "id:" + p["id"]
            grupos[k].append(p)
            por_tamanho[tk].append([k, pal, {p["mercado"]}, [p["preco"]],
                                    {m for m in [_chave_marca(p.get("marca"))] if m}, set(cs)])

    id_para_k = {p["id"]: k for k, ps in grupos.items() for p in ps}
    for e in promos_encarte:
        e["k"] = id_para_k.get(e.get("id"))

    itens, comparaveis = [], []
    for k, ps in grupos.items():
        # um preço por mercado (se houver duplicado no mesmo mercado, fica o menor)
        por_mercado = {}
        for p in ps:
            atual = por_mercado.get(p["mercado"])
            # entre dois do mesmo mercado: prefere o pacote fechado ao vendido por quilo; depois o mais barato
            chave_p = ((p.get("unidade") or "") == "kg", p["preco"])
            if not atual or chave_p < ((atual.get("unidade") or "") == "kg", atual["preco"]):
                por_mercado[p["mercado"]] = p
        ref = max(ps, key=lambda p: (bool(p.get("foto")), len(p["nome"])))
        q, base = tamanho(ref["nome"])
        if _por_quilo(ref):
            q, base = 1.0, "kg"  # vendido por quilo: o preço já é por kg
        ofertas = {}
        for m, p in por_mercado.items():
            serie = hist.get(p["id"], [])
            ant = _preco_anterior(serie, data)
            ofertas[m] = {
                "p": p["preco"],
                "a": ant if ant and ant != p["preco"] else None,       # preço anterior
                "m30": _minimo_30d(serie, data),
                "pr": p.get("promo"),
                "at": p.get("atacado") or None,
                "u": p.get("url"),
                "d": p.get("disponivel", True),
                "n": p["nome"],
                "av": p.get("aviso"),
            }
        precos = sorted((o["p"], m) for m, o in ofertas.items())
        melhor = precos[0][1]
        economia = round(precos[-1][0] - precos[0][0], 2) if len(precos) > 1 else 0
        item = {
            "k": k,
            "n": ref["nome"],
            "f": ref.get("foto"),
            "c": ref.get("categoria") or "Outros",
            "q": round(q, 4) if q else None,
            "b": base,
            "o": ofertas,
            "best": melhor,
            "eco": economia,
        }
        marca = _marca_do_grupo(ps, vocab_marcas)
        if marca:
            item["mc"] = marca
        if _por_quilo(ref):
            item["pk"] = 1  # vendido por quilo (no carrinho, cada "+" é 1 kg)
        itens.append(item)
        if len(ofertas) > 1:
            comparaveis.append(item)

    # ------------------------------------------------ feed
    def pct(a, b):
        return round((a - b) / a * 100) if a else 0

    def confiavel(i):
        ps = [o["p"] for o in i["o"].values()]
        return max(ps) / min(ps) <= 2.2  # diferença absurda costuma ser produto casado errado

    mais_baratos = sorted(
        (i for i in comparaveis if i["eco"] >= 0.5 and confiavel(i)),
        key=lambda i: -pct(max(o["p"] for o in i["o"].values()), min(o["p"] for o in i["o"].values())),
    )
    baixaram = []
    for i in itens:
        for m, o in i["o"].items():
            if o["a"] and o["p"] < o["a"]:
                baixaram.append({"k": i["k"], "m": m, "de": o["a"], "por": o["p"], "pct": pct(o["a"], o["p"])})
    baixaram.sort(key=lambda x: -x["pct"])
    menor30 = []
    for i in itens:
        for m, o in i["o"].items():
            if o["a"] and o["m30"] is not None and o["p"] <= o["m30"] and o["p"] < o["a"]:
                menor30.append({"k": i["k"], "m": m})
    promocoes = []
    for i in itens:
        for m, o in i["o"].items():
            pr = o.get("pr")
            if pr and pr.get("preco_de"):
                promocoes.append({"k": i["k"], "m": m, "de": pr["preco_de"], "por": o["p"], "pct": pct(pr["preco_de"], o["p"])})
    promocoes.sort(key=lambda x: -x["pct"])

    feed = {
        "atualizado": agora_br().strftime("%d/%m/%Y %H:%M"),
        "data": data,
        "mercados": {m: v for m, v in MERCADOS.items() if m in brutos},
        "totais": {m: sum(1 for p in v if p.get("disponivel", True)) for m, v in brutos.items()},
        "comparaveis": len(comparaveis),
        "mais_baratos": [i["k"] for i in mais_baratos[:60]],
        "baixaram": baixaram[:80],
        "menor30": menor30[:80],
        "promocoes": promocoes[:120],
        "encartes": encartes,
        "promos_encarte": promos_encarte,
    }
    return itens, feed


def gerar(brutos, encartes, promos_encarte=None):
    itens, feed = montar(brutos, encartes, promos_encarte)
    itens.sort(key=lambda i: (-len(i["o"]), i["c"], i["n"]))
    salvar_json(SITE_DADOS / "itens.json", {"data": feed["data"], "itens": itens})
    salvar_json(SITE_DADOS / "feed.json", feed)
    log(f"App: {len(itens)} itens, {feed['comparaveis']} comparáveis entre mercados")
    return itens, feed

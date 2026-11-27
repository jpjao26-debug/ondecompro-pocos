"""Coletor das lojas online de Poços de Caldas que usam a plataforma Vipcommerce
(a mesma do Shibata de Ubatuba): San Michel, Supervale e Vila Sul.

Usa um navegador de verdade (Playwright, com o Edge do Windows). O robô abre a loja,
pega a lista de departamentos que o próprio site recebe e vai abrindo cada departamento
página por página (?page=N, como o site faz), lendo os produtos da resposta que a página recebe.
"""
import os
import re
import unicodedata

from .comum import ean_valido, log

LOJAS = {
    "sanmichel": {"nome": "San Michel", "url": "https://www.supersanmichel.com.br"},
    "supervale": {"nome": "Supervale", "url": "https://www.supervalesupermercados.com.br"},
    "vilasul": {"nome": "Vila Sul", "url": "https://www.vilasul.com.br"},
}

# se o site não entregar a lista de departamentos, tenta estes endereços
DEPARTAMENTOS_PADRAO = [
    "mercearia", "bebidas", "acougue", "frios-e-laticinios", "hortifruti", "padaria", "congelados",
    "limpeza", "higiene-e-perfumaria", "higiene-e-beleza", "bazar", "pet-shop", "petshop", "matinais",
]

TROCAR_PAGINA_JS = """
(caminho) => {
  history.pushState({}, '', caminho);
  window.dispatchEvent(new PopStateEvent('popstate', {state: {}}));
}
"""

LINKS_MENU_JS = r"""
() => [...new Set([...document.querySelectorAll('a[href*="/departamentos/"]')]
          .map(a => a.getAttribute('href').split('?')[0].replace(/^.*\/departamentos\//, '')))]
"""

_RASTREADORES = ("google", "facebook", "doubleclick", "hotjar", "clarity", "tiktok", "criteo", "vlibras",
                 "onesignal", "gstatic", "fullstory", "bing.com", "newrelic", "sentry", "dinamize", "cloudfront")


def _slug(t):
    t = unicodedata.normalize("NFKD", t or "")
    t = "".join(c for c in t if not unicodedata.combining(c)).lower()
    return re.sub(r"[^a-z0-9]+", "-", t).strip("-")


def _filtrar(route):
    """Não baixa fotos, fontes e rastreadores: a coleta fica bem mais rápida e leve."""
    req = route.request
    if req.resource_type in ("image", "media", "font") or any(r in req.url for r in _RASTREADORES):
        return route.abort()
    return route.continue_()


def _abrir_navegador(p):
    opcoes = {"headless": True, "args": ["--no-sandbox"]}
    if os.getenv("CHROME_PATH"):
        opcoes["executable_path"] = os.getenv("CHROME_PATH")
    elif os.name == "nt":
        opcoes["channel"] = os.getenv("NAVEGADOR", "msedge")   # usa o Edge que já vem no Windows
    nav = p.chromium.launch(**opcoes)
    ctx = nav.new_context(locale="pt-BR", viewport={"width": 420, "height": 900})
    ctx.route("**/*", _filtrar)
    return nav, ctx


def _departamentos_da_arvore(j):
    """Lê a árvore de departamentos que o site recebe: [(slug, nome), ...]."""
    saida = []
    lista = j.get("data") if isinstance(j, dict) else j
    if isinstance(lista, dict):
        lista = lista.get("departamentos") or lista.get("children") or []
    for d in lista or []:
        if not isinstance(d, dict):
            continue
        nome = d.get("descricao") or d.get("nome") or ""
        slug = d.get("link") or d.get("slug") or _slug(nome)
        if slug and nome:
            saida.append((slug.strip("/").split("/")[-1], nome.strip().title()))
    return saida


def _item_api(d, mercado, loja, categoria):
    """Converte um produto da resposta que a própria página recebe."""
    preco = float(d.get("preco") or 0)
    oferta = d.get("oferta") or None
    promo = None
    if d.get("em_oferta") and oferta and oferta.get("preco_oferta"):
        po = float(oferta["preco_oferta"])
        pa = float(oferta.get("preco_antigo") or 0) or None
        promo = {"preco": po, "tipo": oferta.get("nome") or "Oferta", "ate": None,
                 "preco_de": pa if pa and pa > po else None}
        preco = po
    if not preco:
        return None
    img = d.get("imagem")
    return {
        "mercado": mercado,
        "id": f"{mercado}:{d.get('produto_id')}",
        "nome": (d.get("descricao") or "").strip(),
        "marca": (d.get("marca") or {}).get("descricao") if isinstance(d.get("marca"), dict) else None,
        "ean": ean_valido(d.get("codigo_barras")),
        "preco": preco,
        "atacado": [],
        "promo": promo,
        "categoria": categoria,
        "unidade": (d.get("unidade_sigla") or "").lower() or None,
        "url": f"{loja}/produto/{d.get('produto_id')}/{d.get('link') or ''}",
        "foto": f"https://produto-assets-vipcommerce-com-br.br-se1.magaluobjects.com/250x250/{img}" if img else None,
        "disponivel": bool(d.get("disponivel", True)),
    }


def coletar(mercado, limite_paginas=None):
    from playwright.sync_api import sync_playwright

    cfg = LOJAS[mercado]
    loja, nome_loja = cfg["url"], cfg["nome"]
    pausa = int(float(os.getenv("VIP_PAUSA", "0.4")) * 1000)
    produtos, vistos = [], set()
    with sync_playwright() as p:
        nav, ctx = _abrir_navegador(p)
        pg = ctx.new_page()
        arvore = []
        pg.on("response", lambda r: arvore.append(r) if "/departamentos/arvore" in r.url else None)
        pg.goto(loja + "/", wait_until="domcontentloaded", timeout=90000)
        pg.wait_for_timeout(6000)
        try:
            pg.get_by_text("continuar e fechar", exact=False).first.click(timeout=3000)
        except Exception:
            pass
        topo = pg.inner_text("body")[:400]
        m = re.search(r"Retirar no endere[cç]o:\s*(.+)", topo)
        log(f"{nome_loja} · loja: {m.group(1).strip() if m else 'padrão do site'}")

        deps = []
        for r in arvore:
            try:
                deps = _departamentos_da_arvore(r.json())
                if deps:
                    break
            except Exception:
                pass
        if not deps:
            deps = [(s, s.replace("-", " ").title()) for s in (pg.evaluate(LINKS_MENU_JS) or DEPARTAMENTOS_PADRAO)]
        log(f"{nome_loja} · {len(deps)} departamentos: {', '.join(n for _, n in deps)}")

        for slug, nome in deps:
            pagina, total, antes = 1, 1, len(produtos)
            while pagina <= total:
                caminho = f"/departamentos/{slug}?page={pagina}"
                alvo = f"/produtos?page={pagina}&"
                j, ultimo_erro = None, ""
                # a cada 20 páginas recarrega tudo: a lista do site vai acumulando e pesando a memória
                for jeito in (("spa", "recarregar") if pagina % 20 != 1 else ("recarregar",)):
                    try:
                        with pg.expect_response(
                            lambda r: "/departamentos/" in r.url and alvo in r.url and "/filtros" not in r.url,
                            timeout=30000,
                        ) as resp:
                            if jeito == "spa":
                                pg.evaluate(TROCAR_PAGINA_JS, caminho)
                            else:
                                pg.goto(loja + caminho, wait_until="commit", timeout=90000)
                        j = resp.value.json()
                        break
                    except Exception as e:
                        ultimo_erro = e.__class__.__name__
                if j is None:
                    if pagina == 1:
                        log(f"{nome_loja} · {nome}: não abriu ({ultimo_erro}); pulando")
                        break
                    log(f"{nome_loja} · {nome} página {pagina}: falhou ({ultimo_erro}); seguindo")
                    pagina += 1
                    continue
                total = (j.get("paginator") or {}).get("total_pages") or 1
                if limite_paginas:
                    total = min(total, limite_paginas)
                for d in j.get("data") or []:
                    item = _item_api(d, mercado, loja, nome)
                    if item and item["id"] not in vistos:
                        vistos.add(item["id"])
                        produtos.append(item)
                if pagina % 50 == 0:
                    log(f"{nome_loja} · {nome}: página {pagina}/{total}")
                pagina += 1
                pg.wait_for_timeout(pausa)
            if len(produtos) > antes:
                log(f"{nome_loja} · {nome}: +{len(produtos) - antes} (total {len(produtos)})")
        nav.close()
    if not produtos:
        raise RuntimeError(f"{nome_loja}: nenhum produto lido")
    return produtos


if __name__ == "__main__":
    import sys
    m = sys.argv[1] if len(sys.argv) > 1 else "sanmichel"
    ps = coletar(m, limite_paginas=int(os.getenv("LIMITE", "1")))
    print(len(ps), ps[:2])

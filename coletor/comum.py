"""Funções compartilhadas pelos coletores do OndeCompro?"""
import json
import re
import time
import unicodedata
from datetime import datetime, timezone, timedelta
from pathlib import Path

import requests

RAIZ = Path(__file__).resolve().parent.parent
DADOS = RAIZ / "dados"            # dados brutos e histórico (ficam no repositório)
SITE_DADOS = RAIZ / "site" / "dados"  # o que o app lê

FUSO_BR = timezone(timedelta(hours=-3))

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36 OndeCompro/1.0 (uso pessoal)"
)


def agora_br():
    return datetime.now(FUSO_BR)


def hoje():
    return agora_br().strftime("%Y-%m-%d")


def sessao():
    s = requests.Session()
    s.headers.update({"User-Agent": USER_AGENT, "Accept": "application/json, text/html;q=0.9"})
    return s


def pegar_json(s, url, tentativas=4, pausa=1.0, **kw):
    """GET com novas tentativas e espera crescente (educado com o site)."""
    ultimo = None
    for i in range(tentativas):
        try:
            r = s.get(url, timeout=60, **kw)
            if r.status_code == 200:
                return r.json()
            ultimo = f"HTTP {r.status_code}"
            if r.status_code in (400, 401, 403, 404):
                break
        except (requests.RequestException, ValueError) as e:
            ultimo = str(e)
        time.sleep(pausa * (2 ** i) * 3)
    raise RuntimeError(f"Falha ao buscar {url}: {ultimo}")


def salvar_json(caminho, dados):
    caminho = Path(caminho)
    caminho.parent.mkdir(parents=True, exist_ok=True)
    tmp = caminho.with_suffix(caminho.suffix + ".tmp")
    tmp.write_text(json.dumps(dados, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    tmp.replace(caminho)


def ler_json(caminho, padrao=None):
    caminho = Path(caminho)
    if not caminho.exists():
        return padrao
    return json.loads(caminho.read_text(encoding="utf-8"))


def sem_acento(t):
    t = unicodedata.normalize("NFKD", t or "")
    return "".join(c for c in t if not unicodedata.combining(c))


def preco_br(texto):
    """'R$ 1.234,56' -> 1234.56"""
    if texto is None:
        return None
    m = re.search(r"(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})", str(texto))
    if not m:
        return None
    return float(m.group(1).replace(".", "") + "." + m.group(2))


def ean_valido(cod):
    """Confere o dígito verificador de um código de barras EAN-8/12/13/14."""
    if not cod:
        return None
    cod = re.sub(r"\D", "", str(cod))
    if len(cod) not in (8, 12, 13, 14):
        return None
    digitos = [int(c) for c in cod]
    verif = digitos.pop()
    soma = sum(d * (3 if i % 2 == 0 else 1) for i, d in enumerate(reversed(digitos)))
    if (10 - soma % 10) % 10 != verif:
        return None
    return cod.zfill(13) if len(cod) <= 13 else cod


def log(*a):
    print(agora_br().strftime("%H:%M:%S"), *a, flush=True)

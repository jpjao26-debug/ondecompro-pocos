"""Teste: quais mercados funcionam rodando nos servidores do GitHub (e não no PC).

Para cada coletor: lê só a 1ª página de cada departamento e procura os encartes.
Cada um roda separado, com limite de tempo, e o resultado vai para teste_nuvem.txt.
"""
import json
import os
import subprocess
import sys
import time

MODULOS = os.getenv("TESTAR", "vipcommerce:sanmichel,vipcommerce:supervale,vipcommerce:vilasul").split(",")
LIMITE_TEMPO = int(os.getenv("LIMITE_TEMPO", "600"))

FILHO = r"""
import json, sys, time, importlib
mod, arg = sys.argv[1], (sys.argv[2] if len(sys.argv) > 2 else None)
r = {}
t = time.time()
try:
    m = importlib.import_module("coletor." + mod)
    ps = m.coletar(arg, limite_paginas=1) if arg else m.coletar(limite_paginas=1)
    r["produtos"] = len(ps)
    r["exemplo"] = [(p.get("nome"), p.get("preco")) for p in ps[:3]]
except Exception as e:
    r["erro_produtos"] = f"{type(e).__name__}: {str(e)[:300]}"
r["seg_produtos"] = round(time.time() - t)
t = time.time()
if not arg and hasattr(m if 'm' in dir() else None, "encartes"):
    try:
        es = m.encartes()
        r["encartes"] = len(es)
        r["paginas_encarte"] = sum(len(e.get("imagens") or []) for e in es)
    except Exception as e:
        r["erro_encartes"] = f"{type(e).__name__}: {str(e)[:300]}"
    r["seg_encartes"] = round(time.time() - t)
print("RESULTADO=" + json.dumps(r, ensure_ascii=False))
"""


def main():
    linhas = [f"Teste na nuvem (servidor do GitHub) — {time.strftime('%d/%m/%Y %H:%M')}", ""]
    for item in MODULOS:
        mod, _, arg = item.strip().partition(":")
        cmd = [sys.executable, "-c", FILHO, mod] + ([arg] if arg else [])
        t = time.time()
        try:
            p = subprocess.run(cmd, capture_output=True, text=True, timeout=LIMITE_TEMPO)
            saida = p.stdout + p.stderr
            res = next((json.loads(l[10:]) for l in saida.splitlines() if l.startswith("RESULTADO=")), None)
            if res is None:
                res = {"erro": "terminou sem resultado", "fim_do_log": saida[-600:]}
        except subprocess.TimeoutExpired as e:
            res = {"erro": f"passou de {LIMITE_TEMPO // 60} min (travou ou muito lento)",
                   "fim_do_log": ((e.stdout or b"").decode(errors="replace") if isinstance(e.stdout, bytes) else (e.stdout or ""))[-600:]}
        ok = res.get("produtos") or res.get("encartes")
        linhas.append(f"{'OK  ' if ok else 'FALHOU'} {item.strip()} ({round(time.time() - t)} s)")
        linhas.append("     " + json.dumps(res, ensure_ascii=False))
        print(linhas[-2], linhas[-1], flush=True)
    open("teste_nuvem.txt", "w", encoding="utf-8").write("\n".join(linhas) + "\n")


if __name__ == "__main__":
    main()

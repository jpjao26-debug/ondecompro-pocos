"""Roda tudo: coleta as lojas online de Poços de Caldas, compara e gera os dados do app.

Uso:  python -m coletor.rodar                 (todas as lojas)
      MERCADOS=sanmichel python -m coletor.rodar
"""
import os
import sys
import traceback
from concurrent.futures import ThreadPoolExecutor, as_completed

from . import comparar, vipcommerce
from .comum import DADOS, ler_json, log, salvar_json

COLETORES = list(vipcommerce.LOJAS)   # sanmichel, supervale, vilasul


def main():
    escolhidos = [m.strip() for m in os.getenv("MERCADOS", ",".join(COLETORES)).split(",") if m.strip() in COLETORES]
    brutos, falhas = {}, []

    def coletar_um(m):
        log(f"Coletando {m}…")
        produtos = vipcommerce.coletar(m)
        salvar_json(DADOS / f"bruto_{m}.json", produtos)
        return produtos

    # as três lojas são sites diferentes, então coletamos todas ao mesmo tempo
    with ThreadPoolExecutor(max_workers=len(escolhidos) or 1) as pool:
        tarefas = {pool.submit(coletar_um, m): m for m in escolhidos}
        for t in as_completed(tarefas):
            m = tarefas[t]
            try:
                brutos[m] = t.result()
                log(f"{m}: {len(brutos[m])} produtos")
            except Exception:
                traceback.print_exc()
                falhas.append(m)
                antigo = ler_json(DADOS / f"bruto_{m}.json")
                if antigo:
                    log(f"{m}: usando a coleta anterior")
                    brutos[m] = antigo
    # quem não foi coletado agora entra com a última coleta (para o app não perder o mercado)
    for m in COLETORES:
        if m not in brutos:
            antigo = ler_json(DADOS / f"bruto_{m}.json")
            if antigo:
                brutos[m] = antigo
    if not brutos:
        log("Nenhuma loja coletada.")
        sys.exit(1)
    comparar.gerar(brutos, [], [])
    if falhas:
        log(f"Atenção: falha na coleta de {', '.join(falhas)}")
        if len(falhas) == len(escolhidos):
            sys.exit(1)


if __name__ == "__main__":
    main()

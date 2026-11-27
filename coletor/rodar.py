"""Roda tudo: coleta as lojas online de Poços de Caldas, compara e gera os dados do app.

Uso:  python -m coletor.rodar                 (todas as lojas)
      MERCADOS=sanmichel python -m coletor.rodar
"""
import os
import sys
import traceback

from . import comparar, vipcommerce
from .comum import DADOS, ler_json, log, salvar_json

COLETORES = list(vipcommerce.LOJAS)   # sanmichel, supervale, vilasul


def main():
    escolhidos = [m.strip() for m in os.getenv("MERCADOS", ",".join(COLETORES)).split(",") if m.strip() in COLETORES]
    brutos, falhas = {}, []

    # uma loja de cada vez: o PC fica leve (as três juntas deixavam o PC sem memória)
    for m in escolhidos:
        log(f"Coletando {m}…")
        try:
            brutos[m] = vipcommerce.coletar(m)
            salvar_json(DADOS / f"bruto_{m}.json", brutos[m])
            log(f"{m}: {len(brutos[m])} produtos")
        except Exception as e:
            traceback.print_exc()
            falhas.append(m)
            antigo = ler_json(DADOS / f"bruto_{m}.json") or []
            parcial = getattr(e, "parcial", None) or []
            if len(parcial) > len(antigo):
                log(f"{m}: usando o que deu para ler agora ({len(parcial)} produtos)")
                brutos[m] = parcial
                salvar_json(DADOS / f"bruto_{m}.json", parcial)
            elif antigo:
                log(f"{m}: usando a coleta anterior ({len(antigo)} produtos)")
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
        log(f"Atenção: falha na coleta de {', '.join(falhas)} (o app usa o que deu para ler)")


if __name__ == "__main__":
    main()

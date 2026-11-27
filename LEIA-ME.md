# OndeCompro em Poços de Caldas?

App pessoal (sem fins comerciais) que compara os preços dos mercados de Poços de Caldas.
Roda no mesmo PC do OndeCompro de Ubatuba, de segunda a sábado às 12:00 (junto com Ubatuba).

## Mercados

| Mercado | De onde vem o preço |
|---|---|
| San Michel | Loja online (supersanmichel.com.br) · retirada na Av. Mansur Frayha, 875 |
| Supervale | Loja online SuperVale Online (supervalesupermercados.com.br) |
| Vila Sul | Loja online (vilasul.com.br) · Shopping Poços de Caldas |

As três lojas usam a mesma plataforma (Vipcommerce, a mesma do Shibata), então um robô só
(`coletor/vipcommerce.py`) coleta as três, ao mesmo tempo. Não tem encarte, então não precisa de chave de IA.

## Instalar

1. Crie no GitHub um repositório **público** chamado `ondecompro-pocos` (sem README).
2. Dê dois cliques em `instalar.bat` e cole o endereço do repositório quando pedir.
3. No GitHub: Settings → Pages → Branch **gh-pages** → Save.
4. No celular, abra `https://SEU-USUARIO.github.io/ondecompro-pocos/` no Chrome e toque em **Instalar app**.

## Arquivos úteis

- `testar_lojas.bat` — teste rápido: lê só a primeira página de cada departamento das 3 lojas.
- `rodar_agora.bat` — roda a coleta completa agora.
- `publicar_site.bat` — envia o app (com os preços da última coleta) ao GitHub.
- `logs/` — o resumo de cada coleta.

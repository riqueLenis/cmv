# Sistema Estoque & CMV — fonte do htmlJoao.html

O `htmlJoao.html` (na pasta acima) é gerado a partir destes arquivos. Ele é um arquivo único: abre direto no navegador, funciona offline e salva os dados sozinho no navegador (IndexedDB). Na tela **Como usar** ficam o backup (.json), a restauração e o "Iniciar novo mês".

| Arquivo | O que é |
|---|---|
| `telas.dc.html` | Telas (mesmo layout do protótipo, agora com os campos editáveis) |
| `logica.js` | Regras/cálculos — seguem as fórmulas da planilha v12.1 |
| `importar_planilha.py` | Lê a planilha e gera `dados_planilha.json` (dados iniciais do sistema) |
| `build.py` | Junta tudo e gera `../htmlJoao.html` |
| `base/htmlJoao.prototipo.html` | Protótipo original (traz o runtime, React, fontes e logos usados no empacotamento) |

Para regerar depois de mudar algo:

```
python importar_planilha.py   # só se a planilha mudou (precisa de: pip install openpyxl)
python build.py
```

## Onde o sistema difere da planilha (de propósito)
- Entradas, produção e perdas são lançadas **por data** (como no protótipo); a semana é achada pela data: data inicial ≤ data < data final.
- No CMV, semana com faturamento mas sem estoque final mostra "Aguardando estoque final" em vez de "Dentro da meta" (o CMV % é o mesmo).
- O CMC usa as mesmas datas e o mesmo faturamento das semanas do CMV.

Verificação: um cenário de teste foi rodado na planilha original (no Excel) e no sistema; 524 de 525 valores conferidos são iguais (a diferença é o texto de status acima).

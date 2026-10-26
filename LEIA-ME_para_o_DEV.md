# Sistema de Controle de Estoque & CMV — Protótipo (JG Consultoria)

Este pacote é o **protótipo visual e funcional** do sistema. Ele foi feito a partir da planilha
`CONTROLE_DE_ESTOQUE_E_CMV_-_JG_CONSULTORIA_v12.1.xlsx` (inclusa) para mostrar **como as telas
devem ficar e como as regras devem funcionar**. Não é código de produção: os dados são de exemplo
e tudo fica só em memória (recarregou a página, volta ao exemplo).

**Para ver funcionando:** abra o link do protótipo que o João compartilhou com você e aperte **Play**.
É possível clicar em tudo, lançar, cadastrar, trocar ordem, imprimir etc.

## O que tem no pacote

| Arquivo | O que é |
|---|---|
| `prototipo/Main.dc.html` | Código-fonte do protótipo (HTML + CSS + JS). Todas as regras estão no `<script>` no fim do arquivo, função `renderVals()`. Ele roda dentro do editor onde foi feito (não abre sozinho no navegador). Use como referência de layout, textos e cálculos. |
| `logos/` | Logo da JG (original, versão branca e versão azul-marinho com fundo transparente). |
| `planilha_referencia/` | A planilha original, com todas as fórmulas. |

## Identidade visual

- Fundo cinza claro `#eef1f5`, cartões brancos, menu lateral azul-marinho `#0b1c30`, destaque `#16324f`.
- **Sem laranja.** Alerta/acima da meta em vermelho discreto `#8f1d1d`.
- Campos que o usuário preenche: azul-claro `#e8f1fb` (borda `#b9cfe8`). Automático: branco/cinza.
- Fontes: Inter (texto), Space Grotesk (títulos e números grandes), JetBrains Mono (rótulos e números de tabela).
- Logo da JG no topo do menu e no rodapé ("Método desenvolvido por"). No topo depois vai entrar outra logo do sistema.
- Rodapé de todas as impressões: "Método desenvolvido por João Gustavo Consultoria Empresarial · Food Service" + logo.

## Menu (mesma ordem das abas da planilha)

Como usar · Cadastro de insumos · Lista de contagem · Produção e entrada · Resumo produção · Perdas ·
Resumo perdas · CMV Semana 1 a 5 · Fechamento do mês · CMC compras · Estoque mínimo · Resumo fichas ·
Ficha rápida · FT 01 a FT 100 · Manual de montagem

## Regras principais (o mais importante)

### 1. Tudo é preso ao produto (CÓD), nunca à linha
- Cada insumo tem um CÓD fixo. Contagens, entradas, produção e perdas são gravadas **pelo CÓD**.
- Renomear um insumo muda o nome em todas as telas.
- Cadastrar um item novo **no meio da lista** (campo "Posição na contagem": topo, fim ou "depois de X") ou reordenar com ↑ ↓
  **não pode mexer em nenhuma quantidade já lançada** nos outros itens.
- "Na contagem? = Não" tira o item da Lista de contagem e do CMV.

### 2. Categorias
- O usuário cadastra categorias e define se cada uma **entra no CMV** (Sim/Não).
- Padrão: Insumos CMV (Sim), Embalagem, Limpeza, Operacional, Consumo, Outros (Não).
- As categorias aparecem no cadastro, no "Onde foi o dinheiro" do CMV, no Fechamento e no CMC.

### 3. Lançamentos por DATA (Produção e entrada / Perdas)
- Lançamento = Tipo (Entrada ou Produção), data, insumo, quantidade, responsável/obs.
- Perda = data, insumo, quantidade, motivo (Vencido, Estragou, Queda/Quebra, Erro de preparo, Sobra descartada, Outros).
- **A semana é descoberta pela data.** Cada CMV semanal tem data inicial (dia da contagem inicial) e data final (dia da contagem final).
- Entra no CMV da semana tudo com **data inicial ≤ data < data final**, ou seja, do dia da contagem inicial
  **até o dia anterior à contagem final**. Ex.: inicial 01/10, final 07/10 → pega de 01/10 a 06/10.
- A data inicial da semana seguinte = data final da anterior (automático, editável). Assim nenhum dia fica de fora.
- Mostrar isso escrito no CMV ("Entram neste CMV os lançamentos de 01/10 até 06/10…") e, no formulário de lançamento,
  "→ Vai para o CMV Semana X". Data fora de todas as semanas = aviso.

### 4. CMV semanal (5 semanas encadeadas)
- Semana 1: o usuário digita a **contagem inicial** (estoque inicial) e o estoque final.
- Semanas 2 a 5: estoque inicial = estoque final da semana anterior (automático).
- Colunas automáticas: Entradas e Produção (somadas por item a partir dos lançamentos do período).
- `Utilizado = Estoque inicial + Entradas + Produção − Estoque final` (só calcula depois que algum estoque final for lançado na semana).
- `R$ = qtde × valor unitário` (valor unit. = valor de compra ÷ qtd que rende).
- `CMV % = Utilizado (só categorias que entram no CMV) ÷ Faturamento da semana`. Meta padrão 35%.
- Faturamento é digitado no CMV **ou** no CMC (é o mesmo campo).
- Resumo geral (R$): estoque inicial, utilizado total, utilizado CMV, perdas, entradas, produção, estoque final.

### 5. Ordem da lista (contagem e digitação)
- 3 opções: **Ordem do cadastro**, **Alfabética (A–Z)**, **Por categoria + A–Z** (com título de cada categoria).
- A mesma escolha vale para a Lista de contagem (tela e impressão) **e** para a tabela de digitação do CMV.
- Lista de contagem **não mostra o código**, só o nome.

### 6. Estoque mínimo (fórmulas da planilha)
- Semana fechada = estoque final lançado.
- Média diária = média semanal ÷ dias de operação (7).
- Mínimo = média diária × prazo de reposição (2, ou o do item) × (1 + margem 20%).
- Ideal = mínimo + média diária × dias de cobertura (7).
- Atual = estoque final da última semana fechada. Situação: SEM USO / COMPRAR (atual ≤ mínimo) / OK.
- Sugestão de compra = ideal − atual. Itens em und/cx/pct arredondam para cima.

### 7. CMC (para quem não conta estoque)
- Notas de compra com data, fornecedor, nº, categoria e valor. A semana vem pela data.
- `CMC % = compras das categorias do CMV ÷ faturamento`. Compara com o CMV real (CMC − CMV).

### 8. Fichas técnicas (100 fichas)
- Ingredientes (até 20) e **embalagem em bloco próprio** (até 5, só itens da categoria Embalagem).
- Qtde em g/ml para itens em kg/L (o sistema divide por 1000). und/cx/pct por unidade.
- Canais: Salão, Retirada, App 1 (iFood), App 2. Taxas padrão no Resumo das fichas.
- `Preço sugerido = custo ÷ meta ÷ (1 − taxa do app)`. Salão usa só a receita, os outros usam receita + embalagem.
- `Lucro = preço − custo − preço × taxa`. Situação: PREJUÍZO (lucro < 0) / PREÇO BAIXO (preço < sugerido) / OK.
- Foto do prato (sai na impressão). Botão Imprimir ficha.

### 9. Manual de montagem
- Por produto: nome, categoria, descrição curta, padrão/observação e passos (foto + título + descrição), com reordenar e excluir.
- "Puxar da ficha técnica": cria 1 passo por ingrediente com a quantidade.
- Logo da empresa (cliente) enviada pelo usuário, sai no topo das impressões.
- Modelos de impressão (pode marcar vários; tudo sai em **um PDF único**, um modelo depois do outro):
  1. Painel de parede (camadas, 4 por folha A4 deitado, opção "passo 1 embaixo" para lanches)
  2. Painel de parede com fotos (cada produto numa faixa, passos **lado a lado na horizontal**, 3 por folha)
  3. Ficha passo a passo (1 produto por folha)
  4. Cartão de bancada (2 por folha)
  5. Personalizado: estilo + papel (A4, A3, A5, Carta ou tamanho livre em cm) + orientação + produtos por folha + tamanho das fotos
- Recomendação: gerar o PDF no servidor (cada página com o seu tamanho de papel).

### 10. Impressões
Lista de contagem, CMV da semana, Ficha técnica e Manual de montagem abrem uma pré-visualização em folha branca antes de imprimir.
Todas levam o rodapé com a logo da JG.

### 11. Avisos (toasts)
Todo botão de ação confirma o que aconteceu ("Entrada lançada… já somou no CMV Semana 3") ou avisa o que falta ("Informe a data").

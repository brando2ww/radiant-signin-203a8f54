## Objetivo

Em `/pdv/financeiro/demonstrativo-caixa` (aba Mensal), ao clicar numa linha do "Resumo Diário", abrir uma página dedicada do dia com KPIs e análises detalhadas para o gestor.

## Mudanças

### 1. Nova rota e página `DayStatement`

Criar `src/pages/pdv/financial/DayStatement.tsx`, rota `"/pdv/financeiro/demonstrativo-caixa/dia/:date"` (parâmetro `date` no formato `yyyy-MM-dd`). Registrar em `src/pages/PDV.tsx` no mesmo padrão de `CashierStatement` (`RoleRoute` com `canAccess={canAccess}`).

A página reutiliza `usePDVCashierStatement("daily", parsedDate)` — sem mudar o hook — e mostra:

**Cabeçalho**
- Botão "Voltar" → `navigate(-1)`.
- Título `Demonstrativo do dia DD/MM/YYYY` (`date-fns` + `ptBR`).
- Botão "Exportar CSV" do dia.

**KPIs principais (grid md:grid-cols-4 lg:grid-cols-6)**
- Total Vendido, Dinheiro, Cartão (Crédito+Débito), PIX, Voucher (se `total_voucher`), Sangrias.
- Linha extra: Nº de pedidos (= contagem de movements com `type='venda'`), Ticket médio (`totalSales / nº pedidos`), Diferença total (`Σ balance_difference`), Sessões (abertas/fechadas count), % Dinheiro / % Cartão / % PIX sobre total.

**Vendas por hora** (Card)
- BarChart `recharts` agrupando movements `type='venda'` por hora (`new Date(m.created_at).getHours()`), eixo X 0–23.

**Composição por método** (Card)
- BarChart horizontal somando Dinheiro, Crédito, Débito, PIX, Voucher, Delivery Online; mostra valor e % do total.

**Sessões do dia** (Card)
- Reutilizar a `SessionsTable` existente (exportar do `CashierStatement.tsx` ou copiar uma versão equivalente local — para evitar acoplamento, **mover** `SessionsTable` para `src/components/pdv/financial/SessionsTable.tsx` e importar nos dois lugares).

**Sangrias e suprimentos** (Card)
- Tabela com hora, tipo (sangria/suprimento/despesa), valor, descrição, operador (`profiles.full_name` via lookup pelos `processed_by` distintos).

**Diferenças de fechamento** (Card, só se houver sessões com `balance_difference != null` e |diff| > 0)
- Lista sessões com diferença, status (sem diferença / sobra / falta), justificativa completa, risco (`riskBadge`).

### 2. Tornar a linha do "Resumo Diário" clicável

Em `src/pages/pdv/financial/CashierStatement.tsx`, na tabela `Resumo Diário`:
- Adicionar `className="cursor-pointer hover:bg-muted/50"` na `TableRow`.
- `onClick={() => navigate(\`/pdv/financeiro/demonstrativo-caixa/dia/${day.date}\`)}` (importar `useNavigate`).

Sem alterações em hooks, queries, schema ou outros relatórios.

## Validação

1. Abrir Mensal, clicar numa linha do Resumo Diário → navega para `/pdv/financeiro/demonstrativo-caixa/dia/2026-05-05` (ou data clicada).
2. Conferir KPIs, vendas por hora, composição por método, sessões, sangrias, diferenças com justificativas.
3. Botão Voltar retorna ao mensal mantendo o mês selecionado (o estado é do histórico do browser).
4. Botão Exportar gera CSV do dia.

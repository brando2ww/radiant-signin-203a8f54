# Impressão de fechamento de caixa — cancelamentos, descontos e qualidade

## Problemas
1. **Cancelamentos e descontos não aparecem** no comprovante de fechamento. Hoje o relatório só lê `pdv_cashier_movements`, que registra apenas `venda`, `sangria` e `reforco` — cancelamentos vivem em `pdv_orders.status='cancelled'` e descontos em `pdv_orders.discount`, ambos vinculados à sessão por `cashier_session_id`.
2. **Cupom sai "apagado"** em impressoras térmicas 80mm: fonte `Courier New` 10–11 px, traços finos (1px dashed) e pouca diferença entre rótulos e valores.

## Escopo
Alterar apenas a função `printCashierReport` (e seu único caminho de chamada, em `Cashier.tsx` e `CloseCashierDialog.tsx`) — sem mexer em telas, totais ou regras de fechamento.

## Mudanças

### 1) Dados novos no relatório
Tornar `printCashierReport` `async` e, antes de montar o HTML, buscar via Supabase usando `session.id`:

- **Cancelamentos**:
  ```sql
  select order_number, total, cancellation_reason, cancelled_at
    from pdv_orders
   where cashier_session_id = :id and status = 'cancelled'
   order by cancelled_at;
  ```
- **Descontos concedidos**:
  ```sql
  select order_number, discount, total, closed_at
    from pdv_orders
   where cashier_session_id = :id
     and coalesce(status,'') <> 'cancelled'
     and coalesce(discount,0) > 0
   order by closed_at;
  ```

Renderizar duas novas seções no cupom (sempre que houver ≥ 1 linha):

- `CANCELAMENTOS` — total da seção (qtd + soma de `total`) e, abaixo, lista compacta `#pedido — motivo — R$ valor`.
- `DESCONTOS CONCEDIDOS` — total (qtd + soma de `discount`) e lista `#pedido — R$ desconto (de R$ total)`.

Se a consulta falhar, ignorar silenciosamente (não bloquear a impressão).

### 2) Qualidade da impressão térmica
No `<style>` do HTML do cupom:

- Trocar `font-family` para `Arial, Helvetica, sans-serif` (Courier costuma sair fino em térmicas).
- Subir tamanhos: body 13 px, `.row` 12 px → 13 px, `.section-title` 13 px, `.row.total` 14 px, `h1` 16 px.
- `font-weight: 700` para rótulos importantes e valores das linhas `total`; cor `#000` em tudo.
- Trocar divisores `1px dashed` por `2px solid #000` (e `1.5px solid` em `.section-title`).
- Aumentar `line-height` para `1.35` e `padding` das linhas para `2px 0`.
- Mantida a regra `@page { size: 80mm auto }`.

### 3) Pontos de chamada
- `handleFinalize` em `CloseCashierDialog.tsx` e `handleReprintLastCashier` em `Cashier.tsx` passam a `await printCashierReport(...)` (a UI já é não-bloqueante, basta ajustar a chamada).

## Fora de escopo
- Cancelamentos de comandas (`pdv_comandas`) — caso o usuário queira incluir depois, é só replicar o mesmo padrão por `cashier_session_id`.
- Mudar regra de risco, justificativas ou cálculo da gaveta.
- Alterar o layout do diálogo de fechamento.

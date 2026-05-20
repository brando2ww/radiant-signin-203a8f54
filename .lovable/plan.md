## Diagnóstico

A função `pdv_cancel_order` (migração `20260512183336`) bloqueia o cancelamento quando algum item tem `paid_quantity > 0` ou `charging_session_id IS NOT NULL`. No pedido `PDV925797` (Mesa 12) **todos** os itens têm `paid_quantity = quantity` — ou seja, **já estão pagos**, e ainda assim:

- `pdv_orders` continua `aberta` (deveria estar `fechado`).
- comanda `20260519-005` está `fechada` (correto para "entregue ao caixa") mas o fluxo nunca finalizou ela como paga.
- comanda `20260519-006` foi criada vazia (`em_cobranca`, subtotal 0) — clique acidental de "Cobrar".
- `pdv_payments` tem 5 lançamentos (R$ 1.361,90) registrados para o pedido.

Resumo: **o pagamento foi feito, mas o pedido não foi finalizado** (provavelmente o `PaymentDialog` travou após registrar os pagamentos individuais por produto).

Cancelar não resolve, porque a regra existe justamente para não apagar itens já pagos. O que precisa é **finalizar** este pedido.

## Solução

### 1. Migração para destravar este pedido específico
- Atualizar o `pdv_orders` `7f23829d-598a-4ce3-81df-6314ba2a5166` para `status = 'fechado'`, `closed_at = now()`.
- Atualizar a comanda `22bc9e51-…` (005) para `status = 'paga'` (todos os itens já têm `paid_quantity = quantity`).
- Atualizar a comanda `10f0cde1-…` (006, vazia) para `status = 'cancelada'`, `close_reason = 'Comanda vazia criada por erro - encerramento manual'`.
- Liberar a Mesa 12 (`pdv_tables.current_order_id = NULL`, `status = 'livre'`) caso ainda aponte para esse pedido.
- Também encerrar o pedido órfão `d26de848-…` (PDV246017, sem comandas ativas, aberto desde 09/05) marcando-o como `cancelada` com motivo "Pedido órfão sem comandas".

### 2. Função utilitária reutilizável `pdv_finalize_paid_order(p_order_id uuid, p_reason text)`
SECURITY DEFINER, mesmo padrão de `pdv_cancel_order`. Permite o caixa fechar um pedido em que **todos os itens já estejam totalmente pagos** (`SUM(paid_quantity) >= SUM(quantity)` em todas as comandas ativas e sem `charging_session_id` em aberto). Faz:
- Verifica permissão `cancel_item` (mesma do cancel).
- Valida que todos os itens estão pagos; se não, levanta exceção com mensagem clara.
- Marca comandas `aberta`/`em_cobranca`/`aguardando_pagamento` como `paga` (se tinham itens pagos) ou `cancelada` (se vazias, sem itens).
- Marca o pedido como `fechado` com `closed_at = now()`.
- Libera a mesa.
- Loga via `log_pdv_action`.

### 3. Botão "Finalizar pedido (itens já pagos)" no `PaymentDialog` / `ChargeSelectionDialog`
Quando o erro de cancelamento aparecer, ou quando a mesa estiver com 100% dos itens pagos mas pedido ainda aberto, mostrar um botão alternativo que chame `pdv_finalize_paid_order`. Isso evita que este caso volte a travar a operação no futuro.

## Não alterar
- A regra de bloqueio em `pdv_cancel_order` continua válida — não queremos permitir cancelamento que destrua pagamentos já lançados.
- Lógica de pagamento existente, comandas ativas normais, mesas com fluxo OK.

## Validação
- Após a migração, Mesa 12 fica livre, comanda 005 marcada como `paga`, pedido `fechado`. Histórico financeiro segue intacto.
- Nova função pode ser chamada manualmente via dashboard SQL no futuro, e via botão no caixa.

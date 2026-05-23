## Objetivo

Na coluna **Concluídos** de `/pdv/delivery/pedidos`, além do seletor de data, exibir a **sessão de caixa** correspondente (aberta ou histórica) com o **operador** que a abriu, e filtrar os pedidos concluídos pela sessão selecionada — não apenas pela data.

## Mudanças

### 1. Banco — rastrear operador na sessão (migration)

Hoje `pdv_cashier_sessions` só guarda `user_id` (dono do estabelecimento). Adicionar:

- `opened_by_user_id uuid` — quem abriu (auth.uid no momento da abertura)
- `closed_by_user_id uuid` — quem fechou
- Default backfill: `opened_by_user_id = user_id` para sessões existentes

### 2. Hook `usePDVCashier`

- No `openCashier.mutate`, gravar `opened_by_user_id: user.id`
- No `closeCashier.mutate`, gravar `closed_by_user_id: user.id`

### 3. Novo hook `useCashierSessions(date)`

Retorna todas as sessões (abertas + fechadas) do `visibleUserId` cujo intervalo `[opened_at, closed_at ?? now]` intersecta o dia selecionado, com join no `profiles` para pegar `full_name` do operador.

### 4. Componente `OrdersKanban` — coluna Concluídos

- Trocar o input de data por um bloco compacto com:
  - `Input type="date"` (mantém o seletor)
  - `Select` listando sessões daquele dia: rótulo `"Caixa #N — Operador (HH:mm → HH:mm | aberto)"`
  - Linha informativa abaixo: "Operador: Fulano · Abertura R$ X · Status: aberto/fechado"
- Filtro `completed`:
  - Se uma sessão estiver selecionada → `o.cashier_session_id === selectedSessionId`
  - Senão → comportamento atual (por data)
- Em cada card concluído, mostrar badge pequeno com o operador da sessão do pedido

### 5. Sem mudanças visuais nas demais colunas

Apenas a card lateral "Concluídos" muda. Manter cores e tokens do design system.

## Arquivos

- `supabase/migrations/<timestamp>_cashier_session_operator.sql` (novo)
- `src/hooks/use-pdv-cashier.ts` (gravar opened_by/closed_by)
- `src/hooks/use-cashier-sessions-by-day.ts` (novo)
- `src/components/delivery/OrdersKanban.tsx` (UI da coluna + filtro)

## Detalhes técnicos

- O FK lógico já existe: `delivery_orders.cashier_session_id` é setado por `delivery_assign_order_ticket` quando o pedido entra em `preparing`.
- `profiles.id = auth.users.id`, então `profiles.full_name` resolve o nome do operador via `opened_by_user_id`.
- O Select de sessões usa `'none'` internamente para "Todas (por data)", convertido para `null` no estado.

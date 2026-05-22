## Objetivo
Numerar comandas de forma sequencial por sessão de caixa: a cada caixa aberto a contagem reinicia em `001`, `002`, `003`... — independente de salão, balcão ou delivery.

## Como funciona hoje
- `comanda_number` é uma string `YYYYMMDD-NNN` calculada no cliente via `COUNT(*)` na tabela.
- Sem trava atômica → duas inserções simultâneas geram o mesmo número.
- Não há vínculo entre `pdv_comandas` e a sessão de caixa.

## Plano

1. **Vincular comanda à sessão de caixa**
   - Adicionar coluna `cashier_session_id uuid` em `pdv_comandas`, referenciando `pdv_cashier_sessions`.
   - Índice único parcial `(cashier_session_id, comanda_number)` para garantir números únicos por sessão.

2. **RPC atômica `pdv_next_comanda_number(p_owner uuid)`**
   - `SECURITY DEFINER`, `search_path = public`.
   - Busca a sessão ativa do `p_owner` (`closed_at IS NULL`, mais recente).
   - Se não houver sessão aberta → retorna erro `Caixa fechado` (já é regra do projeto).
   - Faz `SELECT ... FOR UPDATE` na linha da sessão (lock leve) e calcula `MAX(comanda_number::int) + 1` entre as comandas dessa sessão.
   - Retorna a string formatada `001`, `002`, ... (zero-padded em 3 dígitos).

3. **Frontend**
   - Em `src/hooks/use-pdv-comandas.ts`:
     - Remover `generateComandaNumber` client-side.
     - Antes do `insert`, chamar `supabase.rpc('pdv_next_comanda_number', { p_owner })` para obter o número.
     - Buscar `cashier_session_id` da sessão ativa (já disponível via `useCashier`) e gravar no insert.
   - Comandas criadas a partir de delivery/pedidos automáticos também passam pela mesma RPC.

4. **Backfill das comandas existentes**
   - Preencher `cashier_session_id` das comandas já criadas associando pelo `order.cashier_session_id` (quando existir) ou pela sessão aberta na data da comanda.
   - Renumerar somente as duplicatas existentes para não quebrar referências externas.

5. **Validar**
   - Abrir o caixa, criar várias comandas (salão + delivery em sequência) → 001, 002, 003.
   - Fechar e reabrir o caixa → próxima comanda volta para 001.
   - Tentar criar comanda com caixa fechado → bloqueado com mensagem clara.

## Detalhes técnicos
- O cast `comanda_number::int` funciona porque o novo formato é puramente numérico. Comandas antigas no formato `YYYYMMDD-NNN` permanecem como histórico e ficam fora do `MAX` por estarem em sessões antigas (ou fora da sessão ativa).
- O lock em `pdv_cashier_sessions` serializa apenas a geração de número da sessão atual — operações de outros caixas não são afetadas.
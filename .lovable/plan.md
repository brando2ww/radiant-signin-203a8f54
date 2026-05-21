## Atalho "À Prazo" no Modal de Cobrança

Permitir fechar a comanda atual lançando o valor como fiado para um cliente cadastrado em **Venda a Prazo**, direto do `PaymentDialog`, sem precisar abrir o fluxo F5.

### Comportamento

1. No `PaymentDialog`, junto aos métodos (Dinheiro/Cartão/PIX/VR), adicionar um 5º botão **"À Prazo"** (ícone `UserCheck`).
2. Quando selecionado, a área "Valor Recebido / Quick values" some e em vez disso aparece:
   - Combobox **"Cliente"** com busca por nome, listando apenas clientes ativos de `pdv_authorized_employees`. Mostra saldo devedor atual e limite ao lado.
   - Se `currentDebt + total > credit_limit` (e limite > 0), exibe campo **"Justificativa"** obrigatório (mesma regra do fluxo F5).
3. Botão "Confirmar" fica habilitado quando há cliente selecionado e justificativa (se aplicável). O valor cobrado = total da comanda (desconto já aplicado normalmente — sem split, sem troco).
4. Ao confirmar, chama a nova RPC `pdv_register_credit_sale_for_comanda` que, em uma única transação:
   - Lê o total e items da comanda.
   - Valida cliente ativo + limite (rejeita sem justificativa quando exceder).
   - Insere linha em `pdv_employee_consumption_entries` (status `pendente`, `comanda_id` preenchido, `items` snapshot, `total`, `operator_id`).
   - Marca a comanda como `pago` com `payment_method='fiado'`, gravando snapshot fiscal mínimo (sem `pdv_cashier_movements` — não há dinheiro recebido).
   - Recomputa totais da sessão para garantir consistência.
5. Sucesso: toast "Lançado a prazo para {cliente}", fecha o dialog, dispara `onSuccess` (mesma callback usada hoje, que invalida queries de comandas).

### Mudanças no banco

- Migration:
  - Nova RPC `pdv_register_credit_sale_for_comanda(p_comanda_id uuid, p_employee_id uuid, p_justification text default null)` retornando `(entry_id uuid, total numeric, new_debt numeric)`. `SECURITY DEFINER`, `search_path=public`.
  - Sem novas tabelas/colunas — `comanda_id` já existe em `pdv_employee_consumption_entries`.
  - Se houver `CHECK` no `payment_method` de `pdv_orders`/`pdv_comandas`, adicionar `'fiado'` ao conjunto permitido.

### Mudanças no código

- `src/components/pdv/cashier/PaymentDialog.tsx` — adicionar opção "À Prazo": novo botão, painel de seleção de cliente + justificativa, branch específico em `handleConfirm` que chama a nova RPC e bypassa `usePDVPayments`. Desabilita split/quick values/troco enquanto o método estiver ativo.
- `src/hooks/use-employee-consumption.ts` — exportar nova mutation `registerCreditSaleForComanda` que envelopa a RPC e invalida `pdv-emp-consumption-entries`, `pdv-authorized-employees`, `pdv-comandas` e `pdv-orders`.

### Fora de escopo (mantido como já está)

- Quitação posterior do fiado continua pelo botão F5 → "Quitar Saldo" ou pelo extrato do cliente em **Venda a Prazo**.
- Relatórios financeiros continuam separando vendas a prazo das vendas em caixa via `source='quitacao_consumo'` no momento da quitação.

Confirma para eu implementar?

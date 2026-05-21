## Módulo de Consumo de Funcionários (Fiado Interno)

Sistema completo: cadastro admin, lançamentos pelo caixa, quitação parcial/total, painel de controle.

---

### 1. Banco de dados (migration)

**Nova tabela `pdv_authorized_employees`** (funcionários autorizados ao fiado):
- `user_id` (owner), `full_name`, `role_title`, `avatar_url`, `credit_limit numeric default 0` (0 = sem limite), `is_active boolean default true`, `internal_notes`, timestamps.
- RLS: owner + establishment members podem ver; somente admin (proprietário/gerente) pode insert/update/delete. Operadores (caixa/garçom) apenas SELECT.

**Nova tabela `pdv_employee_consumption_entries`** (cada lançamento de consumo):
- `user_id` (owner), `employee_id` (FK), `operator_id` (uuid quem lançou), `total numeric`, `items jsonb` (snapshot de produtos: id, nome, qty, preço, modifiers), `comanda_id` (opcional para rastrear baixa de estoque), `paid_amount numeric default 0`, `status text` ('pendente'|'pago_parcial'|'pago'), `over_limit_justification text`, `created_at`.
- RLS: owner + members podem ver/inserir; update apenas de paid_amount/status via RPC.

**Nova tabela `pdv_employee_consumption_payments`** (quitações):
- `user_id`, `employee_id`, `entry_id` (nullable — quitação pode amortizar múltiplos), `amount numeric`, `cashier_session_id`, `operator_id`, `payment_method text default 'dinheiro'`, `created_at`.
- Cada quitação cria também movimento em `pdv_cashier_movements` (type='venda' ou novo type 'quitacao_consumo'? Reusar `venda` com `payment_method='dinheiro'` e `source='quitacao_consumo'` ou criar dedicado). **Proposto:** inserir em `pdv_cashier_movements` com `type='venda'`, `payment_method='dinheiro'`, `notes='Quitação consumo — {nome}'` para entrar no caixa.

**RPC `pdv_register_employee_consumption(employee_id, items jsonb, justification)`**:
- Cria `pdv_orders` + `pdv_comandas` virtuais (fonte 'consumo_funcionario'), insere itens em `pdv_comanda_items`, chama `consume_ingredients_for_comanda_items` para baixar estoque, fecha comanda como 'pago_interno' sem cobrar, e insere registro em `pdv_employee_consumption_entries`.
- Valida `credit_limit` e exige justificativa se exceder.

**RPC `pdv_settle_employee_consumption(employee_id, amount, session_id)`**:
- Aplica valor nos entries em ordem FIFO atualizando `paid_amount`/`status`.
- Insere `pdv_cashier_movements` (entrada em dinheiro no caixa).
- Insere `pdv_employee_consumption_payments`.

**Migração de dados**: tabela antiga `pdv_employee_consumption` permanece (legado), nova estrutura coexiste. Diálogo atual (`EmployeeConsumptionDialog`) será descontinuado/removido.

---

### 2. Frontend — Admin (cadastro)

**Rota nova** `/pdv/funcionarios-consumo` — adicionada em `PDVHeaderNav` na seção "Administrador" (após "Usuários"), com guard de role admin.

**Página `EmployeeConsumptionAdmin.tsx`**:
- Header com KPIs: Total em aberto, Total quitado no mês, Maior devedor.
- Tabs: "Funcionários" | "Lançamentos" | "Extrato".
- **Funcionários**: grid de cards (avatar/iniciais, nome, cargo, badge saldo devedor vermelho/verde, limite, status). Busca + filtros (status, com/sem dívida). Botão "Novo funcionário".
- **Drawer de cadastro/edição** (Sheet lateral): nome, cargo, upload de avatar (bucket existente), limite de crédito (CurrencyInput), switch ativo, textarea observação.
- **Lançamentos**: tabela com filtros (funcionário, período, status). Exportar CSV/PDF (reutilizar `csv-export.ts`).
- **Extrato**: ao clicar num funcionário, drawer com timeline consumos + quitações e saldo corrente.

**Hook `use-authorized-employees.ts`**: CRUD via React Query.
**Hook `use-employee-consumption-entries.ts`**: lista, agregados de saldo, exportação.

---

### 3. Frontend — Frente de Caixa (operador)

**Substituir `EmployeeConsumptionDialog`** atual por novo `EmployeeConsumptionFlowDialog.tsx` aberto a partir do botão "Consumo" (F5) já existente em `Cashier.tsx`.

Fluxo em etapas (Tabs internas ou steps):
1. **Modo**: "Novo lançamento" | "Quitar saldo".
2. **Selecionar funcionário** (busca, lista apenas `is_active=true` para lançamento; lista todos com saldo>0 para quitação). Mostra saldo devedor.
3a. **Lançamento — seleção de produtos**: reusar componente de busca de produtos do PDV (`ProductGrid`/`ProductSearch` existente em comandas). Carrinho lateral com qty.
3b. **Quitação**: lista entries pendentes (data, valor, restante), campo "Valor recebido" (CurrencyInput), distribuição FIFO automática.
4. **Resumo**: itens/valor, saldo atual + novo saldo, alerta se exceder limite (com Textarea de justificativa obrigatória).
5. **Confirmar**: chama RPC correspondente, toast, fecha dialog, invalida queries (cashier movements, employee balances).

---

### 4. Integrações

- Após lançamento: invalida `pdv-stock`, `pdv-cashier-movements` (estoque baixa, mas movimentação de caixa só ocorre na quitação).
- Após quitação: movimento aparece como entrada de dinheiro no caixa e no demonstrativo (`Demo. Caixa`), separado das vendas normais via `source`/`notes`.
- `use-user-role` usado para esconder aba admin de operadores.

---

### 5. Arquivos a criar/editar

**Criar:**
- `src/pages/pdv/EmployeeConsumptionAdmin.tsx`
- `src/components/pdv/employee-consumption/EmployeeFormSheet.tsx`
- `src/components/pdv/employee-consumption/EmployeeCard.tsx`
- `src/components/pdv/employee-consumption/EmployeeStatement.tsx`
- `src/components/pdv/cashier/EmployeeConsumptionFlowDialog.tsx`
- `src/hooks/use-authorized-employees.ts`
- `src/hooks/use-employee-consumption-entries.ts`
- `src/hooks/use-employee-consumption-payments.ts`

**Editar:**
- `src/App.tsx` (nova rota)
- `src/components/pdv/PDVHeaderNav.tsx` (item de menu Administrador)
- `src/pages/pdv/Cashier.tsx` (trocar dialog antigo pelo novo flow)
- Remover `EmployeeConsumptionDialog.tsx` antigo e `use-pdv-employee-consumption.ts`

---

### Pontos a confirmar

1. **Avatar**: usar bucket existente `user-uploads` no padrão `{userId}/...` está OK?
2. **Movimento de caixa na quitação**: registrar como `type='venda'` com `source='quitacao_consumo'` (entra no total de vendas) ou criar um novo `type` específico para aparecer separado nos relatórios? Recomendo **novo source** mas `type='venda'` para fluxo padrão de caixa.
3. **Permissão de edição/exclusão**: somente `proprietario` e `gerente`, ou exclusivo `proprietario`?

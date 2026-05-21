## Renomear "Consumo de Funcionários" → "Venda a Prazo"

Alteração apenas de UI/labels (sem mexer em rota, tabelas, RPCs ou lógica).

### Arquivos a editar

- `src/pages/pdv/EmployeeConsumptionAdmin.tsx` — título da página, descrição, botão "Novo funcionário" → "Novo cliente", textos de KPIs e abas onde aparecer "funcionário".
- `src/components/pdv/PDVHeaderNav.tsx` — item de menu "Consumo Funcionários" → "Venda a Prazo".
- `src/components/pdv/cashier/EmployeeConsumptionFlowDialog.tsx` — título do dialog e textos visíveis (modo lançamento/quitação) trocando "funcionário" por "cliente".
- `src/components/pdv/employee-consumption/AuthorizedEmployeeFormSheet.tsx` — título "Novo/Editar Funcionário" → "Novo/Editar Cliente" e descrição.
- `src/components/pdv/employee-consumption/EmployeeStatementSheet.tsx` — título do extrato.
- `src/pages/pdv/Cashier.tsx` — label do botão F5 "Consumo" mantém-se, mas tooltip/descrição passa a "Venda a Prazo".

### Não alterar

- Rota `/pdv/funcionarios-consumo` (mantém URL para não quebrar links salvos).
- Nomes de tabelas (`pdv_authorized_employees`, `pdv_employee_consumption_*`), RPCs e `source='quitacao_consumo'`.
- Nomes de arquivos/componentes/hooks no código.

Quer que a URL também mude para `/pdv/venda-a-prazo` (com redirect da antiga)?

## Problema

Após editar um funcionário (e enviar foto), a tela trava — não aceita cliques até recarregar. Causa: o Sheet de edição é aberto diretamente a partir de um `DropdownMenu` (menu ⋮), sem o deferral exigido pelo padrão de dialogs do projeto. O Radix deixa `pointer-events: none` no body porque o menu ainda está em processo de desmontagem quando o Sheet abre.

A memória `dialog-interaction-standards` já documenta esse exato caso: abrir Dialog/Sheet a partir de DropdownMenu exige `setTimeout(..., 0)`.

## Correção

Em `src/pages/pdv/EmployeeConsumptionAdmin.tsx`:

1. Deferir a abertura do form sheet ao clicar em "Editar" no menu ⋮:
   ```ts
   const handleEdit = (e) => {
     setEditing(e);
     setTimeout(() => setFormOpen(true), 0);
   };
   ```

2. Deferir também a abertura do `EmployeeStatementSheet` ("Ver extrato") pelo mesmo motivo:
   ```ts
   onClick={() => setTimeout(() => setStatementEmp(emp), 0)}
   ```

3. Em `AuthorizedEmployeeFormSheet.tsx`, trocar o `useMemo` usado como efeito colateral por `useEffect` (correção de uso, evita warnings e comportamento inesperado de reset de estado).

Nenhuma alteração de lógica de negócio ou de banco — só o fluxo de UI.

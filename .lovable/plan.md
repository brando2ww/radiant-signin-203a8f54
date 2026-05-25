## Adicionar exclusão do tenant + clarificação sobre estado dos módulos

### Sobre "os já habilitados"
Os toggles já refletem o estado real do banco. Conferi: este tenant só tem 1 linha em `tenant_modules` (PDV) e ela está com `is_active = false`. Por isso aparece desligado. A inserção em `create-tenant` já cria com `is_active = true`, então algum toggle anterior desligou o PDV. Para reativar, basta clicar o switch — ele já faz upsert. Sem mudança necessária aqui.

### Excluir tenant
1. **`src/hooks/use-tenants.ts`**: adicionar `deleteTenant(tenantId)` que faz `DELETE` em `tenants` (cascade já remove `tenant_modules`, `tenant_integrations`, `establishment_users`). Invalida `["tenants"]` no sucesso.

2. **`src/pages/super-admin/TenantDetail.tsx`**:
   - Adicionar botão **"Excluir tenant"** (variant `destructive`, ícone `Trash2`) no header, ao lado do título.
   - Usar `AlertDialog` (shadcn) para confirmação, mostrando o nome do tenant e avisando que a ação é irreversível e remove usuários/módulos/integrações.
   - Ao confirmar, chamar `deleteTenant(id)`, exibir toast e navegar para `/admin/tenants`.

Sem migração de banco.
## Adicionar módulo "Tarefas" no cadastro de tenant

O super-admin precisa poder liberar o módulo de tarefas/checklists ao criar/editar um tenant, como já faz para PDV, Delivery, Financeiro, etc.

### Mudanças

**1. `src/components/super-admin/ModuleSelector.tsx`**
Adicionar nova entrada na lista `availableModules`:
```
{ value: "tarefas", label: "Tarefas", description: "Checklists operacionais e tarefas diárias" }
```

**2. `src/hooks/use-user-modules.ts`**
Incluir `'tarefas'` no tipo `UserModule` para que o `hasModule('tarefas')` seja tipado corretamente.

**3. `src/pages/PDV.tsx`**
Envolver as rotas `tarefas`, `tarefas/checklists/novo` e `tarefas/checklists/:id` (e o item de menu correspondente) com `<ModuleGuard module="tarefas">`, para que só apareçam/funcionem para tenants que tenham o módulo liberado.

### Fora de escopo
- Não criar página nova nem alterar o `AdminSidebar`.
- Não migrar dados de tenants existentes — quem já usa hoje precisará receber o módulo manualmente pelo painel do super-admin (a tabela `tenant_modules` aceita a string nova sem alteração de schema).
- Não tocar em `SuperAdminGuard`, RLS ou outras telas.

### Detalhes técnicos
- O valor `"tarefas"` é gravado como string em `tenant_modules.module`, igual aos outros módulos — nenhuma migração de banco necessária.
- `ModuleGuard` já mostra o aviso padrão "Módulo não disponível" quando o tenant não tem acesso.

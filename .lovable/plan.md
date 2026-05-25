## Mostrar todos os módulos do sistema na edição do tenant

Hoje a seção **Módulos Habilitados** lista só linhas existentes em `tenant_modules`. Quero exibir a lista completa de módulos do sistema (a mesma do `ModuleSelector`) com toggle por módulo.

### Mudanças

1. **`src/components/super-admin/ModuleSelector.tsx`**
   - Exportar a constante `availableModules` para reuso.

2. **`src/hooks/use-tenants.ts`**
   - Adicionar `upsertTenantModule(tenantId, module, isActive)` que faz `upsert` em `tenant_modules` por `(tenant_id, module)`, ativando/desativando a linha. Se não existir, cria.

3. **`src/pages/super-admin/TenantDetail.tsx`**
   - Importar `availableModules` e o novo `upsertTenantModule`.
   - Renderizar todos os itens de `availableModules` (label + descrição), buscando o estado atual no array `modules` (ativo somente se existir linha com `is_active = true`).
   - Trocar `handleToggleModule` para usar `upsertTenantModule` e recarregar/atualizar `modules` localmente após o sucesso.

Sem migração de banco; o upsert depende de uma unique constraint em `(tenant_id, module)` — se não existir, fallback: select → update OR insert.
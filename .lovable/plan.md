## Objetivo
Unificar os módulos `pdv` e `delivery` numa única opção "PDV + Delivery" no painel Super Admin (criação e edição do tenant). Ao ativar/desativar, os dois slugs são ligados/desligados juntos no banco. A separação interna (slugs distintos no DB e nas rotas) é mantida para não quebrar o `module-routes` nem o sidebar.

## Mudanças

**`src/components/super-admin/ModuleSelector.tsx`**
- Substituir as duas entradas `pdv` e `delivery` por uma só:
  `{ value: "pdv", label: "PDV + Delivery", description: "Ponto de venda, salão, comandas, pedidos online e cardápio digital", bundledWith: ["delivery"] }`
- No `toggle()`, ao alternar um módulo com `bundledWith`, aplicar a mesma ação (incluir/remover) também para os slugs do bundle.
- Estado `selected` continua sendo lista plana de slugs (`pdv` e `delivery` aparecem ambos quando ativos).
- Exibir como "selecionado" quando todos os slugs do bundle estiverem em `selected`.

**`src/pages/super-admin/TenantDetail.tsx`**
- Importar `availableModules` já refatorado.
- Na renderização, para cada entrada com `bundledWith`, considerar `isActive` apenas se TODOS os slugs (próprio + bundled) estiverem ativos em `modules`.
- Em `handleToggleModule`, quando o módulo tiver `bundledWith`, fazer `upsertTenantModule` sequencial para `pdv` e `delivery` com o mesmo `nextActive` antes de recarregar.

Sem mudanças em DB, rotas, sidebar, ou hook `useUserModules` — eles continuam tratando `pdv` e `delivery` como módulos independentes.
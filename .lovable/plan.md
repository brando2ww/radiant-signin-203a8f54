# Corrigir exclusão de produtos no delivery

## Diagnóstico

Tentei excluir "Produto Teste" e "Sushi Mix 54 Peças" pelo cardápio. As ações abrem o diálogo de confirmação, mas o produto não some. Investiguei e encontrei dois problemas combinados:

1. **RLS bloqueia silenciosamente** — A policy de DELETE em `delivery_products` exige `auth.uid() = user_id`. Como o sistema usa o padrão multi-usuário por estabelecimento (staff/funcionário acessa dados do dono via `use-establishment-id`), quando um usuário que não é o dono `d9087102…` tenta excluir, o Postgres devolve 0 linhas afetadas **sem erro**. O frontend interpreta como sucesso, mas o produto permanece. As mesmas policies já existem para `pdv_products` e usam `is_establishment_member`, mas as de `delivery_products` ficaram desatualizadas.
2. **Hook não detecta exclusão zerada** — `useDeleteProduct` não verifica quantas linhas foram afetadas, então sempre exibe "Produto excluído com sucesso", mascarando o problema.

Bônus: há um `Sushi Mix 54 Peças` duplicado no banco (2 registros). Após o fix, ambos poderão ser excluídos normalmente.

## Plano

### 1. Migração SQL (RLS)
Alinhar `delivery_products`, `delivery_categories`, `delivery_product_options`, `delivery_product_option_items` e `delivery_product_recipes` ao padrão de membros do estabelecimento:

- DROP nas policies atuais de UPDATE/DELETE/INSERT que usam apenas `auth.uid() = user_id`.
- Recriar usando `public.is_establishment_member(user_id)` (ou `auth.uid() = user_id OR is_establishment_member(user_id)` para manter compatibilidade), igual já fazemos no PDV.
- Manter as policies de SELECT como estão (já cobrem staff via `use-establishment-id`).

### 2. `src/hooks/use-delivery-products.ts`
No `useDeleteProduct`:
- Trocar o `.delete().eq("id", id)` por `.delete().eq("id", id).select("id")` e, se o array retornar vazio, lançar erro `"Sem permissão para excluir este produto"`.
- Mesma proteção em `useUpdateProduct` para evitar atualizações silenciosas.

### Detalhes técnicos
- Função `is_establishment_member(uuid)` já existe em `public` e é a mesma usada nas RLS do PDV (memory: Staff RLS Authorization).
- FKs já estão configuradas com `ON DELETE CASCADE` (options/recipes) e `SET NULL` (order_items), então não há bloqueio por integridade referencial.
- Nenhuma alteração necessária no `MenuTab.tsx` / `ProductList.tsx` — eles já tratam `onError` corretamente.

## Fora do escopo
- Limpar o `Sushi Mix 54 Peças` duplicado (o usuário pode excluir manualmente após o fix).
- Revisar policies de outros módulos delivery (cupons, drivers, etc.) — só mexerei se o usuário pedir.

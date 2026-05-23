**Problema encontrado**
- A exclusão já chegou no Supabase, então não é mais erro de permissão/RLS.
- O erro real é no banco: `delivery_order_items.product_id` está como `NOT NULL`, mas a chave estrangeira foi alterada para `ON DELETE SET NULL`.
- Quando o produto é excluído, o banco tenta preservar o item do pedido antigo com `product_id = NULL`, mas a coluna não permite `NULL`, gerando: `null value in column "product_id" violates not-null constraint`.

**Plano de correção**
1. Criar uma migration para permitir `NULL` em `delivery_order_items.product_id`.
   - Isso mantém o histórico dos pedidos antigos usando `product_name`, `quantity`, `unit_price` e `subtotal`.
   - O produto poderá ser apagado sem apagar pedidos já realizados.

2. Manter a chave estrangeira `ON DELETE SET NULL`.
   - Ao excluir o produto, apenas a referência técnica some.
   - O item do pedido continua visível no histórico com o nome congelado do produto.

3. Ajustar a mensagem do frontend em `useDeleteProduct`, se necessário.
   - Se ainda houver erro de banco, mostrar uma mensagem mais clara ao usuário.
   - Invalidar a lista de produtos após exclusão, como já foi feito.

**Resultado esperado**
- “Produto Teste” e “Sushi Mix 54 Peças” poderão ser excluídos mesmo se já aparecerem em pedidos antigos.
- O histórico de pedidos não será perdido.
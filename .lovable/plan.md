## Causa

`useValidateCoupon` (em `src/hooks/use-delivery-coupons.ts`) requer `auth.uid()` (linha 136-137), mas o cardápio público é acessado por clientes anônimos. Resultado: a validação sempre dispara `Usuário não autenticado` e o cupom nunca é aplicado.

A RLS já permite leitura pública: `Público pode ver cupons ativos` (`is_active=true AND valid_until > now()`).

## Mudança

### `src/hooks/use-delivery-coupons.ts`
- Remover a checagem de `auth.uid()` em `useValidateCoupon`.
- Aceitar `userId` (o dono do estabelecimento, já disponível no cardápio público) e filtrar `user_id = userId` na consulta — evita aplicar cupom de outra loja.
- Usar `.maybeSingle()` para devolver mensagem amigável em vez de erro Postgres.

```ts
mutationFn: async ({ code, orderValue, userId }: {
  code: string; orderValue: number; userId: string;
}) => {
  const { data, error } = await supabase
    .from("delivery_coupons")
    .select("*")
    .eq("user_id", userId)
    .eq("code", code.toUpperCase())
    .eq("is_active", true)
    .maybeSingle();
  if (error || !data) throw new Error("Cupom inválido ou expirado");
  // …resto da validação igual
}
```

### `src/components/public-menu/ShoppingCart.tsx`
Passar `userId` (já é prop do componente) nas duas chamadas `validateCoupon.mutate` (auto-apply e botão Aplicar).

Nada mais muda — `OrderConfirmation` já encaminha `discount` e `couponCode` para `useCreateOrder`, que persiste em `delivery_orders`.

Sem migração necessária.

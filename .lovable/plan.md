## Objetivo

Remover a página de Cozinha (PDV e Garçom) já que ninguém da cozinha está usando. O campo `kitchen_status` continua existindo no banco e é usado por outros fluxos (comandas, mesas, pagamento, transferência), então só removemos a UI dedicada e os atalhos de navegação — **sem mexer no schema nem em outros consumidores de `kitchen_status nem outros serviços como as impressões da comanda, o fluxo de enviar para a cozinha deve ser mantido!**`

## Mudanças

### Remover páginas e componentes

- `src/pages/pdv/Kitchen.tsx` (rota `/pdv/cozinha`)
- `src/pages/garcom/GarcomCozinha.tsx` (rota `/garcom/cozinha`)
- `src/hooks/use-pdv-kitchen.ts`
- `src/components/pdv/KitchenItemCard.tsx`
- `src/components/pdv/KitchenFilters.tsx`

### Remover rotas e itens de navegação

- `src/pages/PDV.tsx` — remover import `PDVKitchen` e a `<Route path="cozinha" .../>`.
- `src/pages/Garcom.tsx` — remover import `GarcomCozinha` e a `<Route path="cozinha" .../>`.
- `src/components/pdv/PDVHeaderNav.tsx` — remover o item de menu "Cozinha".
- `src/components/garcom/BottomTabBar.tsx` — remover a aba "Cozinha".

### Ajustar role `cozinheiro`

- `src/hooks/use-user-role.ts` — `cozinheiro` perde acesso a `/pdv/cozinha`. Como esse era seu único caminho, redirecionar `cozinheiro` para `/pdv/comandas` (ou outra rota padrão) para evitar loop de login. Também remover `/pdv/cozinha` da lista de paths e da rota default do `garcom`.

A enum `cozinheiro` em `TenantDetail`, `RolePermissionsView`, `use-tenants` e nos tipos do Supabase **permanece** (não é remoção de role, apenas da página).

## Não alterar

- `kitchen_status` no banco, em `use-pdv-comandas.ts`, `use-pdv-orders.ts`, `Balcao.tsx`, `ComandaDetailsDialog.tsx`, `TransferItemsDialog.tsx`, `PaymentDialog.tsx`, `Garcom*Detalhe.tsx` — continuam funcionando normalmente.

## Validação

- App compila sem referências quebradas a `PDVKitchen`/`GarcomCozinha`/`usePDVKitchen`.
- Menu "Frente de Caixa" não mostra mais "Cozinha"; bottom bar do garçom também não.
- Acessar `/pdv/cozinha` ou `/garcom/cozinha` cai no NotFound (ou redireciona pelo guard).
- Login como `cozinheiro` redireciona para rota válida em vez de página inexistente.
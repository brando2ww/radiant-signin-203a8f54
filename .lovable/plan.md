## Objetivo

Remover a página **Balcão** do PDV (rota `/pdv/balcao`). O conceito de "balcão" como **origem de pedido** (`source = "balcao"`) e como canal de disponibilidade de produto (`available_in`) é usado em vários lugares (Dashboard, CMV, receita mensal, produtos, comandas) e **permanece intacto** — só removemos a tela dedicada e o item de navegação.

## Mudanças

### Remover arquivo
- `src/pages/pdv/Balcao.tsx`

### Remover rota e nav
- `src/pages/PDV.tsx` — remover `import PDVBalcao` e a `<Route path="balcao" ...>`.
- `src/components/pdv/PDVHeaderNav.tsx` — remover o item "Balcão" do menu Frente de Caixa.

### Ajustar role `caixa`
- `src/hooks/use-user-role.ts`:
  - Remover `/pdv/balcao` da lista do `gerente` e do `caixa`.
  - `caixa` fica só com `/pdv/caixa` (rota default já é `/pdv/caixa`, sem necessidade de troca).

## Não alterar
- `Balcao.tsx` em `FranchiseImport`, `use-franchise-import`, `ProductCard`, `ProductDialog`, `NewOrderDialog`, `AddItemDialog`, `ComandaAddItemDialog`, `OrderCard`, `MonthlyRevenueSection`, `use-pdv-monthly-revenue`, `use-pdv-cmv`, `use-pdv-products`, `GarcomItemDetalhe` — todas as referências a "balcao" como origem/canal continuam funcionando.

## Validação

- App compila sem referências a `PDVBalcao`.
- Menu "Frente de Caixa" mostra apenas Salão e Caixa.
- Acessar `/pdv/balcao` cai no NotFound (ou redireciona pelo guard).
- Login como `caixa` continua indo para `/pdv/caixa`.
- Pedidos com origem "balcão" (vindos do garçom ou histórico) seguem aparecendo normalmente em comandas/dashboard/CMV.

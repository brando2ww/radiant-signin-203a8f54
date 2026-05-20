## Objetivo
Adicionar um campo de busca no painel lateral `SalonQueuePanel` (coluna Salão/Delivery do `/pdv/caixa`) para filtrar a fila visível por texto.

## Alterações
**`src/components/pdv/cashier/SalonQueuePanel.tsx`**
1. Adicionar estado `const [search, setSearch] = useState("")`.
2. Renderizar `<Input>` (lucide `Search` à esquerda) logo abaixo da `TabsList`, dentro do header (`div.px-3 pt-3 pb-2 border-b`). Placeholder dinâmico:
   - aba Salão: "Buscar por mesa, cliente ou nº comanda…"
   - aba Delivery: "Buscar por nº pedido ou cliente…"
   Botão `X` para limpar quando houver texto.
3. **Salão** — aplicar filtro em `pendingComandas` antes do `useMemo` de `groups`:
   - Match (case-insensitive, sem acento via `String.normalize`) em: `customer_name`, `comanda_number` (como string), e `formatTableLabel(table.table_number)` da mesa correspondente (`tablesByOrderId`).
4. **Delivery** — derivar `filteredDelivery` a partir de `delivery.all` aplicando o mesmo normalizador em `order_number` e `customer_name`. Usar essa lista no `.map` da `TabsContent value="delivery"` (substituindo `delivery.all`).
5. Empty state quando há filtro mas sem resultados: "Nenhum resultado para '<termo>'." em ambas as abas, em vez do empty atual.
6. `search` é compartilhado entre abas (mantém ao trocar de tab, melhor UX).

Sem mudanças em hooks, dados ou rota.

## Validação
- Digitar "02" → filtra mesa 02 no salão.
- Digitar nome do cliente → filtra na aba ativa.
- Trocar para Delivery → mesmo termo filtra pedidos por número/cliente.
- Limpar via `X` → lista volta ao normal.

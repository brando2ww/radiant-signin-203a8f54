## Objetivo

Na tabela "Pedidos com desconto" (`/pdv/relatorios?tab=discounts`), exibir apenas os 10 primeiros pedidos e adicionar um botão "Carregar mais 10" abaixo da tabela, incrementando 10 a cada clique até esgotar a lista.

## Alterações

Editar apenas `src/pages/pdv/reports/DiscountsReport.tsx`:

1. Adicionar estado local `const [visibleCount, setVisibleCount] = useState(10);`.
2. Resetar `visibleCount` para 10 quando o período/filtros mudarem ou quando a lista de pedidos for recarregada (via `useEffect` dependente do tamanho/identidade da lista).
3. Na renderização da tabela "Pedidos com desconto", usar `orders.slice(0, visibleCount)` em vez da lista completa.
4. Abaixo da tabela, quando `visibleCount < orders.length`, mostrar:
   - Texto sutil: `Mostrando {visibleCount} de {orders.length}`.
   - Botão `variant="outline"` com label `Carregar mais 10` que faz `setVisibleCount((c) => Math.min(c + 10, orders.length))`.
5. Não alterar XLSX export (continua exportando todos os pedidos), KPIs, gráficos, agregação por cupom, nem nenhuma outra aba/relatório.

## Validação

Abrir o relatório de descontos, conferir que a tabela mostra 10 linhas, clicar em "Carregar mais 10" e ver 20, depois 30, até o botão desaparecer ao atingir o total. Trocar o período e confirmar que a contagem volta para 10.

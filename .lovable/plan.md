## Ajuste

No `src/components/pdv/cashier/CashierHeader.tsx`, reduzir o tamanho das fontes dos valores principais para que textos como "Caixa Principal" e "Caixa Fechado" caibam em uma única linha dentro de cada célula do grid.

Mudanças:
1. Valores (Caixa Principal, data, status): de `font-medium` (text-base padrão) para `text-sm font-medium`.
2. Hora atual: de `font-medium font-mono text-base` para `font-medium font-mono text-sm`.
3. Labels (Operador, Data atual, Hora atual, Status): manter `text-xs text-muted-foreground`.
4. Adicionar `truncate` / `whitespace-nowrap` nos valores para evitar quebra residual em viewports mais estreitos.
5. Reduzir gap interno do bloco (ícone + texto) de `gap-3` para `gap-2` para ganhar mais espaço horizontal.

Apenas alterações de apresentação, sem mudanças de lógica.

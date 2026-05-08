## Problema

No `CashierHeader` (src/components/pdv/cashier/CashierHeader.tsx), os 4 blocos (Operador, Data, Hora, Status) usam `flex-wrap` com `justify-between`. No viewport atual, o badge "Caixa Fechado" não cabe na mesma linha e quebra para baixo, ficando solto e desalinhado.

## Ajuste

Reorganizar o header para um layout mais robusto que não quebra feio:

1. Trocar `flex-wrap justify-between` por um `grid` responsivo: `grid-cols-2 md:grid-cols-4` com `gap-3`, garantindo que cada bloco ocupe uma célula previsível.
2. Reduzir o ícone/tamanho do bloco de Status para combinar visualmente com os demais (mesmo padrão de ícone redondo + label pequena + valor) em vez de ponto + badge solto.
3. Em telas estreitas (< md), os blocos se acomodam em 2 colunas sem sobrar elemento órfão.
4. Aumentar levemente o padding interno (`p-3`) para respirar.

Apenas alterações de apresentação no arquivo `src/components/pdv/cashier/CashierHeader.tsx`. Sem mudança de lógica nem de dados.

## Ajuste de proporção das colunas — Frente de Caixa

Arquivo: `src/pages/pdv/Cashier.tsx`

Hoje o grid principal usa `lg:grid-cols-12` com `lg:col-span-6 / 3 / 3` (50% / 25% / 25%).

### Mudança

Trocar para uma divisão 30% / 25% / 45% usando `lg:grid-cols-20`:

- Movimentações: `lg:col-span-6` (30%)
- Ações Rápidas (sidebar): `lg:col-span-5` (25%)
- Painel Salão/Delivery: `lg:col-span-9` (45%)

Como `grid-cols-20` não é padrão do Tailwind, usar a sintaxe arbitrária `lg:grid-cols-[6fr_5fr_9fr]` no container — mais simples, sem precisar estender o tailwind.config.

### Responsividade

- Manter `grid-cols-1` no mobile (uma coluna empilhada) — só ativa a divisão fracionada em `lg:`.
- Skeleton de loading segue o mesmo grid para evitar salto visual (atualizar o `lg:grid-cols-4` do skeleton para o novo layout, ou simplificar para 3 blocos).
- Nenhuma mudança de altura, padding ou min-height — só proporção horizontal.

### Diff resumido

```text
- <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 min-h-0">
+ <div className="grid grid-cols-1 lg:grid-cols-[6fr_5fr_9fr] gap-4 flex-1 min-h-0">

- <Card className="lg:col-span-6 ..."> (Movimentações)
- <Card className="lg:col-span-3 ..."> (Ações)
- <Card className="lg:col-span-3 ..."> (Salão)
+ remover col-span — as colunas seguem a definição do grid
```

Sem mudanças de dados, hooks ou comportamento.
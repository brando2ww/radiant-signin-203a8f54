## Reduzir altura do header de /pdv/caixa

O header (`CashierHeader`) ocupa altura significativa no topo. Como o container pai usa `flex-1 min-h-0` no grid de colunas, qualquer altura economizada no header é automaticamente convertida em altura extra para as colunas central e direita (e esquerda).

**Arquivo:** `src/components/pdv/cashier/CashierHeader.tsx`

Tornar o header mais compacto:

- Container externo: `p-3` → `p-2`
- Ícones circulares (Operador / Data / Hora): `h-9 w-9` → `h-8 w-8`, ícones internos `h-5 w-5` → `h-4 w-4`
- Relógio: `text-lg` → `text-base`
- Badge de status: `text-sm px-4 py-1.5` → `text-xs px-3 py-1`
- Gap principal: `gap-4` → `gap-3`

Isso reduz a altura do header em ~12–16px sem remover nenhuma informação, mantendo a tipografia legível e a paleta padrão (sem cores customizadas além das já existentes).

Nenhuma alteração no `Cashier.tsx` ou nas colunas — o `flex-1` cuida da redistribuição automática da altura.
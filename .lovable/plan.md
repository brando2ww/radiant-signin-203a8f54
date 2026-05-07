## Compactar footer "Gaveta" e "Vendas por forma de pagamento"

Mesma lógica do header: reduzir a altura do `CashierSummaryFooter` para liberar mais espaço vertical às colunas centrais e direita.

**Arquivo:** `src/components/pdv/cashier/CashierSummaryFooter.tsx`

### 1. Compactar `SummaryRow` (linhas 36–50)

- `py-1` → `py-0.5`
- ícone: `h-3.5 w-3.5` → `h-3 w-3`
- label: `text-xs` → `text-[11px]`
- valor (normal): `text-xs` → `text-[11px]`
- valor (emphasis): `text-sm` → `text-xs`

### 2. Compactar os dois Cards (linhas 69–125)

- `CardContent p-3` → `p-2` em ambos
- Header interno `mb-2 pb-2` → `mb-1.5 pb-1.5`
- Título `text-sm` → `text-xs`
- Ícone do título `h-4 w-4` → `h-3.5 w-3.5`
- Bloco final `mt-2 pt-2` → `mt-1.5 pt-1.5`
- `space-y-0.5` no bloco da gaveta mantido (já mínimo)

Isso reduz cada card em ~18–22px de altura, devolvendo esse espaço ao grid principal (que usa `flex-1`).

Sem alterações em cores ou estrutura — só densidade.
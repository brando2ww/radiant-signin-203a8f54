## Ajustes na página de Relatórios do Delivery

1. **Remover título duplicado**: a página `src/pages/pdv/delivery/Reports.tsx` renderiza "Relatórios do Delivery" e o `ReportsToolbar` (dentro de `ReportsTab`) renderiza outro "Relatórios". Remover o bloco de título da página, mantendo apenas o título da toolbar (que já mostra o período).

2. **Padding lateral igual ao da página de Cupons**: trocar o wrapper de `container mx-auto py-6 px-4` para `px-4 py-6` (mesmo padrão usado em `Coupons.tsx`), aproveitando 100% da largura.

### Arquivos
- `src/pages/pdv/delivery/Reports.tsx` — remover o `<div className="mb-6">` com h1/p e trocar o wrapper para `px-4 py-6`.

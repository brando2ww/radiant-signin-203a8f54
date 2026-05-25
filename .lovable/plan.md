## Inverter cores do AdminSidebar (tema branco)

Em `src/components/super-admin/AdminSidebar.tsx`, trocar todos os tons escuros por claros equivalentes, mantendo a hierarquia visual:

- `bg-neutral-950` → `bg-white`
- `bg-neutral-900` (hover) → `bg-neutral-100`
- `bg-neutral-800` (ativo) → `bg-neutral-200`
- `border-neutral-800`/`border-neutral-700` → `border-neutral-200`
- `text-neutral-50` → `text-neutral-900`
- `text-neutral-300` → `text-neutral-700`
- `text-neutral-400` → `text-neutral-500`
- `text-neutral-500` → `text-neutral-400`
- Logo `InterfacesLogoSquare`: trocar `bg-neutral-50` por `bg-neutral-900` e preencher os retângulos SVG com `#ffffff` para inverter o quadrado.
- Frame raiz (`Frame760`): trocar `bg-black` por `bg-neutral-100` para contrastar com o sidebar branco.

Sem mudanças estruturais — apenas substituição de classes Tailwind.

## Mudança no logo da AdminSidebar

1. Copiar `user-uploads://simbolo_velara_preto_1.png` para `src/assets/velara-symbol.png`.

2. `src/components/super-admin/AdminSidebar.tsx`:
   - Importar o novo símbolo: `import velaraSymbol from "@/assets/velara-symbol.png"`.
   - Estado **colapsado**: renderizar `<img src={velaraSymbol} alt="Velara" className="h-8 w-8 object-contain dark:invert" />` (em vez do `<Logo>`).
   - Estado **expandido**: manter `<Logo>` atual, porém 2x maior — usar `className="h-16 w-auto max-w-full object-contain"` (sobrescrevendo o `h-8` padrão do size `sm`).
   - Ajustar `SidebarHeader` para `py-3` para acomodar o logo maior sem cortar.

## Fora de escopo
- Não mexer no `Logo` global nem em outras telas.

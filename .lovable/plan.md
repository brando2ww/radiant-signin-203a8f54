## Aplicar logo Velara

Em `src/components/super-admin/AdminSidebar.tsx`:

1. Adicionar imports:
   - `import velaraLogo from "@/assets/logo_velara_preto.png";`
   - `import velaraSymbol from "@/assets/velara-symbol.png";`

2. **`BrandBadge`** (header do painel): substituir `<InterfacesLogoSquare>` + texto "Interfaces" por `<img src={velaraLogo} alt="Velara" className="h-6 w-auto" />`.

3. **Rail (`IconNavigation`)**: substituir `<InterfacesLogoSquare size={28} />` por `<img src={velaraSymbol} alt="Velara" className="h-7 w-7 object-contain" />`.

Não remover o componente `InterfacesLogoSquare` (pode ficar não usado, sem impacto), ou removê-lo junto se preferir limpo — vou removê-lo.

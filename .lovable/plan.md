## Problema

No `AdminSidebar`, o `<Logo size="sm" />` renderiza um `<img>` sem limite de largura. Como o logo "velara" tem proporção horizontal larga, ele estoura/desalinha dentro do `SidebarHeader` (especialmente quando a sidebar está em modo `collapsed`, onde a largura cai para ~3rem mas a imagem mantém ~`h-8` com largura natural maior).

Hoje:
- `src/components/ui/logo.tsx` aplica só `h-8` + `dark:invert`, sem `w-auto max-w-full object-contain`.
- `src/components/super-admin/AdminSidebar.tsx` no estado collapsed passa `h-8 object-contain` mas sem limitar largura, então o logo "vaza" do container colapsado.

## Correção (apenas visual, escopo restrito ao logo da AdminSidebar)

1. `src/components/super-admin/AdminSidebar.tsx`
   - `SidebarHeader`: trocar `px-4 py-5` por `px-3 py-4` e adicionar `overflow-hidden` para conter o logo.
   - Logo expandido: `<Logo size="sm" className="max-w-full w-auto object-contain" />`.
   - Logo colapsado: renderizar variante reduzida `<Logo size="sm" className="h-6 w-6 object-contain" />` (quadrado, cabe nos 3rem do sidebar colapsado).

2. Sem mexer em `logo.tsx` (mantém comportamento global para outras telas).

## Fora de escopo
- Não alterar logos de `GarcomHeader`, headers públicos ou qualquer outra tela.
- Não criar variante "icon" do logo agora (o asset atual é único).

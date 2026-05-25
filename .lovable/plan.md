## Adicionar menu "Sair" no avatar do rail lateral

Em `src/components/super-admin/AdminSidebar.tsx`, transformar o `AvatarCircle` (linha 269) num botão com dropdown:

- Envolver o `AvatarCircle` num `DropdownMenu` (`@/components/ui/dropdown-menu`) com trigger sendo o avatar (cursor pointer).
- Conteúdo do menu: um único item **"Sair"** com ícone `LogOut` (lucide-react).
- Ao clicar em "Sair": chamar `supabase.auth.signOut()` (import `@/integrations/supabase/client`) e redirecionar para `/auth` via `navigate`.
- Posicionar o dropdown com `side="right"` e `align="end"` para abrir ao lado do rail.

Sem outras alterações.
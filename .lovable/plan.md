## Problema

Ao clicar em "Sair" no menu do Super Admin (`AdminSidebar.tsx`, linha 287), o app navega para `/auth`, rota que não existe no router (`App.tsx`). Resultado: cai no `NotFound`.

A tela de login fica em `/`.

## Correção

- `src/components/super-admin/AdminSidebar.tsx` (linha 287): trocar `navigate("/auth")` por `navigate("/", { replace: true })` após o `signOut()`.

Sem outras alterações.
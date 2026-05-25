## Reescrever AdminSidebar com o layout exato do componente de referência

Vou reconstruir `src/components/super-admin/AdminSidebar.tsx` reproduzindo fielmente a estrutura visual do componente colado (rail de ícones à esquerda + painel de detalhe à direita com cabeçalho colapsável, busca, seções, sub-itens dropdown e card de rodapé), mas usando o logo Velara, conteúdo do projeto em pt-BR e tokens do design system.

### Estrutura visual (igual ao código de referência)

```text
┌──────┬────────────────────────────┐
│ logo │ Título da seção      [<]   │
│      │ ────────────────────────── │
│ [D]  │ 🔍 Buscar...               │
│ [T]  │                            │
│ [P]  │ AÇÕES RÁPIDAS              │
│ [C]  │  + Novo item               │
│ [⚙]  │  ⌕ Filtrar                 │
│      │                            │
│ ──── │ MEUS REGISTROS             │
│ [u]  │  ▸ Item com dropdown       │
│ [⚙]  │     · Sub-item                │
│      │     · Sub-item             │
│      │                            │
│      │ ┌────────────────────────┐ │
│      │ │ Card de rodapé         │ │
│      │ └────────────────────────┘ │
└──────┴────────────────────────────┘
```

### Rail (60px) — ordem fixa
1. Logo Velara (substitui o quadrado "Interfaces")
2. Dashboard → `/admin`
3. Tenants → `/admin/tenants`
4. Planos → `/admin/planos`
5. Checklists → `/admin/checklists` (placeholder)
6. Divisor
7. Avatar do usuário (decorativo)
8. Configurações → `/admin/configuracoes`

Cada botão usa ícone do `@carbon/icons-react`, ring/destaque quando `activeSection` bate com a rota atual, transição suave (`cubic-bezier(0.25, 1.1, 0.4, 1)`).

### Painel de detalhe (260px → 0 quando colapsado)

- **Header**: título da seção + botão chevron que colapsa/expande o painel (largura anima para 0; rail permanece visível). Quando colapsado, mostra só o botão para reabrir.
- **Search**: input decorativo "Buscar..." (sem lógica).
- **Sections**: cada seção tem um rótulo em caps + lista de itens. Itens com `hasDropdown` abrem/fecham filhos (animação de altura), itens sem dropdown navegam para a rota correspondente.
- **Footer card**: card simples no fim do painel com título + descrição (placeholder textual, sem ações reais).

### Conteúdo das seções (pt-BR, mapeado para o projeto)

- **Dashboard**: Visão geral · Métricas rápidas (dropdown decorativo com 3 linhas) · Atividade recente (dropdown decorativo)
- **Tenants**: Todos os tenants · Novo tenant · Filtrar (dropdown com Ativos/Inativos/Pendentes)
- **Planos**: Gerenciar planos · Novo plano
- **Checklists**: Todos os checklists · Novo checklist (placeholders — sem rota nova; sub-itens decorativos)
- **Configurações**: Perfil · Segurança · Notificações · Preferências (dropdown decorativo)

> Itens decorativos (sub-itens dentro de dropdown) só fazem `console.log` no clique, replicando o comportamento do código de referência. Apenas itens de primeiro nível com rota definida navegam.

### Design system

- Todas as cores via tokens (`bg-card`, `bg-muted`, `text-foreground`, `text-muted-foreground`, `border-border`, `ring-primary`). Sem `neutral-50`/`neutral-400` hardcoded.
- Fontes: stack padrão do projeto (não `Lexend`).
- Animações: easing `cubic-bezier(0.25, 1.1, 0.4, 1)` em 200–250ms para colapsar painel e expandir dropdowns.

### Arquivos

- **Editar** `src/components/super-admin/AdminSidebar.tsx` — reescrita completa seguindo a estrutura acima.
- Nenhum outro arquivo precisa mudar. `SuperAdmin.tsx` já renderiza `<AdminSidebar />` + `<main className="flex-1">`, então o layout flex continua funcionando com o painel colapsando para 0.

### Fora de escopo

- Não criar página `/admin/checklists` (já planejado anteriormente como placeholder, mas o usuário não pediu agora — os itens de checklist no sidebar ficam decorativos por enquanto).
- Não implementar lógica de busca.
- Não mexer em `SuperAdminGuard`, rotas, ou outros sidebars.
- Sem novas dependências (`@carbon/icons-react` já está instalado).

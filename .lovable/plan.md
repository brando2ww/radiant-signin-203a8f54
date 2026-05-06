## Redesign completo — Gerenciar Cardápio

Reescrita do `MenuTab.tsx` com componentes auxiliares e um novo Drawer de edição substituindo o `ProductDialog` modal central.

### Arquitetura

```text
src/components/delivery/
├─ MenuTab.tsx                    (reescrito)
├─ menu/
│  ├─ MenuToolbar.tsx             (header sticky + busca + filtros)
│  ├─ CategorySection.tsx         (seção colapsável da categoria)
│  ├─ ProductCard.tsx             (card horizontal redesenhado)
│  ├─ ProductDrawer.tsx           (drawer lateral substitui ProductDialog)
│  └─ EmptyState.tsx              (estados vazios)
```

### MenuToolbar (sticky)

- `sticky top-0 z-30 bg-background/95 backdrop-blur border-b -mx-* px-*`
- Linha 1: título "Gerenciar Cardápio" + subtítulo + botões "Nova Categoria" e "Novo Produto" sempre visíveis.
- Linha 2: busca à esquerda (com ícone), filtros rápidos à direita usando `ToggleGroup`:
  `Todos | Disponíveis | Indisponíveis | Com promoção`.
- Estado de filtros ergue até `MenuTab` que aplica em `productsByCategory`.

### CategorySection

Layout do header (mantendo Accordion):
- Drag handle (`GripVertical`) à esquerda
- Nome bold (`text-lg`) + badge "{n} produtos" + badge "Inativa" condicional
- À direita: `Switch` de visibilidade pública (`is_active`), botão "Adicionar produto", menu ⋮ (Editar, Excluir)
- Separador visual claro entre categorias (`space-y-6` + border-rounded card)

### ProductCard (novo layout horizontal)

```text
┌───────────────────────────────────────────────────────────────┐
│ ⋮⋮  [img 80x80]  Nome do produto                  [Toggle] ⋮ │
│                  Descrição em até 2 linhas...                  │
│                  ⏱ 30 min · 👥 2 pessoas · ⚙ 3 opções          │
│                  R$ 159,00 (riscado)  R$ 149,00 (verde)        │
└───────────────────────────────────────────────────────────────┘
```

- Card largura total da coluna (uma coluna em <md, duas em ≥xl).
- `min-w-0`, `overflow-hidden`, `line-clamp-2` em descrição.
- Imagem `h-20 w-20 rounded-md object-cover shrink-0`. Placeholder com ícone `ImageIcon` em `bg-muted`.
- Tags em linha com `Clock`, `Users`, `Settings2` (lucide), `text-xs text-muted-foreground`.
- Preço promocional em `text-success` (semantic token; se não existir, usar `text-primary`).
- Toggle Disponível: `Switch` grande à direita; quando off → card com `opacity-60` e badge "Indisponível" sobreposta na imagem (`absolute inset-0 bg-destructive/80 text-destructive-foreground`).
- Menu ⋮: Editar, Duplicar, Mover para categoria (submenu com lista), Excluir.
- Hover: `hover:border-primary/40 hover:shadow-sm transition`.
- Click no card (fora dos controles) abre drawer.

### ProductDrawer

Substitui `ProductDialog` apenas no fluxo de Cardápio (mantém ProductDialog para outros fluxos se houver). Usa `Sheet` do shadcn:
- `SheetContent side="right" className="w-full sm:max-w-xl lg:max-w-2xl p-0 flex flex-col"`
- Header sticky (nome + close)
- Body scroll independente (`flex-1 overflow-y-auto`)
- Footer sticky com Cancelar + Salvar
- Seções: Informações básicas, Imagem, Disponibilidade & Visibilidade, Grupos de Opções, Categoria.
- Reaproveita os campos e mutations já existentes em `ProductDialog`.

### Estados vazios (EmptyState)

- Sem categorias: card grande centralizado, ícone `LayoutGrid`, texto e botão "Criar primeira categoria".
- Categoria sem produtos: bloco interno com texto + botão "Adicionar produto a esta categoria".

### Mover para categoria

Submenu no ⋮ do produto listando outras categorias; ao escolher, chama `useUpdateProduct` com `category_id` novo.

### Filtros rápidos

```ts
type QuickFilter = "all" | "available" | "unavailable" | "promo";
```

Aplicado dentro de `productsByCategory`/`filteredProducts`.

### Detalhes técnicos

- `move-to-category` — usar `DropdownMenuSub` do shadcn. Se não existir, listar categorias inline.
- Toast de sucesso/erro em todas mutations já existentes.
- Drag-and-drop inter-categoria não vai entrar nesta iteração (apenas dentro da categoria + reorder de categorias) — explicitamente fora do escopo para manter tamanho gerenciável.
- Sem novas dependências.
- Sem mudanças de schema/SQL.

### Critério de aceite

- 1280 / 1440 / 1920px sem overflow horizontal nem cortes.
- Header e botões sempre acessíveis durante scroll.
- Drawer de edição abre, rola internamente, salva e fecha sem reload.
- Toggle de disponibilidade muda instantaneamente com optimistic-feel via React Query.
## Melhorias UX no Editor de Opção + Toggle "Permitir múltiplas unidades" em Composição

### 1. Migração de banco

`pdv_product_composition_groups` ganha coluna `allow_quantity`:

```sql
ALTER TABLE public.pdv_product_composition_groups
ADD COLUMN IF NOT EXISTS allow_quantity boolean NOT NULL DEFAULT false;
```

### 2. UX do diálogo "Editar Opção" (`ProductOptionDialog.tsx`)

Reorganizar conteúdo em duas seções claras com hierarquia visual:

**Seção 1 — Configurações** (card `border bg-card/50`):
- Nome da opção
- Grid 2 colunas: Tipo de seleção | Toggle "Obrigatória" (em moldura própria)
- Quando `multiple`: Mín/Máx em grid + toggle "Permitir múltiplas unidades por item" em card destacado com descrição

**Seção 2 — Itens da opção** (header sticky):
- Header com contagem ("3 itens") e botão "Adicionar item" sempre visível enquanto rola
- Cada item card melhorado: nome em destaque, linha separadora antes do bloco de estoque, badge "Vinculado" quando há insumo
- Espaçamentos consistentes (`space-y-3`/`space-y-5`)

Texto/labels mais curtos, tipografia consistente (`text-xs` em labels, `text-sm font-semibold` em títulos de seção).

### 3. `ProductCompositionManager.tsx` — Toggle "Permitir múltiplas unidades"

No `GroupCard`, na linha de configurações junto ao Tipo/Mín/Máx/Obrigatório, adicionar quando `type === "multiple"`:

```tsx
<div className="flex items-center gap-2 h-10">
  <Switch
    checked={!!group.allow_quantity}
    onCheckedChange={(checked) => onUpdateGroup({ allow_quantity: checked })}
  />
  <Label className="text-xs">Permitir múltiplas unidades por item</Label>
</div>
```

### 4. Hook `use-pdv-composition-groups.ts`

- Acrescentar `allow_quantity: boolean` à interface `CompositionGroup`
- Aceitar `allow_quantity` em `createGroup` e `updateGroup` (já genérico via `Partial<...>`, basta tipar a interface)

### 5. Tipos do Supabase

Após a migração, os tipos serão regenerados automaticamente — nada a editar manualmente.

### Critério de aceite

- Diálogo de Editar Opção visualmente organizado em duas seções, com header de itens sticky.
- Toggle "Permitir múltiplas unidades" aparece também na composição de produtos PDV quando o grupo é "Múltipla escolha".
- Migração roda sem erro, mantendo grupos existentes com `allow_quantity = false` por padrão.
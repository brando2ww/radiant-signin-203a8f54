## Redesign — Página de Fornecedores

Mantém todo o backend e mutations existentes (`usePDVSuppliers`, `useCreateSupplier`, `useUpdateSupplier`, `useDeleteSupplier`). Só adiciona uma coluna `category` no banco e reescreve a camada de UI.

### 1. Migration — campo categoria

Adicionar em `pdv_suppliers`:
- `category text NULL` (livre, mas o Select sugere: Hortifruti, Carnes, Bebidas, Secos, Limpeza, Embalagens, Outros)

Sem mudança em RLS/policies.

### 2. Novo hook auxiliar (sem mexer no existente)

`src/hooks/use-supplier-purchase-stats.ts` — fetch leve em `pdv_purchase_orders` (mesmo padrão de owner-id já em uso):

- Retorna `Map<supplier_id, { monthTotal: number; lastPurchaseAt: string | null }>`
- `monthTotal`: soma de `total` no mês atual (`gte first day of month`)
- `lastPurchaseAt`: `max(created_at)` por supplier
- Apenas SELECT; nenhum write.

### 3. Card redesenhado — `SupplierCard.tsx` (rewrite)

Layout vertical com header + corpo + rodapé compacto. Tokens semânticos (`bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`) — sem cores customizadas.

Header:
- Avatar circular com iniciais (helper local `getInitials` + cor de fundo derivada do hash do nome via `bg-muted` com `text-foreground` — sem palette colorida, respeitando memória de design)
- Nome (semibold), `company_name` em `text-xs text-muted-foreground`
- CNPJ ou CPF em linha menor
- Lado direito: `Badge` "Ativo/Inativo" como **toggle** (Switch shadcn) — onClick chama `updateSupplier({ id, updates: { is_active: !current } })`, com optimistic via `queryClient.setQueryData`. Loading state desabilita o switch.
- Menu de três pontos (`DropdownMenu`) com itens: Editar, Excluir. Substitui o botão vermelho atual.

Corpo (cinza sutil, ícones lucide):
- Categoria (Badge `variant="outline"` se preenchida)
- Telefone/WhatsApp como `<a href="tel:..." />` e `<a href="https://wa.me/..." target="_blank" />` se `whatsapp` definido
- E-mail como `<a href="mailto:..." />`
- Cidade/UF (mantido)

Rodapé (border-t, fonte pequena, `text-muted-foreground`):
- "Compras no mês: **R$ X**" via `formatBRL`
- "Última compra: **dd/MM/yyyy**" via `date-fns` com `locale: ptBR`, ou "—" se nunca
- Se stats ainda carregando: skeletons inline

Estados:
- Card `hover:shadow-md transition-shadow` (sutil)
- Card inteiro com `cursor-default`; só elementos interativos (avatar/menu/switch/links) recebem hover destacado

### 4. Filtros + ordenação — `SupplierFilters.tsx` (rewrite)

Nova linha mais densa (toolbar plana, sem Card wrapper) com:
- Busca (existente)
- Select **Categoria** (Todas + lista fixa + categorias distintas extraídas dos fornecedores)
- Select **Status** (existente)
- Select **Ordenar por**: `A-Z` (default), `Z-A`, `Mais recente` (created_at desc), `Maior volume de compras` (monthTotal desc — usa stats do hook)

Contador "Exibindo X de Y" permanece à direita.

### 5. Drawer lateral — `SupplierDialog.tsx` (rewrite do wrapper)

Trocar `Dialog`/`DialogContent` por `Sheet`/`SheetContent side="right"` com `className="w-full sm:max-w-2xl p-0 flex flex-col"`. Estrutura interna:

```
SheetHeader (border-b, px-6 py-4, fixo) — título + descrição
<div className="flex-1 overflow-y-auto px-6 py-4"> ... form atual intacto ... </div>
SheetFooter (border-t, px-6 py-4, fixo) — Cancelar + Salvar
```

Todo o `<form>`, campos, validação Zod, abas internas e lógica de submit existentes são preservados — só o wrapper externo muda. Adicionar campo `category` (Select) na seção "Informações gerais" e Switch `is_active` na mesma seção, já que agora o drawer cobre tudo.

### 6. Estado vazio — `Suppliers.tsx`

Substituir o Card centralizado por bloco mais limpo (sem Card wrapper, padding maior):
- Ícone `Truck` em círculo `bg-muted` `h-20 w-20`
- Heading "Nenhum fornecedor cadastrado"
- Sub "Cadastre seus parceiros para vincular insumos, compras e cotações."
- Botão primário grande "Cadastrar primeiro fornecedor"

Estado "nenhum resultado dos filtros" mantém versão atual menos prominente (texto + botão "Limpar filtros").

### 7. Página `Suppliers.tsx` — ajustes

- Passa `purchaseStats` aos cards e ao sort
- Adiciona estados `categoryFilter` e `sortBy`
- Filtro e ordenação no `useMemo` existente
- Remove a confirmação `AlertDialog` separada? Não — mantém. O excluir do menu três-pontos abre o mesmo AlertDialog atual.

### Arquivos

- **Migration:** adicionar `category` em `pdv_suppliers`
- **Criado:** `src/hooks/use-supplier-purchase-stats.ts`
- **Reescritos:** `src/components/pdv/SupplierCard.tsx`, `src/components/pdv/SupplierFilters.tsx`, `src/components/pdv/SupplierDialog.tsx` (só wrapper externo + campos category/is_active)
- **Editado:** `src/pages/pdv/Suppliers.tsx` (filtros novos, sort, estado vazio, props extras)

Nenhuma lógica de negócio, RLS, mutations ou tabelas relacionadas é alterada.

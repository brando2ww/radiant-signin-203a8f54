# Redesenho da página `/pdv/delivery/entregadores`

Objetivo: transformar a página atual (com Tabs de filtro) em uma central de cadastro limpa, com busca, cards modernos e drawer renovado.

## 1. `src/pages/pdv/delivery/Drivers.tsx` — reescrita

**Remover:** componente `Tabs` e estado `filter`.

**Cabeçalho:**
- Título "Entregadores" + subtítulo "Gerencie sua equipe de entrega".
- Botão "Novo Entregador" (ícone `Plus`) à direita.

**Busca:**
- `Input` com ícone `Search` à esquerda; filtra `drivers` por `name` (case-insensitive). Largura `max-w-sm`.

**Grid:**
- `grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4`.
- Cards com `h-full flex flex-col` para altura uniforme.
- Inativos: `opacity-60`.

**Card (novo componente inline `DriverCard` ou bloco):**
```
┌──────────────────────────────────────────┐
│ [Avatar 56px]  Nome (bold)        [Badge]│
│                🛵 Moto · [PLACA]         │
│                [WhatsApp] (11) 9...      │
│ ───────────────────────────────────────  │
│ Hoje  12      Mês  187    [Toggle] [✏][🗑]│
└──────────────────────────────────────────┘
```
- Avatar: `Avatar` 14×14 com `AvatarImage` ou `AvatarFallback` colorido (`avatar_color` + `initialsFromName`).
- Badge status no topo direito: `Disponível` (`bg-green-500/15 text-green-700 dark:text-green-400`), `Em entrega` (`bg-yellow-500/15 text-yellow-700 dark:text-yellow-400`), `Inativo` (`bg-muted text-muted-foreground`). Usar tokens semânticos do projeto via classes Tailwind/`Badge` `variant` quando disponível, complementando com utilitários para a cor.
- Veículo: ícone Lucide (`Bike`/`Car`/`Footprints`; bicicleta usa `Bike` também) + label.
- Placa: `Badge variant="outline"` discreta.
- Telefone: link `https://wa.me/55<digits>` (strip não-dígitos) com ícone `MessageCircle` (ou `Phone`) — clicável, `target="_blank"`.
- Toggle `Switch` para `is_active` — chama `update({ id, patch: { is_active, status: nextStatus } })`. Quando desativando, força `status='inativo'`; ao reativar, volta para `disponivel` se não estiver `em_entrega`.
- Botão editar (ícone `Pencil`, `variant="ghost" size="icon"`) abre drawer.
- Botão excluir (ícone `Trash2`) abre `AlertDialog` de confirmação → chama `remove(d.id)` (soft delete já existente).
- Rodapé: "Hoje" número grande (`text-xl font-semibold`), "Mês" número menor (`text-sm text-muted-foreground`).
- Se `status === 'em_entrega'` e `current_order_number`: pequena tag abaixo do nome "Pedido #X — Em rota".

**Estado vazio (sem nenhum cadastrado):**
- Card centralizado com ícone `Bike` grande dentro de círculo `bg-muted`, título "Nenhum entregador cadastrado ainda", subtexto descritivo, botão "Cadastrar primeiro entregador".

**Estado vazio de busca:** mensagem simples "Nenhum entregador encontrado para "{query}"".

## 2. `src/components/delivery/DriverFormSheet.tsx` — ajustes

- Cabeçalho fixo (`SheetHeader sticky top-0 bg-background z-10 border-b pb-3`).
- Conteúdo central com scroll (`flex-1 overflow-y-auto`).
- Rodapé fixo com botões Cancelar/Salvar (`sticky bottom-0 bg-background border-t pt-3`).
- Estrutura: `<SheetContent className="w-full sm:max-w-md p-0 flex flex-col">`.
- Telefone com máscara brasileira: aplicar `formatPhoneMask` local (`(##) #####-####`) no `onChange` do input.
- Placa com máscara Mercosul/antigo: uppercase, sem espaço, `maxLength=7`.
- Tipo de veículo: já existe — manter visual; aumentar para `h-20` cada botão.
- **Foto:** novo bloco no topo:
  - Preview circular (`h-24 w-24 rounded-full`) com `AvatarImage`/`AvatarFallback` (iniciais).
  - Botão "Carregar foto" usando `useImageUpload` (já existente) com bucket apropriado (verificar — provavelmente `avatars` ou `product-images`; usar `avatars` se existir, senão criar fluxo simples com `supabase.storage` em bucket público `delivery-drivers` — prefiro reutilizar `useImageUpload` apontando para path `{userId}/drivers/{uuid}.jpg`).
  - Botão "Remover foto" se houver `avatar_url`.
- Toggle ativo já existe; manter, com descrição.
- Notes já existe.

**Storage:** se não existir bucket adequado, criar migration adicionando bucket público `delivery-drivers` com RLS `{userId}/...`. Verificar `use-image-upload.ts` antes de decidir.

## 3. Toggle de ativo/inativo no card

Lógica em `Drivers.tsx`:
```ts
const handleToggleActive = (d, next) =>
  update({ id: d.id, patch: {
    is_active: next,
    status: next ? (d.status === 'em_entrega' ? 'em_entrega' : 'disponivel') : 'inativo'
  }});
```

## 4. Confirmação de exclusão

Usar `AlertDialog` do shadcn com texto "Desativar entregador?" / "Ele deixará de aparecer para atribuição de pedidos." Confirmar → `remove(d.id)`.

## Detalhes técnicos

- Cores de status via classes utilitárias diretas (verde/amarelo/cinza) — exceção pontual ao guardrail "system colors only" porque o usuário pediu explicitamente "verde / amarelo / cinza" para reconhecimento imediato. Aplicar via classes Tailwind nos badges (não criar tokens novos).
- Reaproveitar `useDeliveryDrivers` (sem mudanças no hook).
- Imports adicionais: `Search`, `Pencil`, `Trash2`, `MessageCircle`, `Plus`, `Bike`, `Car`, `Footprints`, `Switch`, `AlertDialog*`, `Input`.
- Telefone WhatsApp: `https://wa.me/55${phone.replace(/\D/g,'')}`.

## Arquivos afetados

- `src/pages/pdv/delivery/Drivers.tsx` — reescrita completa.
- `src/components/delivery/DriverFormSheet.tsx` — refatorado (header/footer fixos, máscaras, upload de foto).
- Possível nova migration de storage bucket caso `useImageUpload` não tenha um destino adequado (verificar antes).

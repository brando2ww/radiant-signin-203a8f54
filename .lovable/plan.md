
## Visão geral

Substituir a `CouponsTab` baseada em cards por uma central de gestão completa, mantendo a identidade visual do Velara PDV (tokens semânticos do sistema, sem cores customizadas). A página passa a ter: KPIs no topo, filtros, tabela densa com ações inline, drawer lateral para criação/edição, link compartilhável com QR Code e painel expansível com histórico de uso por cupom.

## Mudanças no banco (migração)

A tabela `delivery_coupons` hoje não tem os campos pedidos. Migração para adicionar:

- `per_customer_limit integer` (default 0 = ilimitado) — limite de uso por cliente.
- `first_order_only boolean` (default false) — válido apenas na primeira compra.
- `internal_notes text` — descrição interna do gestor.

Nenhuma alteração nas RLS existentes (já restringem por `user_id`).

Cálculo de "usos por cliente" e "histórico" usa `delivery_orders` filtrando por `coupon_code = code` e `user_id` do estabelecimento (já existe `discount` e `customer_name`).

## Layout da página

```text
┌──────────────────────────────────────────────────────────────┐
│ Cupons de Desconto                       [+ Criar cupom]     │
├──────────────────────────────────────────────────────────────┤
│ [Ativos: 12] [Usos hoje: 34] [Economia: R$ 2.140] [Vence 7d:3│
├──────────────────────────────────────────────────────────────┤
│ [busca código] [status v] [tipo v] [ordenar v]               │
├──────────────────────────────────────────────────────────────┤
│ Código │ Desconto │ Mín │ Uso (barra) │ Validade │ ✓ │ ⋮     │
│ KOTEN12│ 12% OFF  │ R$30│ ▓▓▓░ 12/100 │ ●Válido  │ on│ ...   │
│   └─ histórico expansível ao clicar na linha                 │
└──────────────────────────────────────────────────────────────┘
```

Largura total (`container-fluid`-style: `px-4 py-6`, sem `max-w`). Mesma h-14 de header preservada.

## KPIs (topo)

4 cards usando `bg-card`/`text-foreground`:

1. **Cupons ativos** — `count(is_active && valid_until > now)`.
2. **Usos hoje** — `count(delivery_orders where coupon_code in active_codes and created_at::date = today)`.
3. **Economia gerada no período** — `sum(discount)` dos pedidos com `coupon_code` preenchido (período padrão: últimos 30 dias, com seletor simples mais tarde — v1 fixo 30d).
4. **Vencendo em 7 dias** — `count(valid_until between now and now+7d)` + badge laranja (`bg-orange-500/15 text-orange-600`) usando tokens semânticos.

## Tabela de cupons

Substitui os grids de cards. Componente `CouponsTable`. Colunas:

- **Código** — `font-mono` em destaque + botão `Copy` inline.
- **Desconto** — Badge: percentual → variant `secondary` verde (`bg-emerald-500/15`), fixo → azul (`bg-blue-500/15`). Texto: "12% OFF" ou "R$ 10,00 OFF".
- **Pedido mínimo** — `formatBRL` ou `—`.
- **Uso** — `Progress` (shadcn) + label `12/100 usados`.
- **Validade** — data + dot colorido: verde (>7d), amarelo (≤7d), vermelho (vencido).
- **Ativo** — `Switch` shadcn, dispara `useUpdateCoupon` (otimista).
- **Ações** — `DropdownMenu` (⋮) com: Editar, Copiar link, Ver QR Code, Excluir. Padrão da memória de Resource Action Menu.

Linha clicável expande painel inline (`<tr>` extra) com **Histórico de uso** — tabela secundária: data, nº pedido, cliente, total, desconto. Rodapé: "Economia total gerada por este cupom: R$ X". Hook novo: `useCouponUsageHistory(code)` consultando `delivery_orders`.

## Filtros (topo da tabela)

- `Input` busca por código (substring case-insensitive).
- `Select` status: Todos / Ativos / Inativos / Vencidos (lembrar regra: usar `'none'` internamente, mapear para string vazia).
- `Select` tipo: Todos / Percentual / Valor fixo.
- `Select` ordenar: Mais usados (`usage_count desc`) / Validade (`valid_until asc`) / Criação (`created_at desc`, padrão).

Todos client-side sobre o array do `useDeliveryCoupons`.

## Drawer lateral (Sheet) substituindo o Dialog

Novo `CouponSheet` usando `Sheet side="right"` largura `sm:max-w-xl`. Substitui o uso atual de `CouponDialog` (mantém o arquivo só se ainda referenciado externamente; a tab passa a usar o sheet).

Conteúdo:

- **Código** — Input + botão "Gerar automaticamente" (8 chars alfanuméricos maiúsculos). Validação em tempo real: duplicado consultando `delivery_coupons` por `code` (debounced) → mensagem inline vermelha.
- **Tipo de desconto** — dois botões grandes (`ToggleGroup` ou dois `Button` com `variant` ativo), cada um com ícone (Percent / DollarSign) e label.
- **Valor** — `CurrencyInput` ou número (% com max 100).
- **Pedido mínimo** — `CurrencyInput`.
- **Desconto máximo** (se %) — `CurrencyInput`.
- **Limite total de uso** — Input numérico.
- **Limite por cliente** — Input numérico (0 = ilimitado), nova coluna `per_customer_limit`.
- **Válido apenas na primeira compra** — `Switch`, nova coluna `first_order_only`.
- **Validade (de/até)** — Inputs `type=date`. Validação: `valid_from <= valid_until` e não pode estar no passado para novos.
- **Descrição interna** — `Textarea`, nova coluna `internal_notes`. Hint: "Visível só para sua equipe".
- **Resumo lateral** — pequeno preview do cupom como será exibido ao cliente.

Validação com `zod` no submit + erros inline. Botões: Cancelar (esquerda) e Salvar (direita).

## Link compartilhável + QR Code

Já existe `buildPublicMenuUrl`. Novo dialog `CouponShareDialog` aberto via ação "Ver QR Code":

- Mostra URL `…?cupom=CODE`.
- Renderiza QR Code usando `qrcode.react` (já em uso para WhatsApp? checar; se não, adicionar dep `qrcode.react`).
- Botões: Copiar link, Baixar PNG (via canvas → blob), Compartilhar no WhatsApp (`https://wa.me/?text=...`).

## Estado vazio

Quando `coupons.length === 0` e sem filtros: card grande centralizado com ilustração simples (ícone `Ticket`), título "Crie seu primeiro cupom" e botão primário grande.

Quando há cupons mas filtros zeram resultado: mensagem leve "Nenhum cupom corresponde aos filtros".

## Arquivos a criar/editar

Criar:
- `supabase/migrations/<ts>_coupons_extra_fields.sql` — adiciona 3 colunas.
- `src/components/delivery/coupons/CouponsKPIs.tsx`
- `src/components/delivery/coupons/CouponsFilters.tsx`
- `src/components/delivery/coupons/CouponsTable.tsx`
- `src/components/delivery/coupons/CouponRow.tsx` (com expansão de histórico)
- `src/components/delivery/coupons/CouponSheet.tsx` (drawer de criação/edição)
- `src/components/delivery/coupons/CouponShareDialog.tsx` (link + QR)
- `src/components/delivery/coupons/CouponUsageHistory.tsx`
- `src/components/delivery/coupons/EmptyCouponsState.tsx`
- `src/hooks/use-coupon-usage-history.ts`
- `src/hooks/use-coupons-stats.ts` (KPIs derivados)

Editar:
- `src/components/delivery/CouponsTab.tsx` — vira o shell que compõe KPIs + Filters + Table + Sheet + Dialogs.
- `src/hooks/use-delivery-coupons.ts` — estender tipo `DeliveryCoupon` com `per_customer_limit`, `first_order_only`, `internal_notes`.
- `src/pages/pdv/delivery/Coupons.tsx` — remover `container max-w` para layout full width.

Manter (sem mudar): `CouponDialog.tsx` (deprecado neste fluxo; será removido após confirmação de que não é usado em outro lugar — `rg` mostrou só `CouponsTab`).

## Dependência nova

`qrcode.react` (≈3 KB) para o QR Code. Adicionar via `bun add qrcode.react`.

## Não inclui (fora de escopo)

- Editor de período dos KPIs (fica fixo em 30 dias na v1).
- Histórico exportável CSV (pode vir depois).
- Aplicação de regras `first_order_only`/`per_customer_limit` no checkout — esta etapa só persiste os campos; aplicação no validador do carrinho fica como follow-up explícito.

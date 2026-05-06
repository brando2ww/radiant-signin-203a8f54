# Reformular tela "Acompanhar Pedido"

Hoje a tela aparece como dialog centralizado e tem layout pouco amigável (lista crua de etapas, sem destaque do status atual, sem hierarquia visual). Vamos transformar em um **bottom sheet** que sobe da parte de baixo no mobile e ficar como dialog centralizado em telas grandes, com UX mais clara.

## 1. Trocar Dialog por Sheet (bottom) na etapa de tracking

Em `src/components/public-menu/CheckoutFlow.tsx`:

- Quando `currentStep === "tracking"`, **não** renderizar dentro do `<Dialog>` atual. Em vez disso, renderizar um `<Sheet side="bottom">` separado (componente `@/components/ui/sheet`) controlado pelo mesmo `open`.
- O Sheet terá:
  - `side="bottom"`
  - Altura: `h-[92vh]` no mobile, `sm:h-auto sm:max-h-[85vh]` em telas maiores
  - Cantos arredondados no topo (`rounded-t-2xl`)
  - Indicador de "puxar" (drag handle): uma barrinha `h-1 w-12 rounded-full bg-muted` centralizada no topo
  - Conteúdo scrollável internamente; rodapé sticky com botões
- O Dialog original continua usado para os outros steps (phone, address, payment, confirmation).

## 2. Redesenhar `OrderTrackingView.tsx`

Reorganizar o conteúdo em blocos com hierarquia clara:

### a) Header de status (hero)

Bloco no topo com fundo `bg-muted/40 rounded-xl p-4`:
- Ícone grande do status atual (ex.: `Clock`, `ChefHat`, `Bike`, `CheckCircle2`) à esquerda dentro de um círculo `bg-primary/10`
- Título grande do status atual ("Em preparo", "Saiu para entrega", etc.)
- Subtítulo curto explicativo ("Seu pedido está sendo preparado pela cozinha")
- Pedido `#0042` e tempo decorrido em badge pequeno

Mapeamento status → label/descrição/ícone fica numa constante no topo do arquivo.

### b) Timeline vertical compacta

Substituir a lista atual por timeline vertical com **linha conectora** entre os ícones:
- Etapas concluídas: ícone preenchido + linha sólida
- Etapa atual: ícone com pulse + linha tracejada para a próxima
- Futuras: ícone outline + linha pontilhada `border-muted`
- Cada etapa mostra label e, quando concluída, horário (ex.: "15:32")
- Para pedidos offline, etapa "Aguardando pagamento no caixa" entra entre "Saiu para entrega" e "Entregue"
- Indicador secundário "Você confirmou recebimento às HH:MM" aparece sob "Saiu para entrega" quando `customer_delivery_confirmed_at` está setado (não substitui passo).

### c) Card de pagamento

Manter card de forma de pagamento, mas:
- Para online pago: badge verde "Pago"
- Para offline: badge amarelo "Pagar na entrega" + linha de troco quando aplicável
- Total em destaque à direita

### d) Banner de ação contextual

Substituir o aviso atual e bloco de confirmação por um único banner colorido por contexto, exibido logo abaixo do header:
- Status `delivering` + offline + não pago → amarelo "Tenha o pagamento pronto" com troco
- Status `delivering` + ainda não confirmou recebimento → neutro com botão grande "Já recebi meu pedido"
- Já confirmou → verde "Recebimento confirmado às HH:MM" (texto adicional explicando que o restaurante ainda registra o pagamento, se offline)
- Cancelado → vermelho com motivo

### e) Rodapé sticky

Container fixo no fim com `border-t bg-background p-4 sticky bottom-0`:
- Botão primário grande "Confirmar recebimento" (quando aplicável); senão botão "Fechar" outline em largura total
- Quando ambos cabíveis (recebimento ainda não confirmado): "Confirmar recebimento" primário + "Fechar" secundário em coluna no mobile, lado a lado em `sm:`

## 3. Detalhes técnicos

- Importar `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle` de `@/components/ui/sheet`.
- Usar `Lucide`: `ClipboardList`, `ChefHat`, `Bike`, `CheckCircle2`, `Clock`, `XCircle`, `AlertCircle`, `Banknote`, `CreditCard`, `Smartphone`.
- Cores: respeitar tokens (`bg-card`, `text-foreground`, `bg-muted`, `border-primary`, `bg-primary/10`); evitar gradientes/cores fora do design system (memory rule).
- Datas formatadas com `date-fns` + `ptBR` locale para "às HH:mm".
- Manter contrato de props (`orderId`, `onClose`) e regras de RLS já implementadas (somente coluna `customer_delivery_confirmed_at`).
- Não alterar fluxo de pagamento — confirmação de pagamento continua exclusiva do caixa.

## Arquivos afetados

- `src/components/public-menu/CheckoutFlow.tsx` — usar `Sheet` para o step tracking
- `src/components/public-menu/checkout/OrderTrackingView.tsx` — reescrever layout com hero, timeline conectada, banner contextual, rodapé sticky

Sem mudanças em banco, hooks ou regras de negócio.

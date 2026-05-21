## Correção global do lock de `pointer-events` (Radix Dialog/Sheet)

A causa raiz já é conhecida: o Radix UI define `pointer-events: none` no `<body>` enquanto um overlay está montado e, em certas condições (Sheet/Dialog aberto a partir de outro Dialog/Dropdown, fechamento rápido, desmontagem fora de ordem), o estilo fica preso após o último overlay fechar. Em vez de corrigir página por página, vamos adicionar um guard global.

### O que vou fazer

1. **Criar `src/components/RadixBodyUnlock.tsx`** — componente sem UI montado uma única vez no `App`. Ele instala um `MutationObserver` em `document.body` que observa mudanças em `style` e em `data-scroll-locked`. Sempre que detecta `pointer-events: none` no body, verifica se ainda existe algum overlay Radix aberto no DOM:
   ```ts
   const hasOpenOverlay = !!document.querySelector(
     '[data-radix-popper-content-wrapper], [role="dialog"][data-state="open"], [data-state="open"][data-radix-dialog-overlay], [data-state="open"][data-radix-sheet-overlay]'
   );
   ```
   Se não houver, limpa: `document.body.style.pointerEvents = ''` e remove `overflow: hidden` residual quando aplicável. Roda com `requestAnimationFrame` para evitar competir com a animação de saída do Radix.

2. **Montar `<RadixBodyUnlock />` em `src/App.tsx`** logo dentro do `TooltipProvider`, antes do `BrowserRouter`. Sem props, custo zero quando não há diálogos abertos.

3. **Reforço no `SheetContent`** (`src/components/ui/sheet.tsx`): adicionar um `useEffect` de cleanup que, ao desmontar o componente, dispara o mesmo check do guard (limpa o body se nenhum overlay restou). Isso cobre o caso de o Sheet ser desmontado abruptamente (navegação, troca de rota).

4. **Não tocar em cada Sheet/Dialog individualmente.** A correção fica concentrada em 2 arquivos e protege todo o app — incluindo páginas que ainda nem foram escritas.

### Por que essa abordagem

- É o workaround padrão e mais discutido para o bug do Radix (issues #1241, #2152 do `@radix-ui/react-dialog`).
- Não interfere quando há um overlay realmente aberto (o check protege isso).
- Não altera o comportamento dos componentes existentes — só limpa estado órfão.

### Arquivos

- criar: `src/components/RadixBodyUnlock.tsx`
- editar: `src/App.tsx` (montar o componente)
- editar: `src/components/ui/sheet.tsx` (cleanup no unmount do `SheetContent`)

Sem mudanças de banco, hooks de negócio ou rotas.

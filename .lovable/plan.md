# Animações da linha do tempo do pedido

Arquivo: `src/components/public-menu/checkout/OrderTrackingView.tsx` + `tailwind.config.ts` (novos keyframes) + `src/index.css` (regra `prefers-reduced-motion`).

## Estados visuais

**Concluída**
- Círculo preenchido (`bg-primary`), check estático.
- Conector inferior 100% `bg-primary`.
- Texto `font-medium text-foreground`.

**Atual** (próxima a concluir)
- Círculo levemente maior (`h-8 w-8` vs `h-7 w-7` das demais).
- Borda `border-primary`, fundo `bg-primary/10`.
- Animação `pulse-ring`: pseudo-elemento absoluto que escala de 1→1.6 com fade-out (2s loop, ease-out).
- Ícone `Clock` interno gira lentamente (spinner sutil, 3s linear).
- Conector inferior com gradient animado descendo (`fill-down` 2s loop) sobre fundo `bg-muted`.
- Texto `font-semibold text-foreground`.

**Futura**
- Círculo `border-muted bg-background`, dot cinza.
- Conector tracejado: `border-l-2 border-dashed border-muted` (substitui o `div bg-muted` atual).
- Texto `text-muted-foreground`.

## Transições

Quando uma etapa muda de atual → concluída (detectado via `useEffect` comparando `order.status` anterior):
- Check entra com `check-draw`: scale 0.5 → 1.1 → 1 + opacity 0→1 (500ms, spring-like via cubic-bezier).
- Conector preenche top→bottom usando `clip-path: inset(0 0 100% 0)` → `inset(0)` (600ms ease-out).
- Próxima etapa inicia pulse logo em seguida.
- Duração total ~700ms.

## Entrada da tela

- Cada `<li>` da timeline entra com `fade-in-up` (existente) + delay escalonado: `style={{ animationDelay: ${idx * 100}ms }}`.
- Etapas concluídas já renderizam com check preenchido (sem `check-draw`, só no momento da transição em tempo real).
- Pulse da etapa atual inicia após o último stagger (delay = `steps.length * 100ms`).

## Implementação técnica

**`tailwind.config.ts`** — adicionar keyframes/animations:
- `pulse-ring`: `0% { transform: scale(1); opacity: .6 } 100% { transform: scale(1.6); opacity: 0 }` (2s infinite ease-out).
- `check-draw`: `0% { transform: scale(.5); opacity: 0 } 60% { transform: scale(1.15); opacity: 1 } 100% { transform: scale(1); opacity: 1 }` (500ms).
- `fill-down`: linha vertical com gradient mascarado descendo (2s linear infinite).
- `spin-slow`: 3s linear infinite.
- `fade-in-up`: já existe via `fade-in`; reutilizar.

**`OrderTrackingView.tsx`**:
- Refatorar o bloco do círculo do step para suportar wrapper relativo + span absoluto com `animate-pulse-ring` quando `current`.
- Ref a `prevStatusRef` para disparar `check-draw` somente em steps recém-concluídos.
- Conectores: 3 variantes (concluído sólido, atual com `fill-down`, futuro tracejado).
- Aplicar `style={{ animationDelay }}` em cada `<li>` com classe `animate-fade-in`.

**`src/index.css`** — adicionar:
```css
@media (prefers-reduced-motion: reduce) {
  .animate-pulse-ring, .animate-check-draw, .animate-fill-down,
  .animate-spin-slow, .animate-fade-in { animation: none !important; }
}
```

## Fora de escopo
- Não alterar lógica de status, realtime ou rodapé.
- Sem novas dependências (sem Framer Motion); usar Tailwind/CSS puro.

## Objetivo
Permitir múltiplos turnos (1 a 3) por dia em "Horários de Funcionamento" — tanto em **Administrador > Configurações > Geral** (PDV) quanto em **Delivery > Configurações** — com validação de sobreposição e exibição de todos os turnos no cardápio público.

## Modelo de dados (retrocompatível, sem migração SQL)
`business_hours` é `JSONB` nos dois lados (`pdv_settings` e `delivery_settings`). Estender o formato:

```ts
{
  [day]: {
    closed?: boolean;
    shifts: { open: string; close: string }[]; // novo, 1..3 itens
    // campos legados open/close/is_closed permanecem gravados para retrocompatibilidade
  }
}
```

Helpers em **novo arquivo** `src/lib/business-hours.ts`:
- `normalizeDayHours(raw)` — aceita formato legado (`{open, close, is_closed|closed}`) e converte para `{closed, shifts:[{open,close}]}`.
- `serializeDayHours({closed, shifts})` — devolve objeto com `shifts` + `open`/`close`/`is_closed`/`closed` do 1º turno (compat).
- `hasShiftOverlap(shifts)` — valida sobreposição considerando turnos que cruzam meia-noite.
- `formatTodayShifts(hours, dayKey)` — retorna string `"12h–15h e 18h–22h"`.

## UI compartilhada
**Novo componente** `src/components/shared/BusinessHoursEditor.tsx`:
- Lista os 7 dias da semana.
- Cabeçalho do dia: nome + switch "Aberto/Fechado" (Fechado desabilita todos os inputs do dia).
- Lista de turnos numerados ("Turno 1", "Turno 2"...) com `Abertura — Fechamento — [🗑]`.
- Lixeira oculta quando há apenas 1 turno.
- Botão "+ Adicionar turno" abaixo da lista (oculto quando há 3 turnos).
- Validação inline: mensagem em `text-destructive` abaixo do dia quando `hasShiftOverlap` detecta conflito.
- Props: `value: BusinessHours`, `onChange`, `errors` (computados internamente).
- Expõe `hasErrors` via callback para o pai bloquear o salvamento.

## Integração nos dois pontos
1. **`src/components/pdv/settings/GeneralTab.tsx`** — substituir o bloco atual (linhas 161–219) pelo `BusinessHoursEditor` controlado via `form.watch("business_hours")` + `form.setValue`. Bloquear submit se houver overlap.
2. **`src/components/delivery/settings/BusinessHoursSettings.tsx`** — substituir o conteúdo do `CardContent` pelo mesmo `BusinessHoursEditor`. Bloquear botão "Salvar Horários" se houver overlap.

## Lógica "aberto agora" — `src/lib/delivery-hours.ts`
- `isStoreCurrentlyOpen`: normalizar via `normalizeDayHours`, iterar `shifts[]` do dia atual e do anterior (para turnos cruzando meia-noite).
- `getNextOpenLabel`: escolher o próximo `open` mais cedo entre todos os turnos futuros.

## Cardápio público
Em `src/components/public-menu/PublicMenuHeader.tsx` (e demais consumidores que exibirem horário do dia — `ShoppingCart.tsx`, `OrderConfirmation.tsx` se aplicável), substituir a exibição de turno único por `formatTodayShifts(...)`:
> "Aberto hoje: 12h–15h e 18h–22h"

## Validação de sobreposição
Cada turno vira intervalo em minutos. Turno que cruza meia-noite (`close <= open`) é tratado como dois intervalos `[open, 1440)` e `[0, close)`. Sobreposição = interseção não vazia entre qualquer par de turnos do mesmo dia.

## Arquivos tocados
- **Novo**: `src/lib/business-hours.ts`
- **Novo**: `src/components/shared/BusinessHoursEditor.tsx`
- Editar: `src/components/pdv/settings/GeneralTab.tsx`
- Editar: `src/components/delivery/settings/BusinessHoursSettings.tsx`
- Editar: `src/lib/delivery-hours.ts`
- Editar: `src/components/public-menu/PublicMenuHeader.tsx` (e outros consumidores onde fizer sentido)

## Fora de escopo
- Migração SQL (campo já é JSONB; normalização lê o formato legado).
- Múltiplos fusos horários (segue usando America/Sao_Paulo).
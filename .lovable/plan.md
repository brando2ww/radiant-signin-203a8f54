# Corrigir remoção de turno em "Horários de funcionamento"

## Problema
Em Admin > Configurações > Horários de funcionamento, dá para adicionar um segundo turno mas a opção de excluir não aparece de forma clara.

## Causa
Em `src/components/shared/BusinessHoursEditor.tsx` o botão de remoção:
- só renderiza quando há > 1 turno (vira um `<div className="w-10" />` invisível caso contrário);
- é um `Button variant="ghost" size="icon"` apenas com ícone, sem rótulo — visualmente passa despercebido ao lado dos inputs de horário.

## Solução
Editar apenas `src/components/shared/BusinessHoursEditor.tsx`:

1. Sempre renderizar o botão "Remover" em cada turno (sem placeholder vazio).
2. Mudar para `variant="outline"` com ícone `Trash2` + texto "Remover" (texto oculto em telas pequenas via `hidden sm:inline`).
3. Quando só houver 1 turno, manter o botão visível porém `disabled`, com `title`/tooltip "Pelo menos 1 turno é obrigatório".
4. Manter `type="button"` e a lógica atual de `removeShift` (que já bloqueia remover o último).

## Fora de escopo
- Mudar `MAX_SHIFTS_PER_DAY`, formato persistido, ou estilos dos demais controles.
- Mexer em `BusinessHoursSettings` do delivery (usa o mesmo componente e herda o fix).

# Corrigir travamento ao editar grupos de composição

## Problema

No `ProductCompositionManager.tsx`, dentro do `GroupCard`, os campos **Nome do grupo**, **Mín.**, **Máx.** e a quantidade do item disparam `onUpdateGroup` / `onUpdateItemQty` a **cada tecla digitada**. Cada chamada faz:

1. UPDATE no Supabase
2. Invalidação da query `pdv-composition-groups`
3. Refetch + re-render

Resultado: a digitação trava, o cursor pula e clicar em **excluir** (lixeira) frequentemente é "engolido" porque o componente está re-renderizando no meio da ação. O mesmo padrão afeta a quantidade do sub-produto.

## Solução

Usar **estado local** nos inputs e persistir apenas em `onBlur` (e `Enter`), mantendo o valor sincronizado quando os dados do servidor mudam.

### Mudanças em `src/components/pdv/ProductCompositionManager.tsx`

1. **Input "Nome do grupo"** (linha 269):
   - Criar `const [localName, setLocalName] = useState(group.name)` no `GroupCard`.
   - `useEffect` para ressincronizar quando `group.name` mudar externamente.
   - `onChange` atualiza apenas o estado local.
   - `onBlur` e `onKeyDown` (Enter) chamam `onUpdateGroup({ name: localName })` somente se mudou.

2. **Inputs "Mín." e "Máx."** (linhas 313 e 324):
   - Mesmo padrão: estado local `localMin` / `localMax`, salvar em `onBlur`/Enter.

3. **Quantidade do sub-produto** (linha 397, dentro do `.map`):
   - Extrair item para um pequeno componente `ItemRow` (ou usar `useState` local por linha) para guardar `localQty` e salvar em `onBlur`/Enter via `onUpdateItemQty`.

4. **Botões de excluir** (lixeira do grupo e do item):
   - Sem mudança de lógica; a melhoria acima já elimina os re-renders por tecla que faziam o clique falhar. Manter `type="button"` (já está) garante que não dispara submit.

### Por que isso resolve o "travamento da exclusão"

Hoje cada keystroke invalida a query e o React Query refaz o fetch enquanto o usuário ainda interage. Quando o clique no `Trash2` acontece durante esse ciclo, o nó é desmontado/remontado e o `onClick` se perde. Salvando só em `onBlur`, não há refetch durante a digitação e o clique no excluir ocorre sobre um DOM estável.

### Observações

- Nenhuma mudança no hook `use-pdv-composition-groups.ts` (a invalidação continua igual, mas agora ocorre apenas 1× ao sair do campo).
- Nenhuma migração de banco necessária.
- Comportamento visível: o valor digitado aparece imediatamente; é gravado quando o foco sai do campo ou ao pressionar Enter.

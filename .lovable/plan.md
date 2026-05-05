## Problema

Garibaldi/RS usa CEP "geral" 95720-000 para quase todos os logradouros — ou seja, o ViaCEP responde apenas com `bairro: "Centro"` (ou string vazia) para o prefixo 95720. A varredura atual cobre só **um** prefixo de 5 dígitos (95720-000 a 95720-999), e nesse intervalo realmente existe pouca coisa além do "Centro". Pela referência do usuário, a faixa válida da cidade vai de **95720-000 até 95725-999** (6 prefixos).

Mesmo varrendo todos os 6 prefixos, o ViaCEP não vai listar os ~20 bairros oficiais, porque eles compartilham o CEP geral. Então precisamos de duas melhorias combinadas.

## Mudanças

### 1. `src/hooks/use-cep-range-sweep.ts` — varredura multi-prefixo

- Nova assinatura: `sweepCepRange(prefixStart: string, prefixEnd: string, options)` (mantém overload de 1 argumento por compat).
- Itera de `prefixStart` até `prefixEnd` (inclusive). `total = (end - start + 1) * 1000`.
- Cache continua por prefixo individual em `localStorage`, então prefixos já varridos são pulados (somam direto ao resultado).
- `detectCityCepPrefix` retorna agora `{ start, end }` (ambos iguais por padrão, usuário ajusta).

### 2. `NeighborhoodSelectorModal.tsx` e `CepRangeSweepPanel.tsx` — UI de faixa

- Trocar o input único de prefixo por **dois inputs**: "De 95720" — "Até 95725" (5 dígitos cada).
- Display: "Faixa: 95720-000 até 95725-999".
- Botão "Varrer" usa o intervalo. Barra de progresso mostra `done/total` somando todos os prefixos.

### 3. Entrada manual de bairros (fallback para CEP geral)

No `NeighborhoodSelectorModal`, adicionar uma terceira seção **"Adicionar bairro manualmente"**:
- Input de texto + botão "Adicionar".
- Bairro adicionado entra na mesma lista de selecionáveis (badge "manual").
- Persistido em `localStorage` por cidade (chave `manual-neighborhoods:{uf}-{city}`) para reaproveitar entre sessões.
- Resolve casos como Garibaldi onde o ViaCEP não devolve a lista oficial.

### 4. Aviso quando varredura traz pouco resultado

Após a varredura, se `neighborhoods.length <= 1`, mostrar alerta:
> "Esta cidade usa CEP geral. Os bairros não aparecem no ViaCEP — adicione-os manualmente abaixo."

## Detalhes técnicos

- `use-cep-range-sweep.ts`: laço externo por prefixo, laço interno por chunk de 8 CEPs, abort propagado. Ajusta cache para escrever por prefixo ao terminar cada um (não só no fim).
- Validação dos inputs: ambos 5 dígitos, end >= start, diferença máxima 9 (10.000 CEPs = ~1.250 requests, ainda viável).
- Manual neighborhoods: array simples `string[]` em localStorage, mesclado no início + dedupe case-insensitive com os varridos.

## Não inclui

- Não voltamos ao IBGE (já descartado por entregar setores em vez de bairros).
- Não muda o schema do banco — bairros manuais entram normalmente em `delivery_zones` ao confirmar.

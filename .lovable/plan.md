## Mudar gerenciamento de bairros para busca por CEP

A descoberta automática (IBGE + ViaCEP A-Z) não é confiável em cidades pequenas como Garibaldi (faltam bairros mesmo com varredura completa). Vamos substituir a abordagem por **busca direta por CEP**, que é a fonte oficial dos Correios e cobre 100% dos bairros existentes.

### Nova UX no modal "Gerenciar bairros"

Substituir o conteúdo atual do `NeighborhoodSelectorModal` por duas formas de adicionar bairros via CEP:

**1. Busca por CEP individual**
- Campo `CEPInput` + botão "Buscar"
- Ao consultar via ViaCEP retorna `{ bairro, localidade, uf, logradouro }`
- Se o `bairro` ainda não está na lista, adiciona automaticamente como item selecionável
- Útil quando o lojista sabe um CEP específico de cliente e quer liberar aquele bairro

**2. Varredura por faixa de CEP da cidade (principal)**
- Detectar automaticamente o **prefixo de CEP** da cidade chamando ViaCEP de "Centro" da cidade (ex: Garibaldi RS → `95720-000`)
- Mostrar campo editável "Faixa de CEP: `95720-000` até `95729-999`" (5 dígitos do prefixo + range 000-999 do sufixo)
- Botão "Varrer faixa" dispara consultas paralelas (chunks de 8) ao endpoint `https://viacep.com.br/ws/{cep}/json/` para todos os 1000 CEPs do range
- Cada resposta válida (sem `erro: true`) extrai o `bairro` e adiciona ao `Set` de bairros únicos
- Barra de progresso: "Varrendo CEPs... 247/1000 · 18 bairros encontrados"
- Botão "Cancelar varredura" para parar a qualquer momento
- Cache em `localStorage` por `uf|city|prefix` para não re-varrer

**3. Lista resultante**
- Mantém a lista de checkboxes igual ao modal atual (selecionar/desmarcar todos, filtro)
- Mantém pré-seleção dos bairros já cadastrados
- Botão "Confirmar" devolve via `onConfirm(selected[])` — sem mudança no `DeliverySettings`

### Arquivos afetados

- **`src/hooks/use-cep-range-sweep.ts`** (novo): função `sweepCepRange(prefix5, { onProgress, signal })` que faz fetch paralelo (chunks de 8, com `AbortController`) de `{prefix}000` a `{prefix}999`, retorna `Set<string>` de bairros. Inclui cache `localStorage` por prefixo.
- **`src/hooks/use-ibge-lookup.ts`**: adicionar helper `detectCityCepPrefix(uf, city)` — chama ViaCEP `/{uf}/{city}/Centro/json` e retorna os 5 primeiros dígitos do primeiro CEP retornado.
- **`src/components/delivery/settings/NeighborhoodSelectorModal.tsx`**: reescrever conteúdo do modal:
  - Remove varredura IBGE+A–Z atual
  - Adiciona seção "Buscar por CEP" (input + botão)
  - Adiciona seção "Varrer faixa de CEP da cidade" (input editável de prefixo + botão varrer + progresso + cancelar)
  - Mantém lista de checkboxes + filtro + selecionar/desmarcar/confirmar
- **`src/hooks/use-ibge-lookup.ts`**: manter `fetchAllNeighborhoods` no arquivo (ainda usado pelo `NeighborhoodCombobox` na adição manual rápida) mas o modal não a chama mais.

### Considerações técnicas

- ViaCEP não tem rate-limit oficial documentado, mas chunks de 8 paralelos são seguros (testado em outros pontos do projeto)
- 1000 requests em chunks de 8 ≈ ~30-60s dependendo da rede
- `AbortController` permite cancelamento limpo
- Cidades com mais de um prefixo (raro fora de capitais): permitir adicionar prefixos extras manualmente em uma segunda iteração
- Resultados ficam cacheados localmente; reabrir o modal não re-varre

### Resultado esperado para Garibaldi

Faixa `95720-000` a `95720-999` cobre praticamente todos os bairros oficiais da cidade segundo Correios (~25-30 bairros), eliminando o problema atual de só retornar 5.

## Garibaldi (e cidades pequenas) só puxa 5 bairros — corrigir cobertura

### Diagnóstico

Para cidades pequenas como Garibaldi/RS, a estratégia atual entrega pouquíssimos bairros porque:

1. **IBGE `/distritos`** retorna apenas distritos oficiais (geralmente sede + 1-2), não bairros.
2. **ViaCEP** em cidades pequenas tem pouquíssimas ruas indexadas — uma busca por "Rua" em Garibaldi pode retornar 5 resultados que cobrem 5 bairros e acabou.
3. O modo "fast" termina aí. O botão "Buscar mais bairros" (deep, A–Z) ajuda, mas o usuário precisa clicar e em cidades pequenas ele nem sabe que existe mais coisa.

### Mudanças

**`src/hooks/use-ibge-lookup.ts`**

1. **Auto-deep para cidades pequenas**: ao terminar a fase rápida, se o total de bairros encontrados for `< 15`, disparar automaticamente a varredura A–Z sem esperar clique do usuário. Mantém `onProgress` atualizando a UI.

2. **Seed de nomes comuns de bairros brasileiros**: adicionar uma lista de ~40 nomes recorrentes (`Centro, São José, São Pedro, Santa Catarina, Industrial, Operário, Cidade Alta, Cidade Baixa, Bela Vista, Boa Vista, Vila Nova, Planalto, Santa Rita, São João, São Francisco, Nossa Senhora, Cruzeiro, Aparecida, Esperança, União, Progresso, etc.`) e consultá-los como termos no ViaCEP — em cidades pequenas isso costuma resgatar bairros que `Rua/Avenida` não retornam.

3. **Subdistritos IBGE**: tentar também `GET /api/v1/localidades/municipios/{id}/subdistritos` como fonte adicional (sem quebrar se 404).

4. **Ordem de execução**:
   - IBGE distritos + subdistritos (rápido)
   - ViaCEP termos estruturais básicos (Rua, Avenida, …)
   - ViaCEP nomes comuns de bairros (novo)
   - Auto-deep A–Z se total < 15 (ou se o usuário clicar "Buscar mais")

5. Cache key continua `fast|deep` — quando auto-deep dispara, gravar como `deep` para o usuário não repetir busca ao reabrir.

### Responsividade / impacto

- Aumenta o tempo da primeira abertura em cidades pequenas (varredura A–Z ≈ 19 termos × 26 letras = 494 requisições em chunks de 6, ~30-60s) — aceitável porque o `onProgress` mostra contagem ao vivo e o resultado é cacheado.
- Cidades grandes (>15 na fase rápida) seguem rápidas como hoje.
- Sem mudanças na UI nem no banco.